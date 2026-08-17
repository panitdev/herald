//! Shared plumbing for the two email unit APIs (receivers and senders).
//!
//! Both are registrable, both are shareable, and both bind to addresses, so
//! their request/response vocabulary is deliberately identical.

use std::collections::HashMap;

use diesel_async::AsyncPgConnection;
use serde::Serialize;

use crate::{
    error::AppError,
    models::{user::User, workspace::Workspace},
    workspaces::{self, Access},
};

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

/// Where a newly registered unit goes: the workspace the caller named, or their
/// own if they named none. Registering into a workspace is an administrative
/// act, so it takes more than membership.
pub async fn target_workspace(
    conn: &mut AsyncPgConnection,
    user_id: i64,
    requested: Option<&str>,
) -> Result<Workspace, AppError> {
    let workspace = match requested {
        Some(value) => workspaces::load(conn, parse_id(value)?).await?,
        None => workspaces::personal_workspace(conn, user_id).await?,
    };

    workspaces::require_admin(conn, &workspace, user_id).await?;
    Ok(workspace)
}

/// Every workspace the caller can reach, with the access they have in it,
/// keyed by id. Unit listings resolve each row's owner through this rather than
/// querying per unit.
pub async fn accessible_workspaces(
    conn: &mut AsyncPgConnection,
    user_id: i64,
) -> Result<HashMap<i64, (Workspace, Option<Access>)>, AppError> {
    let mut out = HashMap::new();
    for workspace in workspaces::list_for_user(conn, user_id).await? {
        let access = workspaces::access_for(conn, &workspace, user_id).await?;
        out.insert(workspace.id, (workspace, access));
    }
    Ok(out)
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
