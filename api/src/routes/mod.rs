use axum::{
    routing::{get, post},
    Router,
};

use crate::state::AppState;

pub mod health;
pub mod mailboxes;
pub mod me;
pub mod messages;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health::get_health))
        .nest(
            "/api",
            Router::new()
                .route("/me", get(me::get_me))
                .route(
                    "/mailboxes",
                    get(mailboxes::list_mailboxes).post(mailboxes::create_mailbox),
                )
                .route(
                    "/mailboxes/{id}",
                    get(mailboxes::get_mailbox).delete(mailboxes::delete_mailbox),
                )
                .route("/messages", get(messages::list_messages))
                .route("/messages/send", post(messages::send_message))
                .route("/messages/{id}", get(messages::get_message))
                .route("/messages/{id}/read", post(messages::mark_read)),
        )
}
