use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::raw_inbound_mails;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = raw_inbound_mails)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct RawInboundMail {
    pub id: i64,
    pub blob_key: String,
    pub raw_sha256: String,
    pub raw_size: i64,
    pub r2_key: Option<String>,
    pub received_at: DateTime<Utc>,
    pub processed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
    /// Receiver that accepted this message. `None` for rows ingested before
    /// receivers existed; delivery treats those as the system receiver.
    pub receiver_id: Option<i64>,
}

#[derive(Insertable)]
#[diesel(table_name = raw_inbound_mails)]
pub struct NewRawInboundMail<'a> {
    pub id: i64,
    pub blob_key: &'a str,
    pub raw_sha256: &'a str,
    pub raw_size: i64,
    pub r2_key: Option<&'a str>,
    pub receiver_id: Option<i64>,
}
