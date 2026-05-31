use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::schema::messages;

#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = messages)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Message {
    pub id: i64,
    pub mailbox_id: i64,
    pub thread_id: Option<i64>,
    pub from_addr: String,
    pub subject: Option<String>,
    pub preview: Option<String>,
    pub body_text: Option<String>,
    pub received_at: DateTime<Utc>,
    pub read_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = messages)]
pub struct NewMessage {
    pub id: i64,
    pub mailbox_id: i64,
    pub thread_id: Option<i64>,
    pub from_addr: String,
    pub subject: Option<String>,
    pub preview: Option<String>,
    pub body_text: Option<String>,
    pub received_at: DateTime<Utc>,
    pub read_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
pub struct SendMessageRequest {
    pub to: String,
    pub subject: String,
    #[serde(default)]
    pub body: String,
    /// Optional display name for the sender. Accepted for API
    /// compatibility; applied once outbound delivery is wired.
    #[serde(rename = "fromName")]
    #[allow(dead_code)]
    pub from_name: Option<String>,
}

#[derive(Serialize)]
pub struct MessageResponse {
    pub id: String,
    pub mailbox_id: String,
    pub thread_id: Option<String>,
    pub from_addr: String,
    pub subject: Option<String>,
    pub preview: Option<String>,
    pub body_text: Option<String>,
    pub received_at: String,
    pub read_at: Option<String>,
    pub created_at: String,
}

impl From<Message> for MessageResponse {
    fn from(m: Message) -> Self {
        Self {
            id: m.id.to_string(),
            mailbox_id: m.mailbox_id.to_string(),
            thread_id: m.thread_id.map(|id| id.to_string()),
            from_addr: m.from_addr,
            subject: m.subject,
            preview: m.preview,
            body_text: m.body_text,
            received_at: m.received_at.to_rfc3339(),
            read_at: m.read_at.map(|t| t.to_rfc3339()),
            created_at: m.created_at.to_rfc3339(),
        }
    }
}
