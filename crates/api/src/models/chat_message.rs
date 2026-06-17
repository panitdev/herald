use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::chat_messages;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = chat_messages)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct ChatMessage {
    pub id: i64,
    pub conversation_id: i64,
    pub sender_user_id: i64,
    pub body: String,
    pub client_mutation_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = chat_messages)]
pub struct NewChatMessage<'a> {
    pub id: i64,
    pub conversation_id: i64,
    pub sender_user_id: i64,
    pub body: &'a str,
    pub client_mutation_id: Option<&'a str>,
}
