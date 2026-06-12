use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::messages;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = messages)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Message {
    pub id: i64,
    pub raw_inbound_mail_id: i64,
    pub message_id_header: Option<String>,
    pub thread_id: Option<String>,
    pub from_addr: Option<String>,
    pub from_name: Option<String>,
    pub subject: Option<String>,
    pub preview: Option<String>,
    pub received_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = messages)]
pub struct NewMessage<'a> {
    pub id: i64,
    pub raw_inbound_mail_id: i64,
    pub message_id_header: Option<&'a str>,
    pub thread_id: Option<&'a str>,
    pub from_addr: Option<&'a str>,
    pub from_name: Option<&'a str>,
    pub subject: Option<&'a str>,
    pub preview: Option<&'a str>,
    pub received_at: DateTime<Utc>,
}
