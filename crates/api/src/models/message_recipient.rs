use diesel::prelude::*;
use serde::Serialize;

use crate::schema::message_recipients;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = message_recipients)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct MessageRecipient {
    pub id: i64,
    pub message_id: i64,
    pub kind: String,
    pub address: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = message_recipients)]
pub struct NewMessageRecipient<'a> {
    pub id: i64,
    pub message_id: i64,
    pub kind: &'a str,
    pub address: &'a str,
    pub display_name: Option<&'a str>,
}
