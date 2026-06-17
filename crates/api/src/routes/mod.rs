use axum::{
    body::Body,
    extract::State,
    http::{header, Response, StatusCode},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use bytes::Bytes;
use diesel::{ExpressionMethods, QueryDsl, SelectableHelper};
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    auth::AuthUser,
    error::{ApiResult, AppError},
    models::user::{UpdateUserProfile, User},
    schema::users::dsl::users,
    state::AppState,
};

pub mod internal;
pub mod objects;
pub mod sync;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/api/me", get(me).patch(update_me))
        .route("/api/me/avatar", get(me_avatar))
        .route("/internal/mail/inbound", post(internal::inbound_mail))
        .route("/sync/bootstrap", post(sync::bootstrap))
        .route("/sync/pull", get(sync::pull))
        .route("/objects/messages/{id}/raw", get(objects::raw_message))
        .route("/objects/messages/{id}/body", get(objects::message_body))
}

#[derive(Serialize)]
struct MeResponse {
    id: String,
    username: String,
    address: String,
    display_name: String,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct UpdateMeRequest {
    display_name: Option<String>,
    avatar_url: Option<Option<String>>,
}

async fn me(AuthUser(user): AuthUser) -> Json<MeResponse> {
    Json(me_response(&user))
}

async fn me_avatar(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Response<Body>> {
    let Some(key) = user.avatar_url.as_deref() else {
        return Err(AppError::NotFound);
    };

    if key.starts_with("data:") {
        let blob = decode_data_url(key)?;
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, blob.1)
            .header(header::CACHE_CONTROL, "private, max-age=300")
            .body(Body::from(blob.0))
            .map_err(|_| AppError::Internal);
    }

    let blob = state.blob_store.get(key).await?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, blob.content_type)
        .header(header::CACHE_CONTROL, "private, max-age=300")
        .body(Body::from(blob.bytes))
        .map_err(|_| AppError::Internal)
}

async fn update_me(
    AuthUser(user): AuthUser,
    State(state): State<AppState>,
    Json(input): Json<UpdateMeRequest>,
) -> ApiResult<Json<MeResponse>> {
    let mut conn = state.db.get().await?;

    let next_display_name = input
        .display_name
        .as_deref()
        .map(str::trim)
        .unwrap_or(&user.display_name);
    validate_display_name(next_display_name)?;

    let next_avatar_key = match input.avatar_url.as_ref() {
        Some(Some(avatar_data_url)) => {
            let (bytes, content_type) = decode_data_url(avatar_data_url)?;
            validate_avatar_bytes(&bytes)?;
            let key = format!("avatars/{}/profile", user.id);
            state
                .blob_store
                .put(&key, bytes, &content_type)
                .await?;
            Some(Some(key))
        }
        Some(None) => {
            if let Some(existing_key) = user.avatar_url.as_deref() {
                if !existing_key.starts_with("data:") {
                    state.blob_store.delete(existing_key).await?;
                }
            }
            Some(None)
        }
        None => None,
    };

    let patch = UpdateUserProfile {
        display_name: input.display_name.as_deref().map(str::trim),
        avatar_url: next_avatar_key
            .as_ref()
            .map(|value| value.as_deref()),
    };

    let updated = diesel::update(users.filter(crate::schema::users::id.eq(user.id)))
        .set((
            patch,
            crate::schema::users::updated_at.eq(chrono::Utc::now()),
        ))
        .returning(User::as_returning())
        .get_result(&mut conn)
        .await
        .map_err(AppError::Db)?;

    Ok(Json(me_response(&updated)))
}

fn me_response(user: &User) -> MeResponse {
    MeResponse {
        id: user.id.to_string(),
        username: user.username.clone(),
        address: user.address.clone(),
        display_name: if user.display_name.trim().is_empty() {
            user.username.clone()
        } else {
            user.display_name.clone()
        },
        avatar_url: avatar_public_url(user),
    }
}

fn validate_display_name(value: &str) -> Result<(), AppError> {
    if value.is_empty() {
        return Err(AppError::BadRequest("display_name is required".into()));
    }
    if value.chars().count() > 80 {
        return Err(AppError::BadRequest(
            "display_name must be 80 characters or fewer".into(),
        ));
    }
    Ok(())
}

fn avatar_public_url(user: &User) -> Option<String> {
    let avatar = user.avatar_url.as_deref()?;
    if avatar.trim().is_empty() {
        return None;
    }

    if avatar.starts_with("data:") {
        return Some(avatar.to_owned());
    }

    Some("/api/me/avatar".to_owned())
}

fn decode_data_url(value: &str) -> Result<(Bytes, String), AppError> {
    let (meta, payload) = value
        .split_once(',')
        .ok_or_else(|| AppError::BadRequest("avatar_url must be a valid data URL".into()))?;
    if !meta.starts_with("data:") || !meta.ends_with(";base64") {
        return Err(AppError::BadRequest(
            "avatar_url must be a base64-encoded data URL".into(),
        ));
    }

    let content_type = meta
        .trim_start_matches("data:")
        .trim_end_matches(";base64");

    if !matches!(content_type, "image/png" | "image/jpeg" | "image/webp") {
        return Err(AppError::BadRequest(
            "avatar_url must be png, jpeg, or webp".into(),
        ));
    }

    let decoded = STANDARD
        .decode(payload)
        .map_err(|_| AppError::BadRequest("avatar_url is not valid base64".into()))?;

    Ok((Bytes::from(decoded), content_type.to_owned()))
}

fn validate_avatar_bytes(bytes: &Bytes) -> Result<(), AppError> {
    if bytes.is_empty() {
        return Err(AppError::BadRequest("avatar_url cannot be empty".into()));
    }
    if bytes.len() > 256 * 1024 {
        return Err(AppError::BadRequest("avatar_url is too large".into()));
    }
    Ok(())
}
