//! Shared plumbing for the two email unit APIs (receivers and senders).
//!
//! Both are registrable, both are shareable, and both bind to addresses, so
//! their request/response vocabulary is deliberately identical.

use serde::Serialize;

use crate::{error::AppError, models::user::User};

#[derive(Serialize)]
pub struct OkResponse {
    pub ok: bool,
}

/// A user a unit is shared with.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberResponse {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub role: String,
}

impl MemberResponse {
    pub fn new(user_id: i64, role: &str, user: &User) -> Self {
        Self {
            user_id: user_id.to_string(),
            username: user.username.clone(),
            display_name: user.display_name.clone(),
            role: role.to_owned(),
        }
    }
}

/// Snowflake ids cross the wire as strings so JS cannot round them off.
pub fn parse_id(value: &str) -> Result<i64, AppError> {
    value
        .trim()
        .parse::<i64>()
        .map_err(|_| AppError::BadRequest("id must be a numeric string".into()))
}

pub fn normalize_domain(value: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(raw) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    let domain = raw.to_lowercase();
    let valid = domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && domain
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'));

    if !valid {
        return Err(AppError::BadRequest(
            "mail_domain must be a valid domain".into(),
        ));
    }

    Ok(Some(domain))
}
