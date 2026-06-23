use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};

use crate::{
    auth::AuthUser,
    error::{ApiResult, AppError},
    models::user::User,
    schema::{contacts, users},
    state::AppState,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserResult {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactUser {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub added_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddContactRequest {
    pub user_id: String,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub users: Vec<UserResult>,
}

#[derive(Debug, Serialize)]
pub struct ContactsResponse {
    pub contacts: Vec<ContactUser>,
}

#[derive(Debug, Serialize)]
pub struct ContactResponse {
    pub contact: ContactUser,
}

#[derive(Debug, Serialize)]
pub struct OkResponse {
    pub ok: bool,
}

pub async fn search_users(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Json<SearchResponse>> {
    let q = query.q.trim().to_lowercase();
    if q.is_empty() {
        return Ok(Json(SearchResponse { users: vec![] }));
    }

    let pattern = format!("%{}%", q);
    let mut conn = state.db.get().await?;

    // username is stored lowercase; display_name uses ILIKE for case-insensitive match
    let rows = users::table
        .filter(users::id.ne(user.id))
        .filter(
            users::username
                .like(&pattern)
                .or(users::display_name.ilike(&pattern)),
        )
        .order(users::username.asc())
        .limit(4)
        .select(User::as_select())
        .load(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "contacts.search_users.load"))?;

    let results = rows.into_iter().map(user_to_result).collect();

    Ok(Json(SearchResponse { users: results }))
}

pub async fn list_contacts(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<ContactsResponse>> {
    let mut conn = state.db.get().await?;

    let rows: Vec<(User, DateTime<Utc>)> = contacts::table
        .inner_join(users::table.on(users::id.eq(contacts::contact_user_id)))
        .filter(contacts::owner_user_id.eq(user.id))
        .order(contacts::created_at.asc())
        .select((User::as_select(), contacts::created_at))
        .load(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "contacts.list_contacts.load"))?;

    let contacts_list = rows
        .into_iter()
        .map(|(u, added_at)| ContactUser {
            id: u.id.to_string(),
            username: u.username.clone(),
            display_name: resolve_display_name(&u),
            avatar_url: avatar_url_for(&u.avatar_url),
            added_at,
        })
        .collect();

    Ok(Json(ContactsResponse {
        contacts: contacts_list,
    }))
}

pub async fn add_contact(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(input): Json<AddContactRequest>,
) -> ApiResult<(StatusCode, Json<ContactResponse>)> {
    let contact_user_id: i64 = input
        .user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user_id".into()))?;

    if contact_user_id == user.id {
        return Err(AppError::BadRequest("cannot add yourself as contact".into()));
    }

    let mut conn = state.db.get().await?;

    let contact_user = users::table
        .find(contact_user_id)
        .select(User::as_select())
        .first(&mut conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "contacts.add_contact.find_user"))?
        .ok_or(AppError::NotFound)?;

    let now = Utc::now();
    diesel::insert_into(contacts::table)
        .values((
            contacts::owner_user_id.eq(user.id),
            contacts::contact_user_id.eq(contact_user_id),
            contacts::created_at.eq(now),
        ))
        .on_conflict((contacts::owner_user_id, contacts::contact_user_id))
        .do_nothing()
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "contacts.add_contact.insert"))?;

    let added_at = contacts::table
        .filter(contacts::owner_user_id.eq(user.id))
        .filter(contacts::contact_user_id.eq(contact_user_id))
        .select(contacts::created_at)
        .first(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "contacts.add_contact.load_created_at"))?;

    Ok((
        StatusCode::CREATED,
        Json(ContactResponse {
            contact: ContactUser {
                id: contact_user.id.to_string(),
                username: contact_user.username.clone(),
                display_name: resolve_display_name(&contact_user),
                avatar_url: avatar_url_for(&contact_user.avatar_url),
                added_at,
            },
        }),
    ))
}

pub async fn remove_contact(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(contact_user_id): Path<String>,
) -> ApiResult<Json<OkResponse>> {
    let contact_user_id: i64 = contact_user_id
        .parse()
        .map_err(|_| AppError::BadRequest("invalid user_id".into()))?;

    let mut conn = state.db.get().await?;

    diesel::delete(
        contacts::table
            .filter(contacts::owner_user_id.eq(user.id))
            .filter(contacts::contact_user_id.eq(contact_user_id)),
    )
    .execute(&mut conn)
    .await
    .map_err(|err| AppError::db(err, "contacts.remove_contact.delete"))?;

    Ok(Json(OkResponse { ok: true }))
}

fn resolve_display_name(user: &User) -> String {
    if user.display_name.trim().is_empty() {
        user.username.clone()
    } else {
        user.display_name.clone()
    }
}

fn user_to_result(u: User) -> UserResult {
    UserResult {
        id: u.id.to_string(),
        display_name: resolve_display_name(&u),
        username: u.username.clone(),
        avatar_url: avatar_url_for(&u.avatar_url),
    }
}

fn avatar_url_for(avatar_url: &Option<String>) -> Option<String> {
    let avatar = avatar_url.as_deref()?;
    if avatar.trim().is_empty() {
        return None;
    }
    if avatar.starts_with("data:") {
        return Some(avatar.to_owned());
    }
    Some("/api/me/avatar".to_owned())
}
