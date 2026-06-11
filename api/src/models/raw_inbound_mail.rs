use chrono::{DateTime, Utc};
use diesel::prelude::*;

use crate::schema::raw_inbound_mails;

#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = raw_inbound_mails)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct RawInboundMail {
    pub id: i64,
    pub raw_mime: Vec<u8>,
    pub r2_key: Option<String>,
    pub received_at: DateTime<Utc>,
    pub processed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

#[derive(Insertable)]
#[diesel(table_name = raw_inbound_mails)]
pub struct NewRawInboundMail<'a> {
    pub id: i64,
    pub raw_mime: &'a [u8],
    pub r2_key: Option<&'a str>,
}
