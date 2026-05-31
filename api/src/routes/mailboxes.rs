use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde_json::{json, Value};
use std::time::Instant;

use crate::{
    auth::kratos::KratosIdentity,
    error::{ApiResult, AppError},
    models::mailbox::{CreateMailboxRequest, Mailbox, MailboxResponse, NewMailbox},
    schema::mailboxes,
    state::AppState,
};

pub async fn list_mailboxes(
    identity: KratosIdentity,
    State(state): State<AppState>,
) -> ApiResult<Json<Value>> {
    let started_at = Instant::now();
    let user = identity.resolve_user(&state).await?;
    let mut conn = state.db.get().await?;

    // System folders first, then custom folders alphabetically.
    let rows: Vec<Mailbox> = mailboxes::table
        .filter(mailboxes::user_id.eq(user.id))
        .order((mailboxes::is_system.desc(), mailboxes::name.asc()))
        .select(Mailbox::as_select())
        .load(&mut conn)
        .await?;

    tracing::info!(
        target: "api",
        elapsed_ms = started_at.elapsed().as_millis(),
        user_id = user.id,
        count = rows.len(),
        "list_mailboxes"
    );

    let mailboxes: Vec<MailboxResponse> = rows.into_iter().map(MailboxResponse::from).collect();
    Ok(Json(json!({ "mailboxes": mailboxes })))
}

pub async fn create_mailbox(
    identity: KratosIdentity,
    State(state): State<AppState>,
    Json(body): Json<CreateMailboxRequest>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let name = body.name.trim().to_lowercase();
    if name.is_empty() {
        return Err(AppError::BadRequest("missing name".into()));
    }

    let user = identity.resolve_user(&state).await?;
    let mut conn = state.db.get().await?;

    // Reject duplicates against the user's existing folders.
    let exists: i64 = mailboxes::table
        .filter(mailboxes::user_id.eq(user.id))
        .filter(mailboxes::name.eq(&name))
        .count()
        .get_result(&mut conn)
        .await?;
    if exists > 0 {
        return Err(AppError::BadRequest("folder already exists".into()));
    }

    let new_mailbox = NewMailbox {
        id: state.next_id(),
        user_id: user.id,
        name,
        is_system: false,
    };

    let created: Mailbox = diesel::insert_into(mailboxes::table)
        .values(&new_mailbox)
        .returning(Mailbox::as_returning())
        .get_result(&mut conn)
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "mailbox": MailboxResponse::from(created) })),
    ))
}

pub async fn get_mailbox(
    identity: KratosIdentity,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let mailbox_id: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid id".into()))?;
    let user = identity.resolve_user(&state).await?;
    let mut conn = state.db.get().await?;

    let mailbox: Mailbox = mailboxes::table
        .filter(mailboxes::id.eq(mailbox_id))
        .filter(mailboxes::user_id.eq(user.id))
        .select(Mailbox::as_select())
        .first(&mut conn)
        .await
        .optional()?
        .ok_or(AppError::NotFound)?;

    Ok(Json(json!({ "mailbox": MailboxResponse::from(mailbox) })))
}

pub async fn delete_mailbox(
    identity: KratosIdentity,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let mailbox_id: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid id".into()))?;
    let user = identity.resolve_user(&state).await?;
    let mut conn = state.db.get().await?;

    let mailbox: Mailbox = mailboxes::table
        .filter(mailboxes::id.eq(mailbox_id))
        .filter(mailboxes::user_id.eq(user.id))
        .select(Mailbox::as_select())
        .first(&mut conn)
        .await
        .optional()?
        .ok_or(AppError::NotFound)?;

    if mailbox.is_system {
        return Err(AppError::BadRequest("cannot delete system folder".into()));
    }

    diesel::delete(mailboxes::table.find(mailbox_id))
        .execute(&mut conn)
        .await?;

    Ok(Json(json!({ "ok": true })))
}
