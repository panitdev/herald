//! Management API for inbound email receivers.
//!
//! A receiver is a registrable unit: a user registers one for a domain they
//! control, gets a bearer token back, and points a Cloudflare Workers Email
//! handler (or anything else that can POST `/internal/mail/inbound`) at herald
//! with it. Registration is scoped to a session user — herald has no
//! non-session service principal yet, so "a service registers a receiver" means
//! a service acting with a user's session for now.
//!
//! Receivers can be shared: membership decides who may administer the unit and
//! bind addresses to it, which is deliberately a different axis from
//! `user_addresses` (who receives the mail).

use axum::{
    extract::{Path, State},
    Json,
};
use diesel::{ExpressionMethods, QueryDsl, SelectableHelper};
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    auth::AuthUser,
    error::{ApiResult, AppError},
    models::{
        email_receiver::{EmailReceiverRecord, NewEmailReceiver, NewEmailReceiverMember},
        user::User,
    },
    receivers::{self, Access},
    schema::{email_receiver_members, email_receivers, users},
    state::AppState,
};

use super::units::{normalize_domain, parse_id, MemberResponse, OkResponse};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailReceiverResponse {
    id: String,
    scope: String,
    display_name: String,
    mail_domain: Option<String>,
    /// Staging endpoint herald drains recovered mail from, when configured.
    worker_url: Option<String>,
    /// Last characters of the inbound token, so a user can tell receivers apart.
    token_hint: String,
    /// True for the shared deployment-wide receiver.
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMemberRequest {
    user_id: String,
    /// `member` (default) or `admin`.
    role: Option<String>,
}

pub async fn list_email_receivers(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Vec<EmailReceiverResponse>>> {
    let records = receivers::list_available(&state, user.id).await?;

    let mut conn = state.db.get().await?;
    let mut out = Vec::with_capacity(records.len());
    for record in &records {
        let access = receivers::access_for(&mut conn, record, user.id).await?;
        out.push(receiver_response(record, access));
    }

    Ok(Json(out))
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

    let mail_domain = normalize_domain(input.mail_domain.as_deref())?;
    if let Some(domain) = mail_domain.as_deref() {
        let mut conn = state.db.get().await?;
        if receivers::find_for_domain(&mut conn, domain).await?.is_some() {
            return Err(AppError::BadRequest(format!(
                "a receiver is already registered for `{domain}`"
            )));
        }
    }

    let worker_url = trimmed(input.worker_url.as_deref());
    if let Some(url) = worker_url.as_deref() {
        if url::Url::parse(url).is_err() {
            return Err(AppError::BadRequest("worker_url must be a valid URL".into()));
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
        scope: "user",
        owner_user_id: Some(user.id),
        owner_group_id: None,
        display_name,
        mail_domain: mail_domain.as_deref(),
        config,
        secret,
        inbound_token_hash: &token.hash,
        inbound_token_hint: &token.hint,
    };

    let mut conn = state.db.get().await?;
    let inserted = diesel::insert_into(email_receivers::table)
        .values(&new_receiver)
        .returning(EmailReceiverRecord::as_returning())
        .get_result(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "email_receivers.create.insert"))?;

    // The owner is an admin by ownership; recording the membership too keeps
    // the sharing list honest about who has access.
    diesel::insert_into(email_receiver_members::table)
        .values(&NewEmailReceiverMember {
            receiver_id: inserted.id,
            user_id: user.id,
            role: Access::Admin.as_str(),
        })
        .on_conflict_do_nothing()
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "email_receivers.create.insert_owner_member"))?;

    Ok(Json(EmailReceiverWithTokenResponse {
        receiver: receiver_response(&inserted, Some(Access::Admin)),
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
    receivers::require_admin(&mut conn, &record, user.id).await?;

    let display_name = match input.display_name.as_deref().map(str::trim) {
        Some(value) if value.is_empty() || value.chars().count() > 120 => {
            return Err(AppError::BadRequest(
                "display_name must be between 1 and 120 characters".into(),
            ))
        }
        Some(value) => value.to_owned(),
        None => record.display_name.clone(),
    };

    let mut config = record.config.clone();
    if let Some(url) = trimmed(input.worker_url.as_deref()) {
        if url::Url::parse(&url).is_err() {
            return Err(AppError::BadRequest("worker_url must be a valid URL".into()));
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

    Ok(Json(receiver_response(&updated, Some(Access::Admin))))
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
    receivers::require_admin(&mut conn, &record, user.id).await?;

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
        receiver: receiver_response(&updated, Some(Access::Admin)),
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

pub async fn list_email_receiver_members(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<i64>,
) -> ApiResult<Json<Vec<MemberResponse>>> {
    let mut conn = state.db.get().await?;
    let record = receivers::load_with_conn(&mut conn, id).await?;
    receivers::require_member(&mut conn, &record, user.id).await?;

    let rows: Vec<(i64, String, User)> = email_receiver_members::table
        .inner_join(users::table)
        .filter(email_receiver_members::receiver_id.eq(record.id))
        .select((
            email_receiver_members::user_id,
            email_receiver_members::role,
            User::as_select(),
        ))
        .load(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "email_receivers.list_members.load"))?;

    Ok(Json(
        rows.into_iter()
            .map(|(user_id, role, member)| MemberResponse::new(user_id, &role, &member))
            .collect(),
    ))
}

pub async fn add_email_receiver_member(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<i64>,
    Json(input): Json<AddMemberRequest>,
) -> ApiResult<Json<MemberResponse>> {
    let mut conn = state.db.get().await?;
    let record = receivers::load_with_conn(&mut conn, id).await?;
    receivers::require_admin(&mut conn, &record, user.id).await?;

    let member_user_id = parse_id(&input.user_id)?;
    let role = input.role.as_deref().unwrap_or("member");
    let role = Access::parse(role)
        .ok_or_else(|| AppError::BadRequest("role must be one of: member, admin".into()))?;

    let member: User = users::table
        .find(member_user_id)
        .select(User::as_select())
        .first(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "email_receivers.add_member.lookup_user"))?;

    diesel::insert_into(email_receiver_members::table)
        .values(&NewEmailReceiverMember {
            receiver_id: record.id,
            user_id: member.id,
            role: role.as_str(),
        })
        .on_conflict((
            email_receiver_members::receiver_id,
            email_receiver_members::user_id,
        ))
        .do_update()
        .set(email_receiver_members::role.eq(role.as_str()))
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "email_receivers.add_member.insert"))?;

    Ok(Json(MemberResponse::new(member.id, role.as_str(), &member)))
}

pub async fn remove_email_receiver_member(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, member_user_id)): Path<(i64, i64)>,
) -> ApiResult<Json<OkResponse>> {
    let mut conn = state.db.get().await?;
    let record = receivers::load_with_conn(&mut conn, id).await?;
    receivers::require_admin(&mut conn, &record, user.id).await?;

    let deleted = diesel::delete(email_receiver_members::table.find((record.id, member_user_id)))
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "email_receivers.remove_member.delete"))?;

    if deleted == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(OkResponse { ok: true }))
}

fn receiver_response(
    record: &EmailReceiverRecord,
    access: Option<Access>,
) -> EmailReceiverResponse {
    EmailReceiverResponse {
        id: record.id.to_string(),
        scope: record.scope.clone(),
        display_name: record.display_name.clone(),
        mail_domain: record.mail_domain.clone(),
        worker_url: record.worker_url().map(str::to_owned),
        token_hint: record.inbound_token_hint.clone(),
        is_system: record.is_system(),
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
