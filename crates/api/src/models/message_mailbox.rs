use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::message_mailboxes;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = message_mailboxes)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct MessageMailbox {
    pub message_id: i64,
    pub mailbox_id: i64,
    pub relation: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = message_mailboxes)]
pub struct NewMessageMailbox<'a> {
    pub message_id: i64,
    pub mailbox_id: i64,
    pub relation: &'a str,
}
