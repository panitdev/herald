use chrono::{DateTime, Utc};
use diesel::prelude::*;

use crate::schema::mailboxes;

#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = mailboxes)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Mailbox {
    pub id: i64,
    pub user_id: i64,
    pub name: String,
    pub is_system: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = mailboxes)]
pub struct NewMailbox<'a> {
    pub id: i64,
    pub user_id: i64,
    pub name: &'a str,
    pub is_system: bool,
}
