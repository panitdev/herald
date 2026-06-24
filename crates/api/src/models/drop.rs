use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;
use serde_json::Value;

use crate::schema::drops;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = drops)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Drop {
    pub id: i64,
    pub user_id: i64,
    pub title: Option<String>,
    pub items: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = drops)]
pub struct NewDrop<'a> {
    pub id: i64,
    pub user_id: i64,
    pub title: Option<&'a str>,
    pub items: &'a Value,
}
