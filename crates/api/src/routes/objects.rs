use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, Response, StatusCode},
    Json,
};
use serde::Serialize;

use crate::{
    auth::AuthUser,
    error::{ApiResult, AppError},
    mail::{load_message_raw, render_message_body},
    state::AppState,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageBodyResponse {
    pub message_id: i64,
    pub html: String,
    pub text: String,
    pub generated_from_raw_sha256: String,
}

pub async fn raw_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(message_id): Path<i64>,
) -> ApiResult<Response<Body>> {
    let (message, raw) = load_message_raw(&state, user.id, message_id).await?;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "message/rfc822")
        .header(header::ETAG, format!("\"{}\"", message.raw_sha256))
        .body(Body::from(raw))
        .map_err(|_| AppError::Internal)
}

pub async fn message_body(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(message_id): Path<i64>,
) -> ApiResult<Json<MessageBodyResponse>> {
    let (message, html, text) = render_message_body(&state, user.id, message_id).await?;

    Ok(Json(MessageBodyResponse {
        message_id: message.id,
        html,
        text,
        generated_from_raw_sha256: message.raw_sha256,
    }))
}
