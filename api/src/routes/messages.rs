use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Instant;

use crate::{
    auth::kratos::KratosIdentity,
    error::{ApiResult, AppError},
    models::{
        mailbox::Mailbox,
        message::{Message, MessageResponse, NewMessage, SendMessageRequest},
    },
    schema::{mailboxes, messages},
    state::AppState,
};

#[derive(Deserialize)]
pub struct ListMessagesQuery {
    #[serde(rename = "mailboxId")]
    pub mailbox_id: Option<String>,
}

/// Loads a mailbox owned by `user`, returning `NotFound` otherwise.
async fn owned_mailbox(
    conn: &mut diesel_async::AsyncPgConnection,
    user_id: i64,
    mailbox_id: i64,
) -> ApiResult<Mailbox> {
    mailboxes::table
        .filter(mailboxes::id.eq(mailbox_id))
        .filter(mailboxes::user_id.eq(user_id))
        .select(Mailbox::as_select())
        .first(conn)
        .await
        .optional()?
        .ok_or(AppError::NotFound)
}

/// Loads a message addressed to one of `user`'s mailboxes.
async fn owned_message(
    conn: &mut diesel_async::AsyncPgConnection,
    user_id: i64,
    message_id: i64,
) -> ApiResult<Message> {
    messages::table
        .inner_join(mailboxes::table)
        .filter(messages::id.eq(message_id))
        .filter(mailboxes::user_id.eq(user_id))
        .select(Message::as_select())
        .first(conn)
        .await
        .optional()?
        .ok_or(AppError::NotFound)
}

pub async fn list_messages(
    identity: KratosIdentity,
    State(state): State<AppState>,
    Query(query): Query<ListMessagesQuery>,
) -> ApiResult<Json<Value>> {
    let started_at = Instant::now();
    let mailbox_id: i64 = query
        .mailbox_id
        .ok_or_else(|| AppError::BadRequest("missing mailboxId".into()))?
        .parse()
        .map_err(|_| AppError::BadRequest("invalid mailboxId".into()))?;

    let user = identity.resolve_user(&state).await?;
    let mut conn = state.db.get().await?;

    // Ownership check before listing.
    owned_mailbox(&mut conn, user.id, mailbox_id).await?;

    let rows: Vec<Message> = messages::table
        .filter(messages::mailbox_id.eq(mailbox_id))
        .order(messages::received_at.desc())
        .limit(50)
        .select(Message::as_select())
        .load(&mut conn)
        .await?;

    tracing::info!(
        target: "api",
        elapsed_ms = started_at.elapsed().as_millis(),
        user_id = user.id,
        mailbox_id = mailbox_id,
        count = rows.len(),
        "list_messages"
    );

    let messages: Vec<MessageResponse> = rows.into_iter().map(MessageResponse::from).collect();
    Ok(Json(json!({ "messages": messages })))
}

pub async fn get_message(
    identity: KratosIdentity,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let message_id: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid id".into()))?;
    let user = identity.resolve_user(&state).await?;
    let mut conn = state.db.get().await?;

    let message = owned_message(&mut conn, user.id, message_id).await?;
    Ok(Json(json!({ "message": MessageResponse::from(message) })))
}

pub async fn mark_read(
    identity: KratosIdentity,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let message_id: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid id".into()))?;
    let user = identity.resolve_user(&state).await?;
    let mut conn = state.db.get().await?;

    // Ownership check before mutating.
    owned_message(&mut conn, user.id, message_id).await?;

    diesel::update(messages::table.find(message_id))
        .set(messages::read_at.eq(Some(Utc::now())))
        .execute(&mut conn)
        .await?;

    Ok(Json(json!({ "ok": true })))
}

/// Send a message.
///
/// Phase 1: the outbound message is persisted to the user's `sent` folder so
/// the API surface is complete, but it is intentionally NOT handed off to a
/// mail provider or an outbound queue. Wiring delivery (provider + queue) is
/// deferred to a later phase.
pub async fn send_message(
    identity: KratosIdentity,
    State(state): State<AppState>,
    Json(body): Json<SendMessageRequest>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let to = body.to.trim();
    if !is_valid_email(to) {
        return Err(AppError::BadRequest("valid recipient email required".into()));
    }
    let subject = body.subject.trim().to_string();
    if subject.is_empty() {
        return Err(AppError::BadRequest("subject required".into()));
    }

    let user = identity.resolve_user(&state).await?;
    let mut conn = state.db.get().await?;

    let sent_mailbox: Mailbox = mailboxes::table
        .filter(mailboxes::user_id.eq(user.id))
        .filter(mailboxes::name.eq("sent"))
        .select(Mailbox::as_select())
        .first(&mut conn)
        .await
        .optional()?
        .ok_or(AppError::Internal)?;

    let now = Utc::now();
    let preview = preview_from_body(&body.body);
    let id = state.next_id();

    let new_message = NewMessage {
        id,
        mailbox_id: sent_mailbox.id,
        thread_id: Some(id),
        from_addr: user.address.clone(),
        subject: Some(subject),
        preview,
        body_text: Some(body.body.clone()),
        received_at: now,
        // Sent items are considered read by their author.
        read_at: Some(now),
    };

    let created: Message = diesel::insert_into(messages::table)
        .values(&new_message)
        .returning(Message::as_returning())
        .get_result(&mut conn)
        .await?;

    tracing::info!(
        target: "api",
        user_id = user.id,
        message_id = created.id,
        recipient = %to,
        "send_message stored (delivery not wired in phase 1)"
    );

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "message": MessageResponse::from(created),
            // Delivery is deferred; report a pending/queued-but-not-dispatched state.
            "delivery": { "status": "pending", "provider": Value::Null, "providerMessageId": Value::Null },
        })),
    ))
}

/// Minimal sanity check for an email address (`local@domain.tld`).
fn is_valid_email(value: &str) -> bool {
    let mut parts = value.split('@');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(local), Some(domain), None) => {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
                && !value.chars().any(char::is_whitespace)
        }
        _ => false,
    }
}

fn preview_from_body(body: &str) -> Option<String> {
    let collapsed = body.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        None
    } else {
        Some(collapsed.chars().take(240).collect())
    }
}
