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
    mail::{find_owned_message, render_message_body},
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
    let (_, raw_mail) = find_owned_message(&state, user.id, message_id).await?;
    let raw = state.blob_store.get(&raw_mail.blob_key).await?.bytes;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "message/rfc822")
        .header(header::ETAG, format!("\"{}\"", raw_mail.raw_sha256))
        .body(Body::from(raw))
        .map_err(|_| AppError::Internal)
}

pub async fn message_body(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(message_id): Path<i64>,
) -> ApiResult<Json<MessageBodyResponse>> {
    let (message, raw_mail, html, text) = render_message_body(&state, user.id, message_id).await?;

    Ok(Json(MessageBodyResponse {
        message_id: message.id,
        html,
        text,
        generated_from_raw_sha256: raw_mail.raw_sha256,
    }))
}
