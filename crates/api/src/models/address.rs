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
}

#[derive(Insertable)]
#[diesel(table_name = addresses)]
pub struct NewAddress<'a> {
    pub id: i64,
    pub address: &'a str,
}
