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
    error::{ApiResult, AppError},
    mail::current_sync_cursor,
    models::{
        attachment::Attachment, chat_message::ChatMessage, conversation::Conversation,
        conversation_participant::ConversationParticipant, mailbox::Mailbox, message::Message,
        message_mailbox::MessageMailbox, message_recipient::MessageRecipient,
        sync_event::SyncEvent,
    },
    schema::{
        attachments, chat_messages, conversation_participants, conversations, mailboxes,
        message_mailboxes, message_recipients, messages, sync_events, user_addresses,
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
    pub conversations: Vec<Conversation>,
    pub conversation_participants: Vec<ConversationParticipant>,
    pub chat_messages: Vec<ChatMessage>,
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
    let accessible_address_ids = user_addresses::table
        .filter(user_addresses::user_id.eq(user.id))
        .select(user_addresses::address_id);

    let mailboxes = mailboxes::table
        .filter(mailboxes::address_id.eq_any(accessible_address_ids))
        .order((mailboxes::sort_order.asc(), mailboxes::created_at.asc()))
        .select(Mailbox::as_select())
        .load(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "sync.bootstrap.load_mailboxes"))?;

    let mailbox_ids: Vec<i64> = mailboxes.iter().map(|mailbox| mailbox.id).collect();

    let messages = messages::table
        .filter(
            messages::id.eq_any(
                message_mailboxes::table
                    .filter(message_mailboxes::mailbox_id.eq_any(&mailbox_ids))
                    .select(message_mailboxes::message_id),
            ),
        )
        .order(messages::received_at.desc())
        .select(Message::as_select())
        .load(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "sync.bootstrap.load_messages"))?;

    let message_ids: Vec<i64> = messages.iter().map(|message| message.id).collect();

    let message_recipients = if message_ids.is_empty() {
        Vec::new()
    } else {
        message_recipients::table
            .filter(message_recipients::message_id.eq_any(&message_ids))
            .select(MessageRecipient::as_select())
            .load(&mut conn)
            .await
            .map_err(|err| AppError::db(err, "sync.bootstrap.load_message_recipients"))?
    };

    let message_mailboxes = if message_ids.is_empty() {
        Vec::new()
    } else {
        message_mailboxes::table
            .filter(message_mailboxes::message_id.eq_any(&message_ids))
            .filter(message_mailboxes::mailbox_id.eq_any(&mailbox_ids))
            .select(MessageMailbox::as_select())
            .load(&mut conn)
            .await
            .map_err(|err| AppError::db(err, "sync.bootstrap.load_message_mailboxes"))?
    };

    let attachments = if message_ids.is_empty() {
        Vec::new()
    } else {
        attachments::table
            .filter(attachments::message_id.eq_any(&message_ids))
            .select(Attachment::as_select())
            .load(&mut conn)
            .await
            .map_err(|err| AppError::db(err, "sync.bootstrap.load_attachments"))?
    };

    let conversations = conversations::table
        .inner_join(conversation_participants::table)
        .filter(conversation_participants::user_id.eq(user.id))
        .filter(conversation_participants::left_at.is_null())
        .order(conversations::updated_at.desc())
        .select(Conversation::as_select())
        .load(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "sync.bootstrap.load_conversations"))?;

    let conversation_ids: Vec<i64> = conversations
        .iter()
        .map(|conversation| conversation.id)
        .collect();

    let conversation_participants = if conversation_ids.is_empty() {
        Vec::new()
    } else {
        conversation_participants::table
            .filter(conversation_participants::conversation_id.eq_any(&conversation_ids))
            .select(ConversationParticipant::as_select())
            .load(&mut conn)
            .await
            .map_err(|err| AppError::db(err, "sync.bootstrap.load_conversation_participants"))?
    };

    let chat_messages = if conversation_ids.is_empty() {
        Vec::new()
    } else {
        chat_messages::table
            .filter(chat_messages::conversation_id.eq_any(&conversation_ids))
            .order((chat_messages::created_at.asc(), chat_messages::id.asc()))
            .select(ChatMessage::as_select())
            .load(&mut conn)
            .await
            .map_err(|err| AppError::db(err, "sync.bootstrap.load_chat_messages"))?
    };

    let cursor = current_sync_cursor(&state, user.id).await?;

    Ok(Json(BootstrapResponse {
        schema_version: 3,
        cursor,
        objects: BootstrapObjects {
            mailboxes,
            messages,
            message_recipients,
            message_mailboxes,
            attachments,
            conversations,
            conversation_participants,
            chat_messages,
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
        .await
        .map_err(|err| AppError::db(err, "sync.pull.load_events"))?;

    let has_more = events.len() as i64 > limit;
    if has_more {
        events.truncate(limit as usize);
    }

    let current_max = sync_events::table
        .filter(sync_events::user_id.eq(user.id))
        .select(dsl::max(sync_events::id))
        .first::<Option<i64>>(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "sync.pull.load_current_max"))?
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
