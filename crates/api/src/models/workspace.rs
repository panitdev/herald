use chrono::{DateTime, Utc};
use diesel::prelude::*;

use crate::schema::{workspace_members, workspaces};

/// The owner of email units and the holder of their membership list.
///
/// Receivers and senders do not carry ownership of their own: they belong to a
/// workspace, and the workspace decides who may administer them and bind
/// addresses to them. That is deliberately a different axis from
/// `user_addresses`, which decides who receives the mail delivered to an
/// address.
#[allow(dead_code)]
#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = workspaces)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Workspace {
    pub id: i64,
    /// `system` | `personal` | `team`.
    pub kind: String,
    pub name: String,
    /// `None` only for the system workspace, which nobody owns.
    pub owner_user_id: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Workspace {
    /// The deployment's own workspace. Every user counts as a member of it,
    /// which is what keeps open signup under `MAIL_DOMAIN` working.
    pub fn is_system(&self) -> bool {
        self.kind == "system"
    }
}

#[derive(Debug, Insertable)]
#[diesel(table_name = workspaces)]
pub struct NewWorkspace<'a> {
    pub id: i64,
    pub kind: &'a str,
    pub name: &'a str,
    pub owner_user_id: Option<i64>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = workspace_members)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct WorkspaceMember {
    pub workspace_id: i64,
    pub user_id: i64,
    /// `admin` | `member`.
    pub role: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = workspace_members)]
pub struct NewWorkspaceMember<'a> {
    pub workspace_id: i64,
    pub user_id: i64,
    pub role: &'a str,
}
