use axum::{routing::{get, post}, Json, Router};
use serde_json::json;

use crate::state::AppState;

pub mod internal;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/internal/mail/inbound", post(internal::inbound_mail))
}
