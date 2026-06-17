use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::mailboxes;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = mailboxes)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Mailbox {
    pub id: i64,
    pub address_id: i64,
    pub name: String,
    pub is_system: bool,
    pub system_role: Option<String>,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = mailboxes)]
pub struct NewMailbox<'a> {
    pub id: i64,
    pub address_id: i64,
    pub name: &'a str,
    pub is_system: bool,
    pub system_role: Option<&'a str>,
    pub sort_order: i32,
}
