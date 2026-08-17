//! Workspaces: who owns email units, and who may do what with them.
//!
//! Receivers and senders used to carry `scope`/`owner_user_id` plus a member
//! table each, which meant the same access question was answered by two
//! near-identical implementations. Both now delegate here.
//!
//! Three kinds of workspace exist:
//!   * `system` — the deployment's own. Everyone is a `Member` of it, which is
//!     what keeps open signup under `MAIL_DOMAIN` working, and nobody is an
//!     `Admin`, so its units cannot be reconfigured through the API.
//!   * `personal` — auto-provisioned on first login, one per user, owned by
//!     them. Where a user's own units live by default.
//!   * `team` — created explicitly and shared through `workspace_members`.
//!
//! Membership here governs administration and address binding. It is a
//! different axis from `user_addresses`, which governs who receives the mail.

use diesel::{
    BoolExpressionMethods, ExpressionMethods, OptionalExtension, QueryDsl, SelectableHelper,
};
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::{
    error::AppError,
    ids::IdGen,
    models::workspace::{NewWorkspace, NewWorkspaceMember, Workspace},
    schema::{workspace_members, workspaces},
    state::AppState,
};

/// What a user may do with a workspace and everything in it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    /// May bind addresses to the workspace's units, but not reconfigure or
    /// share them.
    Member,
    /// May reconfigure, rotate credentials, share and delete.
    Admin,
}

impl Access {
    pub fn as_str(self) -> &'static str {
        match self {
            Access::Member => "member",
            Access::Admin => "admin",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "member" => Some(Access::Member),
            "admin" => Some(Access::Admin),
            _ => None,
        }
    }
}

pub async fn load(
    conn: &mut AsyncPgConnection,
    workspace_id: i64,
) -> Result<Workspace, AppError> {
    workspaces::table
        .find(workspace_id)
        .select(Workspace::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "workspaces.load.lookup"))?
        .ok_or(AppError::NotFound)
}

/// The deployment's workspace. Created by migration and re-provisioned on
/// startup, so this is expected to always resolve on a migrated database.
pub async fn system_workspace(conn: &mut AsyncPgConnection) -> Result<Workspace, AppError> {
    workspaces::table
        .filter(workspaces::kind.eq("system"))
        .select(Workspace::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "workspaces.system_workspace.lookup"))?
        .ok_or_else(|| AppError::BadRequest("no system workspace is provisioned".into()))
}

/// Create the system workspace if the database has none. The migration inserts
/// one, so this only fires on a database that predates it or had the row
/// removed by hand — but the deployment receiver has nowhere to live without
/// it, so startup asserts it rather than discovering the gap on first delivery.
pub async fn ensure_system_workspace(state: &AppState) -> Result<Workspace, AppError> {
    let mut conn = state.db.get().await?;

    if let Some(existing) = workspaces::table
        .filter(workspaces::kind.eq("system"))
        .select(Workspace::as_select())
        .first(&mut conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "workspaces.ensure_system_workspace.lookup"))?
    {
        return Ok(existing);
    }

    diesel::insert_into(workspaces::table)
        .values(&NewWorkspace {
            id: state.next_id(),
            kind: "system",
            name: "Deployment",
            owner_user_id: None,
        })
        .returning(Workspace::as_returning())
        .get_result(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "workspaces.ensure_system_workspace.insert"))
}

/// Provision a user's personal workspace. Runs on every authenticated request,
/// so it is a single insert against the `(owner_user_id) WHERE kind =
/// 'personal'` unique index rather than a read followed by a write — concurrent
/// first logins would race the latter.
pub async fn ensure_personal_workspace(
    conn: &mut AsyncPgConnection,
    ids: &IdGen,
    user_id: i64,
    name: &str,
) -> Result<(), AppError> {
    let inserted = diesel::insert_into(workspaces::table)
        .values(&NewWorkspace {
            id: ids.next(),
            kind: "personal",
            name,
            owner_user_id: Some(user_id),
        })
        .on_conflict_do_nothing()
        .returning(workspaces::id)
        .get_result::<i64>(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "workspaces.ensure_personal_workspace.insert"))?;

    // Only the login that actually created the workspace records the owner's
    // membership; every later one short-circuits here.
    let Some(workspace_id) = inserted else {
        return Ok(());
    };

    diesel::insert_into(workspace_members::table)
        .values(&NewWorkspaceMember {
            workspace_id,
            user_id,
            role: Access::Admin.as_str(),
        })
        .on_conflict_do_nothing()
        .execute(conn)
        .await
        .map_err(|err| AppError::db(err, "workspaces.ensure_personal_workspace.insert_owner"))?;

    Ok(())
}

/// The user's own workspace, the default home for units they register.
pub async fn personal_workspace(
    conn: &mut AsyncPgConnection,
    user_id: i64,
) -> Result<Workspace, AppError> {
    workspaces::table
        .filter(workspaces::kind.eq("personal"))
        .filter(workspaces::owner_user_id.eq(user_id))
        .select(Workspace::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "workspaces.personal_workspace.lookup"))?
        .ok_or_else(|| AppError::BadRequest("you have no personal workspace yet".into()))
}

/// Ids of every workspace whose units `user_id` may use — what unit listing
/// filters on.
pub async fn accessible_ids(
    conn: &mut AsyncPgConnection,
    user_id: i64,
) -> Result<Vec<i64>, AppError> {
    Ok(list_for_user(conn, user_id)
        .await?
        .into_iter()
        .map(|workspace| workspace.id)
        .collect())
}

/// Every workspace `user_id` may see — the system one plus any they own or are
/// a member of — oldest first.
pub async fn list_for_user(
    conn: &mut AsyncPgConnection,
    user_id: i64,
) -> Result<Vec<Workspace>, AppError> {
    let member_ids = workspace_members::table
        .filter(workspace_members::user_id.eq(user_id))
        .select(workspace_members::workspace_id);

    workspaces::table
        .filter(
            workspaces::kind
                .eq("system")
                .or(workspaces::owner_user_id.eq(user_id))
                .or(workspaces::id.eq_any(member_ids)),
        )
        .order(workspaces::created_at.asc())
        .select(Workspace::as_select())
        .load(conn)
        .await
        .map_err(|err| AppError::db(err, "workspaces.list_for_user.load"))
}

/// What `user_id` may do with `workspace`. The system workspace is usable by
/// everyone but administered by nobody.
pub async fn access_for(
    conn: &mut AsyncPgConnection,
    workspace: &Workspace,
    user_id: i64,
) -> Result<Option<Access>, AppError> {
    if workspace.owner_user_id == Some(user_id) {
        return Ok(Some(Access::Admin));
    }

    let role: Option<String> = workspace_members::table
        .find((workspace.id, user_id))
        .select(workspace_members::role)
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "workspaces.access_for.lookup_member"))?;

    if let Some(role) = role {
        return Ok(Access::parse(&role));
    }

    if workspace.is_system() {
        return Ok(Some(Access::Member));
    }

    Ok(None)
}

pub async fn require_member(
    conn: &mut AsyncPgConnection,
    workspace: &Workspace,
    user_id: i64,
) -> Result<Access, AppError> {
    access_for(conn, workspace, user_id)
        .await?
        .ok_or_else(|| AppError::Forbidden("you do not have access to this workspace".into()))
}

pub async fn require_admin(
    conn: &mut AsyncPgConnection,
    workspace: &Workspace,
    user_id: i64,
) -> Result<(), AppError> {
    match require_member(conn, workspace, user_id).await? {
        Access::Admin => Ok(()),
        Access::Member => Err(AppError::Forbidden(
            "only an administrator of this workspace may do that".into(),
        )),
    }
}

/// Access to the workspace a unit belongs to, which is the unit's own access.
pub async fn access_for_unit(
    conn: &mut AsyncPgConnection,
    workspace_id: i64,
    user_id: i64,
) -> Result<Option<Access>, AppError> {
    let workspace = load(conn, workspace_id).await?;
    access_for(conn, &workspace, user_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn access_roles_round_trip() {
        assert_eq!(Access::parse("admin"), Some(Access::Admin));
        assert_eq!(Access::parse("member"), Some(Access::Member));
        assert_eq!(Access::parse("owner"), None);
        assert_eq!(Access::Admin.as_str(), "admin");
    }
}
