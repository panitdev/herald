use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;
use serde_json::Value;

use crate::schema::sync_events;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = sync_events)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct SyncEvent {
    pub id: i64,
    pub user_id: i64,
    pub object_type: String,
    pub object_id: i64,
    pub op: String,
    pub data_json: Option<Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = sync_events)]
pub struct NewSyncEvent {
    pub id: i64,
    pub user_id: i64,
    pub object_type: String,
    pub object_id: i64,
    pub op: String,
    pub data_json: Option<Value>,
}
