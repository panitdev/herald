use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Utc};
use diesel::{dsl, ExpressionMethods, OptionalExtension, QueryDsl, SelectableHelper};
use diesel_async::{AsyncConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};

use crate::{
    auth::AuthUser,
    error::{ApiResult, AppError},
    models::{
        chat_message::{ChatMessage, NewChatMessage},
        conversation::{Conversation, NewConversation},
        conversation_participant::{ConversationParticipant, NewConversationParticipant},
        sync_event::NewSyncEvent,
        user::User,
    },
    schema::{chat_messages, conversation_participants, conversations, sync_events, users},
    state::AppState,
};

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CreateConversationRequest {
    Direct {
        user_id: String,
    },
    Group {
        participant_user_ids: Vec<String>,
        title: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListMessagesQuery {
    before: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    body: String,
    client_mutation_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationResponse {
    conversation: ConversationSummary,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationsResponse {
    conversations: Vec<ConversationSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagesResponse {
    messages: Vec<ChatMessage>,
    has_more: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageResponse {
    message: ChatMessage,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    id: String,
    kind: String,
    title: Option<String>,
    participants: Vec<ParticipantSummary>,
    last_message: Option<ChatMessage>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantSummary {
    user_id: String,
    username: String,
    display_name: String,
    avatar_url: Option<String>,
    role: String,
    joined_at: DateTime<Utc>,
    left_at: Option<DateTime<Utc>>,
}

pub async fn create_conversation(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(input): Json<CreateConversationRequest>,
) -> ApiResult<Json<ConversationResponse>> {
    let mut conn = state.db.get().await?;

    let (conversation_id, notify) = conn
        .transaction::<_, AppError, _>(|conn| {
            let state = state.clone();
            Box::pin(async move {
                match input {
                    CreateConversationRequest::Direct { user_id } => {
                        let other_user_id = parse_id(&user_id, "userId")?;
                        if other_user_id == user.id {
                            return Err(AppError::BadRequest(
                                "direct conversation requires another user".into(),
                            ));
                        }
                        ensure_users_exist(conn, &[other_user_id]).await?;
                        create_or_get_direct_conversation(conn, &state, user.id, other_user_id)
                            .await
                    }
                    CreateConversationRequest::Group {
                        participant_user_ids,
                        title,
                    } => {
                        let participant_ids =
                            normalized_group_participants(user.id, participant_user_ids)?;
                        ensure_users_exist(conn, &participant_ids).await?;
                        create_group_conversation(
                            conn,
                            &state,
                            user.id,
                            &participant_ids,
                            title.as_deref(),
                        )
                        .await
                    }
                }
            })
        })
        .await?;

    notify_users(&state, notify);
    let conversation = load_conversation_summary(&state, user.id, conversation_id).await?;
    Ok(Json(ConversationResponse { conversation }))
}

pub async fn list_conversations(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<ConversationsResponse>> {
    let mut conn = state.db.get().await?;
    let rows = conversations::table
        .inner_join(conversation_participants::table)
        .filter(conversation_participants::user_id.eq(user.id))
        .filter(conversation_participants::left_at.is_null())
        .order(conversations::updated_at.desc())
        .select(Conversation::as_select())
        .load(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "chat.list_conversations.load_conversations"))?;

    let summaries = load_conversation_summaries(&mut conn, rows).await?;
    Ok(Json(ConversationsResponse {
        conversations: summaries,
    }))
}

pub async fn list_messages(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(conversation_id): Path<String>,
    Query(query): Query<ListMessagesQuery>,
) -> ApiResult<Json<MessagesResponse>> {
    let conversation_id = parse_id(&conversation_id, "conversationId")?;
    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    let before = query
        .before
        .as_deref()
        .map(|value| parse_id(value, "before"))
        .transpose()?;

    let mut conn = state.db.get().await?;
    ensure_active_participant(&mut conn, user.id, conversation_id).await?;

    let mut query_builder = chat_messages::table
        .filter(chat_messages::conversation_id.eq(conversation_id))
        .into_boxed();

    if let Some(before_id) = before {
        query_builder = query_builder.filter(chat_messages::id.lt(before_id));
    }

    let mut messages = query_builder
        .order((chat_messages::created_at.desc(), chat_messages::id.desc()))
        .limit(limit + 1)
        .select(ChatMessage::as_select())
        .load(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "chat.list_messages.load_messages"))?;

    let has_more = messages.len() as i64 > limit;
    if has_more {
        messages.truncate(limit as usize);
    }

    Ok(Json(MessagesResponse { messages, has_more }))
}

pub async fn send_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(conversation_id): Path<String>,
    Json(input): Json<SendMessageRequest>,
) -> ApiResult<Json<MessageResponse>> {
    let conversation_id = parse_id(&conversation_id, "conversationId")?;
    let body = input.body.trim();
    if body.is_empty() {
        return Err(AppError::BadRequest("message body is required".into()));
    }
    if body.chars().count() > 8000 {
        return Err(AppError::BadRequest("message body is too long".into()));
    }

    let client_mutation_id = input
        .client_mutation_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let mut conn = state.db.get().await?;
    let (message, notify) = conn
        .transaction::<_, AppError, _>(|conn| {
            let state = state.clone();
            Box::pin(async move {
                ensure_active_participant(conn, user.id, conversation_id).await?;

                let existing = if let Some(client_mutation_id) = client_mutation_id {
                    chat_messages::table
                        .filter(chat_messages::sender_user_id.eq(user.id))
                        .filter(chat_messages::client_mutation_id.eq(client_mutation_id))
                        .select(ChatMessage::as_select())
                        .first(conn)
                        .await
                        .optional()
                        .map_err(|err| AppError::db(err, "chat.send_message.lookup_idempotent"))?
                } else {
                    None
                };

                if let Some(existing) = existing {
                    return Ok((existing, HashMap::new()));
                }

                let new_message = NewChatMessage {
                    id: state.next_id(),
                    conversation_id,
                    sender_user_id: user.id,
                    body,
                    client_mutation_id,
                };

                let message = diesel::insert_into(chat_messages::table)
                    .values(&new_message)
                    .returning(ChatMessage::as_returning())
                    .get_result(conn)
                    .await
                    .map_err(|err| AppError::db(err, "chat.send_message.insert_message"))?;

                let updated_conversation =
                    diesel::update(conversations::table.find(conversation_id))
                        .set(conversations::updated_at.eq(Utc::now()))
                        .returning(Conversation::as_returning())
                        .get_result(conn)
                        .await
                        .map_err(|err| AppError::db(err, "chat.send_message.touch_conversation"))?;

                let participant_ids = active_participant_ids(conn, conversation_id).await?;
                let notify = insert_sync_events(
                    conn,
                    &state,
                    &participant_ids,
                    vec![
                        sync_event_payload(
                            "conversation",
                            updated_conversation.id,
                            json!(updated_conversation),
                        ),
                        sync_event_payload("chatMessage", message.id, json!(message)),
                    ],
                )
                .await?;

                Ok((message, notify))
            })
        })
        .await?;

    notify_users(&state, notify);
    Ok(Json(MessageResponse { message }))
}

async fn create_or_get_direct_conversation(
    conn: &mut diesel_async::AsyncPgConnection,
    state: &AppState,
    current_user_id: i64,
    other_user_id: i64,
) -> Result<(i64, HashMap<i64, i64>), AppError> {
    let direct_key = direct_key(current_user_id, other_user_id);
    let new_conversation = NewConversation {
        id: state.next_id(),
        kind: "direct",
        title: None,
        direct_key: Some(&direct_key),
        created_by_user_id: current_user_id,
    };

    let inserted = diesel::insert_into(conversations::table)
        .values(&new_conversation)
        .on_conflict(conversations::direct_key)
        .do_nothing()
        .returning(Conversation::as_returning())
        .get_result(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "chat.create_direct_conversation.insert"))?;

    let conversation = if let Some(conversation) = inserted {
        let participant_ids = vec![current_user_id, other_user_id];
        let participants = insert_participants(conn, conversation.id, &participant_ids).await?;
        let notify = insert_sync_events(
            conn,
            state,
            &participant_ids,
            sync_payloads_for_conversation(&conversation, &participants),
        )
        .await?;
        return Ok((conversation.id, notify));
    } else {
        conversations::table
            .filter(conversations::direct_key.eq(&direct_key))
            .select(Conversation::as_select())
            .first(conn)
            .await
            .map_err(|err| AppError::db(err, "chat.create_direct_conversation.load_existing"))?
    };

    Ok((conversation.id, HashMap::new()))
}

async fn create_group_conversation(
    conn: &mut diesel_async::AsyncPgConnection,
    state: &AppState,
    current_user_id: i64,
    participant_ids: &[i64],
    title: Option<&str>,
) -> Result<(i64, HashMap<i64, i64>), AppError> {
    let title = title.map(str::trim).filter(|value| !value.is_empty());
    if title.map(|value| value.chars().count()).unwrap_or(0) > 120 {
        return Err(AppError::BadRequest(
            "conversation title is too long".into(),
        ));
    }

    let new_conversation = NewConversation {
        id: state.next_id(),
        kind: "group",
        title,
        direct_key: None,
        created_by_user_id: current_user_id,
    };

    let conversation = diesel::insert_into(conversations::table)
        .values(&new_conversation)
        .returning(Conversation::as_returning())
        .get_result(conn)
        .await
        .map_err(|err| AppError::db(err, "chat.create_group_conversation.insert"))?;

    let participants = insert_participants(conn, conversation.id, participant_ids).await?;
    let notify = insert_sync_events(
        conn,
        state,
        participant_ids,
        sync_payloads_for_conversation(&conversation, &participants),
    )
    .await?;

    Ok((conversation.id, notify))
}

async fn insert_participants(
    conn: &mut diesel_async::AsyncPgConnection,
    conversation_id: i64,
    participant_ids: &[i64],
) -> Result<Vec<ConversationParticipant>, AppError> {
    let rows = participant_ids
        .iter()
        .map(|user_id| NewConversationParticipant {
            conversation_id,
            user_id: *user_id,
            role: "member".to_owned(),
        })
        .collect::<Vec<_>>();

    diesel::insert_into(conversation_participants::table)
        .values(&rows)
        .on_conflict_do_nothing()
        .execute(conn)
        .await
        .map_err(|err| AppError::db(err, "chat.insert_participants.insert"))?;

    let participants = conversation_participants::table
        .filter(conversation_participants::conversation_id.eq(conversation_id))
        .filter(conversation_participants::user_id.eq_any(participant_ids))
        .select(ConversationParticipant::as_select())
        .load(conn)
        .await
        .map_err(|err| AppError::db(err, "chat.insert_participants.load_inserted"))?;

    Ok(participants)
}

fn sync_payloads_for_conversation(
    conversation: &Conversation,
    participants: &[ConversationParticipant],
) -> Vec<SyncPayload> {
    let mut payloads = vec![sync_event_payload(
        "conversation",
        conversation.id,
        json!(conversation),
    )];
    payloads.extend(participants.iter().map(|participant| {
        sync_event_payload(
            "conversationParticipant",
            participant.conversation_id,
            json!(participant),
        )
    }));
    payloads
}

fn sync_event_payload(
    object_type: &'static str,
    object_id: i64,
    data_json: serde_json::Value,
) -> SyncPayload {
    SyncPayload {
        object_type,
        object_id,
        data_json,
    }
}

struct SyncPayload {
    object_type: &'static str,
    object_id: i64,
    data_json: serde_json::Value,
}

async fn insert_sync_events(
    conn: &mut diesel_async::AsyncPgConnection,
    state: &AppState,
    user_ids: &[i64],
    payloads: Vec<SyncPayload>,
) -> Result<HashMap<i64, i64>, AppError> {
    let mut notify: HashMap<i64, i64> = HashMap::new();
    let mut rows = Vec::with_capacity(user_ids.len() * payloads.len());

    for user_id in user_ids {
        for payload in &payloads {
            let event_id = state.next_id();
            notify
                .entry(*user_id)
                .and_modify(|cursor| *cursor = (*cursor).max(event_id))
                .or_insert(event_id);
            rows.push(NewSyncEvent {
                id: event_id,
                user_id: *user_id,
                object_type: payload.object_type.to_owned(),
                object_id: payload.object_id,
                op: "upsert".to_owned(),
                data_json: Some(payload.data_json.clone()),
            });
        }
    }

    if !rows.is_empty() {
        diesel::insert_into(sync_events::table)
            .values(&rows)
            .execute(conn)
            .await
            .map_err(|err| AppError::db(err, "chat.insert_sync_events.insert"))?;
    }

    Ok(notify)
}

async fn load_conversation_summary(
    state: &AppState,
    user_id: i64,
    conversation_id: i64,
) -> Result<ConversationSummary, AppError> {
    let mut conn = state.db.get().await?;
    ensure_active_participant(&mut conn, user_id, conversation_id).await?;
    let conversation = conversations::table
        .find(conversation_id)
        .select(Conversation::as_select())
        .first(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "chat.load_conversation_summary.load_conversation"))?;
    let mut summaries = load_conversation_summaries(&mut conn, vec![conversation]).await?;
    summaries.pop().ok_or(AppError::NotFound)
}

async fn load_conversation_summaries(
    conn: &mut diesel_async::AsyncPgConnection,
    conversations_in: Vec<Conversation>,
) -> Result<Vec<ConversationSummary>, AppError> {
    if conversations_in.is_empty() {
        return Ok(Vec::new());
    }

    let conversation_ids = conversations_in
        .iter()
        .map(|conversation| conversation.id)
        .collect::<Vec<_>>();

    let participants = conversation_participants::table
        .inner_join(users::table)
        .filter(conversation_participants::conversation_id.eq_any(&conversation_ids))
        .order(conversation_participants::joined_at.asc())
        .select((ConversationParticipant::as_select(), User::as_select()))
        .load::<(ConversationParticipant, User)>(conn)
        .await
        .map_err(|err| AppError::db(err, "chat.load_conversation_summaries.load_participants"))?;

    let mut participants_by_conversation: HashMap<i64, Vec<ParticipantSummary>> = HashMap::new();
    for (participant, user) in participants {
        participants_by_conversation
            .entry(participant.conversation_id)
            .or_default()
            .push(ParticipantSummary {
                user_id: user.id.to_string(),
                username: user.username,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                role: participant.role,
                joined_at: participant.joined_at,
                left_at: participant.left_at,
            });
    }

    let messages = chat_messages::table
        .filter(chat_messages::conversation_id.eq_any(&conversation_ids))
        .order((chat_messages::created_at.desc(), chat_messages::id.desc()))
        .select(ChatMessage::as_select())
        .load(conn)
        .await
        .map_err(|err| AppError::db(err, "chat.load_conversation_summaries.load_last_messages"))?;

    let mut last_messages = HashMap::new();
    for message in messages {
        last_messages
            .entry(message.conversation_id)
            .or_insert(message);
    }

    Ok(conversations_in
        .into_iter()
        .map(|conversation| ConversationSummary {
            id: conversation.id.to_string(),
            kind: conversation.kind,
            title: conversation.title,
            participants: participants_by_conversation
                .remove(&conversation.id)
                .unwrap_or_default(),
            last_message: last_messages.remove(&conversation.id),
            created_at: conversation.created_at,
            updated_at: conversation.updated_at,
        })
        .collect())
}

async fn ensure_active_participant(
    conn: &mut diesel_async::AsyncPgConnection,
    user_id: i64,
    conversation_id: i64,
) -> Result<(), AppError> {
    let exists = conversation_participants::table
        .filter(conversation_participants::conversation_id.eq(conversation_id))
        .filter(conversation_participants::user_id.eq(user_id))
        .filter(conversation_participants::left_at.is_null())
        .select(conversation_participants::user_id)
        .first::<i64>(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "chat.ensure_active_participant.lookup"))?
        .is_some();

    if exists {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

async fn active_participant_ids(
    conn: &mut diesel_async::AsyncPgConnection,
    conversation_id: i64,
) -> Result<Vec<i64>, AppError> {
    let ids = conversation_participants::table
        .filter(conversation_participants::conversation_id.eq(conversation_id))
        .filter(conversation_participants::left_at.is_null())
        .select(conversation_participants::user_id)
        .load(conn)
        .await
        .map_err(|err| AppError::db(err, "chat.active_participant_ids.load"))?;
    Ok(ids)
}

async fn ensure_users_exist(
    conn: &mut diesel_async::AsyncPgConnection,
    user_ids: &[i64],
) -> Result<(), AppError> {
    let unique_ids = user_ids.iter().copied().collect::<HashSet<_>>();
    let found_count = users::table
        .filter(users::id.eq_any(unique_ids.iter().copied().collect::<Vec<_>>()))
        .select(dsl::count_star())
        .first::<i64>(conn)
        .await
        .map_err(|err| AppError::db(err, "chat.ensure_users_exist.count"))?;

    if found_count == unique_ids.len() as i64 {
        Ok(())
    } else {
        Err(AppError::BadRequest(
            "one or more users were not found".into(),
        ))
    }
}

fn normalized_group_participants(
    current_user_id: i64,
    participant_user_ids: Vec<String>,
) -> Result<Vec<i64>, AppError> {
    let mut ids = HashSet::from([current_user_id]);
    for raw in participant_user_ids {
        ids.insert(parse_id(&raw, "participantUserIds")?);
    }
    if ids.len() < 3 {
        return Err(AppError::BadRequest(
            "group conversation requires at least three participants".into(),
        ));
    }
    let mut ids = ids.into_iter().collect::<Vec<_>>();
    ids.sort_unstable();
    Ok(ids)
}

fn direct_key(a: i64, b: i64) -> String {
    let (left, right) = if a <= b { (a, b) } else { (b, a) };
    format!("{left}:{right}")
}

fn parse_id(value: &str, field: &str) -> Result<i64, AppError> {
    value
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest(format!("{field} must be a valid id")))
}

fn notify_users(state: &AppState, cursors_by_user: HashMap<i64, i64>) {
    for (user_id, cursor) in cursors_by_user {
        state.realtime.notify_sync(user_id, cursor);
    }
}
