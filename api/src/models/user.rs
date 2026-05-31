use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;
use uuid::Uuid;

use crate::schema::users;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = users)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct User {
    pub id: i64,
    pub kratos_id: Uuid,
    pub address: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl User {
    /// Local-part of the email address used as a display username.
    pub fn username(&self) -> &str {
        self.address.split('@').next().unwrap_or(&self.address)
    }
}

#[derive(Insertable)]
#[diesel(table_name = users)]
pub struct NewUser {
    pub id: i64,
    pub kratos_id: Uuid,
    pub address: String,
}

#[derive(Serialize)]
pub struct UserResponse {
    pub id: String,
    pub kratos_id: String,
    pub address: String,
    pub username: String,
    pub created_at: String,
}

impl From<User> for UserResponse {
    fn from(u: User) -> Self {
        let username = u.username().to_string();
        Self {
            id: u.id.to_string(),
            kratos_id: u.kratos_id.to_string(),
            address: u.address,
            username,
            created_at: u.created_at.to_rfc3339(),
        }
    }
}
