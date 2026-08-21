//! Management API for inbound email receivers.
//!
//! A receiver is a registrable unit: a user registers one for a domain they
//! control, gets a bearer token back, and points a Cloudflare Workers Email
//! handler (or anything else that can POST `/internal/mail/inbound`) at herald
//! with it. Registration is scoped to a session user — herald has no
//! non-session service principal yet, so "a service registers a receiver" means
//! a service acting with a user's session for now.
//!
//! Receivers are shared through their workspace: its membership decides who may
//! administer the unit and bind addresses to it, which is deliberately a
//! different axis from `user_addresses` (who receives the mail). Member editing
//! therefore lives in `routes::workspaces`, not here.

use axum::{
    Json,
    extract::{Path, State},
};
use diesel::{ExpressionMethods, QueryDsl, SelectableHelper};
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    auth::AuthUser,
    error::{ApiResult, AppError},
    models::{
        email_receiver::{EmailReceiverRecord, NewEmailReceiver},
        workspace::Workspace,
    },
    receivers,
    schema::email_receivers,
    state::AppState,
    workspaces::{self, Access},
};

use super::units::{OkResponse, accessible_workspaces, normalize_domain, target_workspace};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailReceiverResponse {
    id: String,
    /// The workspace that owns this receiver and holds its member list.
    workspace_id: String,
    display_name: String,
    mail_domain: Option<String>,
    /// Staging endpoint herald drains recovered mail from, when configured.
    worker_url: Option<String>,
    /// Last characters of the inbound token, so a user can tell receivers apart.
    token_hint: String,
    /// True for the shared deployment-wide receiver (one in the system workspace).
    is_system: bool,
    /// What the requesting user may do with this receiver.
    access: String,
    is_active: bool,
    created_at: String,
}

/// Registration response — the only time the inbound token is ever readable.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailReceiverWithTokenResponse {
    #[serde(flatten)]
    receiver: EmailReceiverResponse,
    /// Plaintext inbound token. Store it now; only its hash is kept.
    inbound_token: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEmailReceiverRequest {
    /// Workspace to register into. Defaults to the caller's own.
    workspace_id: Option<String>,
    display_name: String,
    /// Domain this receiver accepts mail for. Claimed first-come.
    mail_domain: Option<String>,
    /// Staging endpoint herald drains recovered mail from.
    worker_url: Option<String>,
    /// Bearer token herald uses against `worker_url`.
    worker_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEmailReceiverRequest {
    display_name: Option<String>,
    worker_url: Option<String>,
    worker_token: Option<String>,
    is_active: Option<bool>,
}

pub async fn list_email_receivers(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Vec<EmailReceiverResponse>>> {
    let records = receivers::list_available(&state, user.id).await?;

    let mut conn = state.db.get().await?;
    let reachable = accessible_workspaces(&mut conn, user.id).await?;

    // `list_available` selects on exactly these workspaces, so every row
    // resolves; anything that does not is a row the caller cannot reach.
    Ok(Json(
        records
            .iter()
            .filter_map(|record| {
                reachable
                    .get(&record.workspace_id)
                    .map(|(workspace, access)| receiver_response(record, workspace, *access))
            })
            .collect(),
    ))
}

pub async fn create_email_receiver(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(input): Json<CreateEmailReceiverRequest>,
) -> ApiResult<Json<EmailReceiverWithTokenResponse>> {
    let display_name = input.display_name.trim();
    if display_name.is_empty() || display_name.chars().count() > 120 {
        return Err(AppError::BadRequest(
            "display_name is required and must be 120 characters or fewer".into(),
        ));
    }

    let mut conn = state.db.get().await?;
    let workspace = target_workspace(&mut conn, user.id, input.workspace_id.as_deref()).await?;

    let mail_domain = normalize_domain(input.mail_domain.as_deref())?;
    if let Some(domain) = mail_domain.as_deref() {
        if receivers::find_for_domain(&mut conn, domain)
            .await?
            .is_some()
        {
            return Err(AppError::BadRequest(format!(
                "a receiver is already registered for `{domain}`"
            )));
        }
    }

    let worker_url = trimmed(input.worker_url.as_deref());
    if let Some(url) = worker_url.as_deref() {
        if url::Url::parse(url).is_err() {
            return Err(AppError::BadRequest(
                "worker_url must be a valid URL".into(),
            ));
        }
    }
    let worker_token = trimmed(input.worker_token.as_deref());
    // Draining a staging endpoint needs both halves; one without the other
    // would silently never recover anything.
    if worker_url.is_some() != worker_token.is_some() {
        return Err(AppError::BadRequest(
            "worker_url and worker_token must be provided together".into(),
        ));
    }

    let token = receivers::mint_token();
    let config = match worker_url.as_deref() {
        Some(url) => json!({ "worker_url": url }),
        None => json!({}),
    };
    let secret: Option<Value> = worker_token
        .as_deref()
        .map(|value| json!({ "worker_token": value }));

    let new_receiver = NewEmailReceiver {
        id: state.next_id(),
        workspace_id: workspace.id,
        display_name,
        mail_domain: mail_domain.as_deref(),
        config,
        secret,
        inbound_token_hash: &token.hash,
        inbound_token_hint: &token.hint,
    };

    let inserted = diesel::insert_into(email_receivers::table)
        .values(&new_receiver)
        .returning(EmailReceiverRecord::as_returning())
        .get_result(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "email_receivers.create.insert"))?;

    Ok(Json(EmailReceiverWithTokenResponse {
        receiver: receiver_response(&inserted, &workspace, Some(Access::Admin)),
        inbound_token: token.plaintext,
    }))
}

pub async fn update_email_receiver(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<i64>,
    Json(input): Json<UpdateEmailReceiverRequest>,
) -> ApiResult<Json<EmailReceiverResponse>> {
    let mut conn = state.db.get().await?;
    let record = receivers::load_with_conn(&mut conn, id).await?;
    let workspace = workspaces::load(&mut conn, record.workspace_id).await?;
    workspaces::require_admin(&mut conn, &workspace, user.id).await?;

    let display_name = match input.display_name.as_deref().map(str::trim) {
        Some(value) if value.is_empty() || value.chars().count() > 120 => {
            return Err(AppError::BadRequest(
                "display_name must be between 1 and 120 characters".into(),
            ));
        }
        Some(value) => value.to_owned(),
        None => record.display_name.clone(),
    };

    let mut config = record.config.clone();
    if let Some(url) = trimmed(input.worker_url.as_deref()) {
        if url::Url::parse(&url).is_err() {
            return Err(AppError::BadRequest(
                "worker_url must be a valid URL".into(),
            ));
        }
        config["worker_url"] = json!(url);
    }

    let mut secret = record.secret.clone().unwrap_or_else(|| json!({}));
    if let Some(token) = trimmed(input.worker_token.as_deref()) {
        secret["worker_token"] = json!(token);
    }

    let updated = diesel::update(email_receivers::table.find(record.id))
        .set((
            email_receivers::display_name.eq(display_name),
            email_receivers::config.eq(config),
            email_receivers::secret.eq(Some(secret)),
            email_receivers::is_active.eq(input.is_active.unwrap_or(record.is_active)),
            email_receivers::updated_at.eq(chrono::Utc::now()),
        ))
        .returning(EmailReceiverRecord::as_returning())
        .get_result(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "email_receivers.update.set"))?;

    Ok(Json(receiver_response(
        &updated,
        &workspace,
        Some(Access::Admin),
    )))
}

/// Rotate the inbound token. The previous token stops working immediately, so
/// the receiver must be redeployed with the returned value.
pub async fn rotate_email_receiver_token(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<i64>,
) -> ApiResult<Json<EmailReceiverWithTokenResponse>> {
    let mut conn = state.db.get().await?;
    let record = receivers::load_with_conn(&mut conn, id).await?;
    let workspace = workspaces::load(&mut conn, record.workspace_id).await?;
    workspaces::require_admin(&mut conn, &workspace, user.id).await?;

    let token = receivers::mint_token();
    let updated = diesel::update(email_receivers::table.find(record.id))
        .set((
            email_receivers::inbound_token_hash.eq(&token.hash),
            email_receivers::inbound_token_hint.eq(&token.hint),
            email_receivers::updated_at.eq(chrono::Utc::now()),
        ))
        .returning(EmailReceiverRecord::as_returning())
        .get_result(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "email_receivers.rotate_token.set"))?;

    Ok(Json(EmailReceiverWithTokenResponse {
        receiver: receiver_response(&updated, &workspace, Some(Access::Admin)),
        inbound_token: token.plaintext,
    }))
}

pub async fn delete_email_receiver(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<i64>,
) -> ApiResult<Json<OkResponse>> {
    let mut conn = state.db.get().await?;
    let record = receivers::load_with_conn(&mut conn, id).await?;
    receivers::require_admin(&mut conn, &record, user.id).await?;

    // Addresses bound to it keep existing; the FK nulls their receiver_id, so
    // they stop receiving until they are bound to another receiver. Only
    // addresses under the system receiver's own domain stay deliverable — see
    // `mail::is_deliverable`.
    diesel::delete(email_receivers::table.find(record.id))
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "email_receivers.delete.execute"))?;

    Ok(Json(OkResponse { ok: true }))
}

fn receiver_response(
    record: &EmailReceiverRecord,
    workspace: &Workspace,
    access: Option<Access>,
) -> EmailReceiverResponse {
    EmailReceiverResponse {
        id: record.id.to_string(),
        workspace_id: record.workspace_id.to_string(),
        display_name: record.display_name.clone(),
        mail_domain: record.mail_domain.clone(),
        worker_url: record.worker_url().map(str::to_owned),
        token_hint: record.inbound_token_hint.clone(),
        is_system: workspace.is_system(),
        access: access.map(Access::as_str).unwrap_or("none").to_owned(),
        is_active: record.is_active,
        created_at: record.created_at.to_rfc3339(),
    }
}

fn trimmed(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}
