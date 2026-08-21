//! Workspace management: the one place membership is edited.
//!
//! Receivers and senders no longer have member lists of their own — sharing a
//! unit means sharing the workspace it lives in, which is also how a user gets
//! the right to bind addresses to it.

use axum::{
    Json,
    extract::{Path, State},
};
use diesel::{ExpressionMethods, QueryDsl, SelectableHelper};
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};

use crate::{
    auth::AuthUser,
    error::{ApiResult, AppError},
    models::{
        user::User,
        workspace::{NewWorkspace, NewWorkspaceMember, Workspace},
    },
    schema::{users, workspace_members, workspaces},
    state::AppState,
    workspaces::{self as workspace_access, Access},
};

use super::units::{MemberResponse, OkResponse, parse_id};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResponse {
    id: String,
    /// `system` | `personal` | `team`.
    kind: String,
    name: String,
    /// What the requesting user may do in this workspace.
    access: String,
    created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceRequest {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMemberRequest {
    user_id: String,
    /// `member` (default) or `admin`.
    role: Option<String>,
}

pub async fn list_workspaces(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Vec<WorkspaceResponse>>> {
    let mut conn = state.db.get().await?;
    let records = workspace_access::list_for_user(&mut conn, user.id).await?;

    let mut out = Vec::with_capacity(records.len());
    for record in &records {
        let access = workspace_access::access_for(&mut conn, record, user.id).await?;
        out.push(workspace_response(record, access));
    }

    Ok(Json(out))
}

/// Create a shared workspace. Personal workspaces are provisioned at login and
/// the system one by the deployment, so `team` is the only kind that can be
/// asked for.
pub async fn create_workspace(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(input): Json<CreateWorkspaceRequest>,
) -> ApiResult<Json<WorkspaceResponse>> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(AppError::BadRequest(
            "name is required and must be 120 characters or fewer".into(),
        ));
    }

    let mut conn = state.db.get().await?;
    let inserted = diesel::insert_into(workspaces::table)
        .values(&NewWorkspace {
            id: state.next_id(),
            kind: "team",
            name,
            owner_user_id: Some(user.id),
        })
        .returning(Workspace::as_returning())
        .get_result(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "workspaces.create.insert"))?;

    // The owner is an admin by ownership; recording the membership too keeps
    // the sharing list honest about who has access.
    diesel::insert_into(workspace_members::table)
        .values(&NewWorkspaceMember {
            workspace_id: inserted.id,
            user_id: user.id,
            role: Access::Admin.as_str(),
        })
        .on_conflict_do_nothing()
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "workspaces.create.insert_owner_member"))?;

    Ok(Json(workspace_response(&inserted, Some(Access::Admin))))
}

/// Delete a workspace and, by cascade, every unit in it. Addresses bound to
/// those units survive with a null binding — see `mail::is_deliverable`.
pub async fn delete_workspace(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<i64>,
) -> ApiResult<Json<OkResponse>> {
    let mut conn = state.db.get().await?;
    let record = workspace_access::load(&mut conn, id).await?;
    workspace_access::require_admin(&mut conn, &record, user.id).await?;

    // A personal workspace is where a user's own units live and is recreated on
    // their next login; deleting it would quietly destroy them.
    if record.kind != "team" {
        return Err(AppError::BadRequest(
            "only team workspaces can be deleted".into(),
        ));
    }

    diesel::delete(workspaces::table.find(record.id))
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "workspaces.delete.execute"))?;

    Ok(Json(OkResponse { ok: true }))
}

pub async fn list_workspace_members(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<i64>,
) -> ApiResult<Json<Vec<MemberResponse>>> {
    let mut conn = state.db.get().await?;
    let record = workspace_access::load(&mut conn, id).await?;
    workspace_access::require_member(&mut conn, &record, user.id).await?;

    let rows: Vec<(i64, String, User)> = workspace_members::table
        .inner_join(users::table)
        .filter(workspace_members::workspace_id.eq(record.id))
        .select((
            workspace_members::user_id,
            workspace_members::role,
            User::as_select(),
        ))
        .load(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "workspaces.list_members.load"))?;

    Ok(Json(
        rows.into_iter()
            .map(|(user_id, role, member)| MemberResponse::new(user_id, &role, &member))
            .collect(),
    ))
}

pub async fn add_workspace_member(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<i64>,
    Json(input): Json<AddMemberRequest>,
) -> ApiResult<Json<MemberResponse>> {
    let mut conn = state.db.get().await?;
    let record = workspace_access::load(&mut conn, id).await?;
    workspace_access::require_admin(&mut conn, &record, user.id).await?;

    let member_user_id = parse_id(&input.user_id)?;
    let role = Access::parse(input.role.as_deref().unwrap_or("member"))
        .ok_or_else(|| AppError::BadRequest("role must be one of: member, admin".into()))?;

    let member: User = users::table
        .find(member_user_id)
        .select(User::as_select())
        .first(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "workspaces.add_member.lookup_user"))?;

    diesel::insert_into(workspace_members::table)
        .values(&NewWorkspaceMember {
            workspace_id: record.id,
            user_id: member.id,
            role: role.as_str(),
        })
        .on_conflict((workspace_members::workspace_id, workspace_members::user_id))
        .do_update()
        .set(workspace_members::role.eq(role.as_str()))
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "workspaces.add_member.insert"))?;

    Ok(Json(MemberResponse::new(member.id, role.as_str(), &member)))
}

pub async fn remove_workspace_member(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, member_user_id)): Path<(i64, i64)>,
) -> ApiResult<Json<OkResponse>> {
    let mut conn = state.db.get().await?;
    let record = workspace_access::load(&mut conn, id).await?;
    workspace_access::require_admin(&mut conn, &record, user.id).await?;

    // The owner's own membership is what makes the workspace administrable;
    // removing it would leave nobody able to share or reconfigure it.
    if record.owner_user_id == Some(member_user_id) {
        return Err(AppError::BadRequest(
            "the owner cannot be removed from their own workspace".into(),
        ));
    }

    let deleted = diesel::delete(workspace_members::table.find((record.id, member_user_id)))
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "workspaces.remove_member.delete"))?;

    if deleted == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(OkResponse { ok: true }))
}

fn workspace_response(record: &Workspace, access: Option<Access>) -> WorkspaceResponse {
    WorkspaceResponse {
        id: record.id.to_string(),
        kind: record.kind.clone(),
        name: record.name.clone(),
        access: access.map(Access::as_str).unwrap_or("none").to_owned(),
        created_at: record.created_at.to_rfc3339(),
    }
}
