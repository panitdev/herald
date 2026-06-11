use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
};
use bytes::Bytes;

use crate::{
    error::{ApiResult, AppError},
    mail::{ingest_raw_mail, process_inbound_mail},
    state::AppState,
};

pub async fn inbound_mail(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<StatusCode> {
    verify_bearer(&headers, &state.config.internal_secret)?;

    let r2_key = headers
        .get("X-R2-Key")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let mail_id = ingest_raw_mail(&state, body, r2_key.as_deref()).await?;

    tokio::spawn(process_inbound_mail(state, mail_id));

    Ok(StatusCode::OK)
}

fn verify_bearer(headers: &HeaderMap, expected: &str) -> Result<(), AppError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    if token != Some(expected) {
        return Err(AppError::Unauthorized("invalid token".into()));
    }
    Ok(())
}
