use axum::{routing::{get, post}, Json, Router};
use serde_json::json;

use crate::{auth::AuthUser, state::AppState};

pub mod internal;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/api/me", get(me))
        .route("/internal/mail/inbound", post(internal::inbound_mail))
}

async fn me(AuthUser(user): AuthUser) -> Json<serde_json::Value> {
    Json(json!({
        "id": user.id.to_string(),
        "username": user.username,
        "address": user.address,
    }))
}
