//! Authenticated outbound mail API.

use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};

use crate::{
    auth::AuthUser,
    email::{EmailAddress, OutboundEmail, registry},
    error::{ApiResult, AppError},
    state::AppState,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMailRequest {
    pub to: String,
    pub subject: String,
    pub body: String,
    pub from_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMailResponse {
    pub provider: String,
    pub provider_message_id: Option<String>,
    pub from: String,
}

/// Send mail using the authenticated user's primary address as `From`.
///
/// The client may provide a display name, but never an arbitrary sender address.
pub async fn send_mail(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(input): Json<SendMailRequest>,
) -> ApiResult<Json<SendMailResponse>> {
    let to = input.to.trim();
    if !looks_like_email(to) {
        return Err(AppError::BadRequest(
            "to must be a valid email address".into(),
        ));
    }

    let subject = input.subject.trim();
    if subject.is_empty() {
        return Err(AppError::BadRequest("subject is required".into()));
    }
    if input.body.trim().is_empty() {
        return Err(AppError::BadRequest("body is required".into()));
    }

    // Do not accept a From address from the request. Sender resolution is based
    // on the address owned by the authenticated user.
    let sender = registry::resolve_sender_for_address(&state, user.id, &user.address).await?;
    let mut email = OutboundEmail::new(
        EmailAddress::with_name(user.address.clone(), input.from_name),
        vec![EmailAddress::new(to.to_owned())],
        subject.to_owned(),
    );
    email.text = Some(input.body);

    let outcome = sender.send(&email).await?;
    crate::mail::persist_outbound_mail(&state, user.id, &email, &outcome).await?;
    Ok(Json(SendMailResponse {
        provider: outcome.provider.as_str().to_owned(),
        provider_message_id: outcome.message_id,
        from: user.address,
    }))
}

fn looks_like_email(value: &str) -> bool {
    match value.split_once('@') {
        Some((local, domain)) => {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        }
        None => false,
    }
}
