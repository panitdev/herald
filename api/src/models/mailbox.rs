use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::schema::mailboxes;

/// System folders provisioned for every user on first login.
pub const SYSTEM_FOLDERS: &[&str] = &["inbox", "sent", "trash", "spam", "archive"];

#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = mailboxes)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Mailbox {
    pub id: i64,
    /// Owning user. Loaded for ownership checks via query filters.
    #[allow(dead_code)]
    pub user_id: i64,
    pub name: String,
    pub is_system: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = mailboxes)]
pub struct NewMailbox {
    pub id: i64,
    pub user_id: i64,
    pub name: String,
    pub is_system: bool,
}

#[derive(Deserialize)]
pub struct CreateMailboxRequest {
    pub name: String,
}

#[derive(Serialize)]
pub struct MailboxResponse {
    pub id: String,
    pub name: String,
    pub is_system: bool,
    pub created_at: String,
}

impl From<Mailbox> for MailboxResponse {
    fn from(m: Mailbox) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name,
            is_system: m.is_system,
            created_at: m.created_at.to_rfc3339(),
        }
    }
}
