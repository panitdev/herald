use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::addresses;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = addresses)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Address {
    pub id: i64,
    pub address: String,
    pub created_at: DateTime<Utc>,
    /// Receiver unit that accepts inbound mail for this address.
    pub receiver_id: Option<i64>,
    /// Sender unit used when sending from this address.
    pub sender_id: Option<i64>,
}

#[derive(Insertable)]
#[diesel(table_name = addresses)]
pub struct NewAddress<'a> {
    pub id: i64,
    pub address: &'a str,
    pub receiver_id: Option<i64>,
    pub sender_id: Option<i64>,
}
