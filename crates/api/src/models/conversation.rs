use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::conversations;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = conversations)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Conversation {
    pub id: i64,
    pub kind: String,
    pub title: Option<String>,
    pub direct_key: Option<String>,
    pub created_by_user_id: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = conversations)]
pub struct NewConversation<'a> {
    pub id: i64,
    pub kind: &'a str,
    pub title: Option<&'a str>,
    pub direct_key: Option<&'a str>,
    pub created_by_user_id: i64,
}
