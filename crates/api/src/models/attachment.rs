use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::attachments;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = attachments)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Attachment {
    pub id: i64,
    pub message_id: i64,
    pub filename: Option<String>,
    pub content_type: Option<String>,
    pub size: Option<i64>,
    pub content_id: Option<String>,
    pub inline: bool,
    pub blob_key: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = attachments)]
pub struct NewAttachment<'a> {
    pub id: i64,
    pub message_id: i64,
    pub filename: Option<&'a str>,
    pub content_type: Option<&'a str>,
    pub size: Option<i64>,
    pub content_id: Option<&'a str>,
    pub inline: bool,
    pub blob_key: Option<&'a str>,
}
