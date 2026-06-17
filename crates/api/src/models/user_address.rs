use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

use crate::schema::user_addresses;

#[allow(dead_code)]
#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = user_addresses)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct UserAddress {
    pub user_id: i64,
    pub address_id: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = user_addresses)]
pub struct NewUserAddress {
    pub user_id: i64,
    pub address_id: i64,
}
