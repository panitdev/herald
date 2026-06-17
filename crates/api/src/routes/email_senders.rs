//! Management API for outbound email senders.
//!
//! End users register their own provider credentials here (`scope = 'user'`),
//! which is what makes herald-api usable even when the deployment ships no
//! provider key. Listing also surfaces shared `scope = 'system'` senders. Only
//! the owner of a sender may mutate it; secrets are never returned.

use axum::{
    extract::{Path, State},
    Json,
};
use diesel::{ExpressionMethods, QueryDsl, SelectableHelper};
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    auth::AuthUser,
    email::{registry, EmailAddress, EmailProvider, OutboundEmail},
    error::{ApiResult, AppError},
    models::email_sender::{EmailSenderRecord, NewEmailSender},
    schema::email_senders,
    state::AppState,
};

#[derive(Serialize)]
pub struct EmailSenderResponse {
    id: String,
    provider: String,
    scope: String,
    display_name: String,
    mail_domain: Option<String>,
    from_address: Option<String>,
    /// True for shared deployment-wide senders.
    is_system: bool,
    /// True when the requesting user owns this sender.
    is_owned: bool,
    /// Whether a secret credential is stored (the secret itself is never returned).
    has_secret: bool,
    is_active: bool,
    created_at: String,
}

#[derive(Deserialize)]
pub struct CreateEmailSenderRequest {
    provider: String,
    display_name: String,
    mail_domain: Option<String>,
    from_address: Option<String>,
    /// Non-secret provider configuration (e.g. `{ "region": "us-east-1" }`).
    #[serde(default)]
    config: Option<Value>,
    /// Secret provider credentials (e.g. `{ "api_key": "re_..." }`).
    secret: Value,
}

pub async fn list_email_senders(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Vec<EmailSenderResponse>>> {
    let records = registry::list_available(&state, user.id).await?;
    Ok(Json(
        records
            .iter()
            .map(|record| sender_response(record, user.id))
            .collect(),
    ))
}

pub async fn create_email_sender(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(input): Json<CreateEmailSenderRequest>,
) -> ApiResult<Json<EmailSenderResponse>> {
    let provider = EmailProvider::parse(input.provider.trim()).ok_or_else(|| {
        AppError::BadRequest("provider must be one of: resend, ses".into())
    })?;

    let display_name = input.display_name.trim();
    if display_name.is_empty() || display_name.chars().count() > 120 {
        return Err(AppError::BadRequest(
            "display_name is required and must be 120 characters or fewer".into(),
        ));
    }

    let mail_domain = normalize_domain(input.mail_domain.as_deref())?;
    let from_address = input
        .from_address
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);

    let config = input.config.unwrap_or_else(|| serde_json::json!({}));
    if !config.is_object() {
        return Err(AppError::BadRequest("config must be a JSON object".into()));
    }
    if !input.secret.is_object() {
        return Err(AppError::BadRequest("secret must be a JSON object".into()));
    }

    // Validate the credentials by building the adapter up front. This rejects
    // missing/blank required fields (api_key, region, access keys, ...).
    crate::email::build_sender(state.http.clone(), provider, &config, Some(&input.secret))?;

    let new_sender = NewEmailSender {
        id: state.next_id(),
        scope: "user",
        owner_user_id: Some(user.id),
        owner_group_id: None,
        provider: provider.as_str(),
        display_name,
        mail_domain: mail_domain.as_deref(),
        from_address: from_address.as_deref(),
        config,
        secret: Some(input.secret),
    };

    let mut conn = state.db.get().await?;
    let inserted = diesel::insert_into(email_senders::table)
        .values(&new_sender)
        .returning(EmailSenderRecord::as_returning())
        .get_result(&mut conn)
        .await?;

    Ok(Json(sender_response(&inserted, user.id)))
}

pub async fn delete_email_sender(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<i64>,
) -> ApiResult<Json<serde_json::Value>> {
    let mut conn = state.db.get().await?;

    // Only the owner may delete; system/group senders are never owned by a user.
    let deleted = diesel::delete(
        email_senders::table
            .filter(email_senders::id.eq(id))
            .filter(email_senders::owner_user_id.eq(user.id)),
    )
    .execute(&mut conn)
    .await?;

    if deleted == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct TestSendRequest {
    /// Address to send the test message to.
    to: String,
    /// From address; defaults to the user's primary address. Its domain drives
    /// which sender the resolver selects.
    from: Option<String>,
    subject: Option<String>,
}

#[derive(Serialize)]
pub struct TestSendResponse {
    provider: String,
    message_id: Option<String>,
}

/// Send a test email, resolving the sender from the caller's sending domain.
///
/// This exercises the full abstraction: domain-aware sender resolution across
/// the user's own and system senders, with the environment system sender as a
/// fallback. Delivery errors from the provider are surfaced to the caller.
pub async fn send_test_email(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(input): Json<TestSendRequest>,
) -> ApiResult<Json<TestSendResponse>> {
    let to = input.to.trim();
    if !looks_like_email(to) {
        return Err(AppError::BadRequest("to must be a valid email address".into()));
    }

    let from = input
        .from
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(user.address.as_str())
        .to_owned();
    if !looks_like_email(&from) {
        return Err(AppError::BadRequest("from must be a valid email address".into()));
    }

    let from_domain = from.split_once('@').map(|(_, domain)| domain.to_lowercase());
    let sender = registry::resolve_sender(&state, user.id, from_domain.as_deref()).await?;

    let subject = input
        .subject
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("herald test email")
        .to_owned();

    let mut email = OutboundEmail::new(
        EmailAddress::new(from),
        vec![EmailAddress::new(to.to_owned())],
        subject,
    );
    email.text = Some("This is a test email sent through herald.".to_owned());

    let outcome = sender.send(&email).await?;

    Ok(Json(TestSendResponse {
        provider: outcome.provider.as_str().to_owned(),
        message_id: outcome.message_id,
    }))
}

fn looks_like_email(value: &str) -> bool {
    match value.split_once('@') {
        Some((local, domain)) => {
            !local.is_empty() && domain.contains('.') && !domain.starts_with('.')
                && !domain.ends_with('.')
        }
        None => false,
    }
}

fn sender_response(record: &EmailSenderRecord, user_id: i64) -> EmailSenderResponse {
    EmailSenderResponse {
        id: record.id.to_string(),
        provider: record.provider.clone(),
        scope: record.scope.clone(),
        display_name: record.display_name.clone(),
        mail_domain: record.mail_domain.clone(),
        from_address: record.from_address.clone(),
        is_system: record.scope == "system",
        is_owned: record.owner_user_id == Some(user_id),
        has_secret: record.secret.is_some(),
        is_active: record.is_active,
        created_at: record.created_at.to_rfc3339(),
    }
}

fn normalize_domain(value: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(raw) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    let domain = raw.to_lowercase();
    let valid = domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && domain
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'));

    if !valid {
        return Err(AppError::BadRequest("mail_domain must be a valid domain".into()));
    }

    Ok(Some(domain))
}
