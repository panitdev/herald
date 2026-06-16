use axum::{
    routing::{get, post},
    Json, Router,
};
use serde_json::json;

use crate::{auth::AuthUser, state::AppState};

pub mod internal;
pub mod objects;
pub mod sync;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/api/me", get(me))
        .route("/internal/mail/inbound", post(internal::inbound_mail))
        .route("/sync/bootstrap", post(sync::bootstrap))
        .route("/sync/pull", get(sync::pull))
        .route("/objects/messages/{id}/raw", get(objects::raw_message))
        .route("/objects/messages/{id}/body", get(objects::message_body))
}

async fn me(AuthUser(user): AuthUser) -> Json<serde_json::Value> {
    Json(json!({
        "id": user.id.to_string(),
        "username": user.username,
        "address": user.address,
    }))
}
