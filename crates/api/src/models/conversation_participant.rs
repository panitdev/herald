use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::conversation_participants;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = conversation_participants)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct ConversationParticipant {
    pub conversation_id: i64,
    pub user_id: i64,
    pub role: String,
    pub joined_at: DateTime<Utc>,
    pub left_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = conversation_participants)]
pub struct NewConversationParticipant {
    pub conversation_id: i64,
    pub user_id: i64,
    pub role: String,
}
