use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
};
use bytes::Bytes;

use crate::{
    error::{ApiResult, AppError},
    mail::{ingest_raw_mail, process_inbound_mail},
    receivers,
    state::AppState,
};

/// Accept a raw message from a registered receiver.
///
/// The bearer token identifies *which* receiver is delivering: it is no longer
/// a single deployment-wide secret. The resolved receiver is recorded on the
/// raw mail row so delivery can only reach addresses bound to that receiver.
pub async fn inbound_mail(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<StatusCode> {
    let token = bearer_token(&headers)?;
    let receiver = receivers::authenticate(&state, &token).await?;

    let r2_key = headers
        .get("X-R2-Key")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let mail_id = ingest_raw_mail(&state, body, r2_key.as_deref(), Some(receiver.id)).await?;

    tokio::spawn(process_inbound_mail(state, mail_id));

    Ok(StatusCode::OK)
}

fn bearer_token(headers: &HeaderMap) -> Result<String, AppError> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::to_owned)
        .ok_or_else(|| AppError::Unauthorized("missing receiver token".into()))
}
