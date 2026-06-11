use axum::{
    extract::{Query, State},
    Json,
};
use diesel::{dsl, ExpressionMethods, QueryDsl, SelectableHelper};
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    auth::AuthUser,
    error::ApiResult,
    mail::current_sync_cursor,
    models::{
        attachment::Attachment, mailbox::Mailbox, message::Message,
        message_mailbox::MessageMailbox, message_recipient::MessageRecipient,
        sync_event::SyncEvent,
    },
    schema::{
        attachments, mailboxes, message_mailboxes, message_recipients, messages, sync_events,
    },
    state::AppState,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapResponse {
    pub schema_version: i32,
    pub cursor: i64,
    pub objects: BootstrapObjects,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapObjects {
    pub mailboxes: Vec<Mailbox>,
    pub messages: Vec<Message>,
    pub message_recipients: Vec<MessageRecipient>,
    pub message_mailboxes: Vec<MessageMailbox>,
    pub attachments: Vec<Attachment>,
}

#[derive(Debug, Deserialize)]
pub struct PullQuery {
    pub cursor: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResponse {
    pub from: i64,
    pub to: i64,
    pub changes: Vec<PullChange>,
    pub has_more: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullChange {
    pub id: i64,
    pub op: String,
    pub object_type: String,
    pub object_id: i64,
    pub data: Value,
}

pub async fn bootstrap(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<BootstrapResponse>> {
    let mut conn = state.db.get().await?;

    let mailboxes = mailboxes::table
        .filter(mailboxes::user_id.eq(user.id))
        .order((mailboxes::sort_order.asc(), mailboxes::created_at.asc()))
        .select(Mailbox::as_select())
        .load(&mut conn)
        .await?;

    let messages = messages::table
        .filter(messages::user_id.eq(user.id))
        .order(messages::received_at.desc())
        .select(Message::as_select())
        .load(&mut conn)
        .await?;

    let message_ids: Vec<i64> = messages.iter().map(|message| message.id).collect();

    let message_recipients = if message_ids.is_empty() {
        Vec::new()
    } else {
        message_recipients::table
            .filter(message_recipients::message_id.eq_any(&message_ids))
            .select(MessageRecipient::as_select())
            .load(&mut conn)
            .await?
    };

    let message_mailboxes = if message_ids.is_empty() {
        Vec::new()
    } else {
        message_mailboxes::table
            .filter(message_mailboxes::message_id.eq_any(&message_ids))
            .select(MessageMailbox::as_select())
            .load(&mut conn)
            .await?
    };

    let attachments = if message_ids.is_empty() {
        Vec::new()
    } else {
        attachments::table
            .filter(attachments::message_id.eq_any(&message_ids))
            .select(Attachment::as_select())
            .load(&mut conn)
            .await?
    };

    let cursor = current_sync_cursor(&state, user.id).await?;

    Ok(Json(BootstrapResponse {
        schema_version: 1,
        cursor,
        objects: BootstrapObjects {
            mailboxes,
            messages,
            message_recipients,
            message_mailboxes,
            attachments,
        },
    }))
}

pub async fn pull(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(query): Query<PullQuery>,
) -> ApiResult<Json<PullResponse>> {
    let from = query.cursor.unwrap_or(0).max(0);
    let limit = query.limit.unwrap_or(500).clamp(1, 1000);
    let mut conn = state.db.get().await?;

    let mut events = sync_events::table
        .filter(sync_events::user_id.eq(user.id))
        .filter(sync_events::id.gt(from))
        .order(sync_events::id.asc())
        .limit(limit + 1)
        .select(SyncEvent::as_select())
        .load(&mut conn)
        .await?;

    let has_more = events.len() as i64 > limit;
    if has_more {
        events.truncate(limit as usize);
    }

    let current_max = sync_events::table
        .filter(sync_events::user_id.eq(user.id))
        .select(dsl::max(sync_events::id))
        .first::<Option<i64>>(&mut conn)
        .await?
        .unwrap_or(0);

    let to = events.last().map(|event| event.id).unwrap_or(current_max);
    let changes = events
        .into_iter()
        .map(|event| PullChange {
            id: event.id,
            op: event.op,
            object_type: event.object_type,
            object_id: event.object_id,
            data: event.data_json.unwrap_or(Value::Null),
        })
        .collect();

    Ok(Json(PullResponse {
        from,
        to,
        changes,
        has_more,
    }))
}
