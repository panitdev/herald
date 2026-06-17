use axum::{
    body::Body,
    extract::{ws::WebSocketUpgrade, State},
    http::{header, Response, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use bytes::Bytes;
use diesel::{ExpressionMethods, QueryDsl, SelectableHelper};
use diesel_async::{AsyncConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    addresses::{ensure_user_address, find_address, user_has_address},
    auth::AuthUser,
    error::{ApiResult, AppError},
    models::{
        address::Address,
        sync_event::NewSyncEvent,
        user::{UpdateUserProfile, User},
    },
    schema::{addresses, sync_events, user_addresses, users::dsl::users},
    state::AppState,
};

pub mod chat;
pub mod internal;
pub mod objects;
pub mod sync;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/api/me", get(me).patch(update_me))
        .route("/api/me/addresses", post(create_address))
        .route("/api/me/avatar", get(me_avatar))
        .route(
            "/chat/conversations",
            get(chat::list_conversations).post(chat::create_conversation),
        )
        .route(
            "/chat/conversations/{id}/messages",
            get(chat::list_messages).post(chat::send_message),
        )
        .route("/realtime", get(realtime_socket))
        .route("/internal/mail/inbound", post(internal::inbound_mail))
        .route("/sync/bootstrap", post(sync::bootstrap))
        .route("/sync/pull", get(sync::pull))
        .route("/objects/messages/{id}/raw", get(objects::raw_message))
        .route("/objects/messages/{id}/body", get(objects::message_body))
}

async fn realtime_socket(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    ws: WebSocketUpgrade,
) -> ApiResult<impl IntoResponse> {
    let rx = state.realtime.subscribe(user.id);
    Ok(ws.on_upgrade(move |socket| crate::realtime::serve_socket(socket, rx)))
}

#[derive(Serialize)]
struct MeResponse {
    id: String,
    username: String,
    address: String,
    addresses: Vec<AddressResponse>,
    display_name: String,
    avatar_url: Option<String>,
}

#[derive(Serialize)]
struct AddressResponse {
    id: String,
    address: String,
    created_at: String,
}

#[derive(Serialize)]
struct CreateAddressResponse {
    address: AddressResponse,
    addresses: Vec<AddressResponse>,
}

#[derive(Deserialize)]
struct UpdateMeRequest {
    display_name: Option<String>,
    avatar_url: Option<Option<String>>,
}

#[derive(Deserialize)]
struct CreateAddressRequest {
    address: String,
}

async fn me(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<MeResponse>> {
    let addresses = load_user_addresses(&state, user.id).await?;
    Ok(Json(me_response(&user, addresses)))
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
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
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
            state.blob_store.put(&key, bytes, &content_type).await?;
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
        avatar_url: next_avatar_key.as_ref().map(|value| value.as_deref()),
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

    let addresses = load_user_addresses(&state, updated.id).await?;

    Ok(Json(me_response(&updated, addresses)))
}

async fn create_address(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(input): Json<CreateAddressRequest>,
) -> ApiResult<Json<CreateAddressResponse>> {
    let normalized = normalize_address_input(&input.address, &state.config.mail_domain)?;
    let mut conn = state.db.get().await?;

    let (created, addresses) = conn
        .transaction::<_, AppError, _>(|conn| {
            let state = state.clone();
            let normalized = normalized.clone();
            Box::pin(async move {
                if let Some(existing) = find_address(conn, &normalized).await? {
                    if !user_has_address(conn, user.id, existing.id).await? {
                        return Err(AppError::BadRequest("address is already registered".into()));
                    }
                }

                let ensured = ensure_user_address(conn, &state.ids, user.id, &normalized).await?;
                let event_mailboxes = if ensured.granted {
                    &ensured.mailboxes.all
                } else {
                    &ensured.mailboxes.created
                };
                let events: Vec<NewSyncEvent> = event_mailboxes
                    .iter()
                    .map(|mailbox| NewSyncEvent {
                        id: state.next_id(),
                        user_id: user.id,
                        object_type: "mailbox".to_owned(),
                        object_id: mailbox.id,
                        op: "upsert".to_owned(),
                        data_json: Some(json!(mailbox)),
                    })
                    .collect();

                if !events.is_empty() {
                    diesel::insert_into(sync_events::table)
                        .values(&events)
                        .execute(conn)
                        .await?;
                }

                let addresses = load_user_addresses_with_conn(conn, user.id).await?;
                Ok((ensured.address, addresses))
            })
        })
        .await?;

    Ok(Json(CreateAddressResponse {
        address: address_response(&created),
        addresses: addresses
            .into_iter()
            .map(|address| address_response(&address))
            .collect(),
    }))
}

fn me_response(user: &User, addresses: Vec<Address>) -> MeResponse {
    MeResponse {
        id: user.id.to_string(),
        username: user.username.clone(),
        address: user.address.clone(),
        addresses: addresses
            .into_iter()
            .map(|address| address_response(&address))
            .collect(),
        display_name: if user.display_name.trim().is_empty() {
            user.username.clone()
        } else {
            user.display_name.clone()
        },
        avatar_url: avatar_public_url(user),
    }
}

async fn load_user_addresses(state: &AppState, user_id: i64) -> Result<Vec<Address>, AppError> {
    let mut conn = state.db.get().await?;
    load_user_addresses_with_conn(&mut conn, user_id).await
}

async fn load_user_addresses_with_conn(
    conn: &mut diesel_async::AsyncPgConnection,
    user_id: i64,
) -> Result<Vec<Address>, AppError> {
    let address_ids = user_addresses::table
        .filter(user_addresses::user_id.eq(user_id))
        .select(user_addresses::address_id);

    let rows = addresses::table
        .filter(addresses::id.eq_any(address_ids))
        .order(addresses::created_at.asc())
        .select(Address::as_select())
        .load(conn)
        .await?;

    Ok(rows)
}

fn address_response(address: &Address) -> AddressResponse {
    AddressResponse {
        id: address.id.to_string(),
        address: address.address.clone(),
        created_at: address.created_at.to_rfc3339(),
    }
}

fn normalize_address_input(value: &str, mail_domain: &str) -> Result<String, AppError> {
    let trimmed = value.trim().to_lowercase();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("address is required".into()));
    }

    let normalized = if trimmed.contains('@') {
        trimmed
    } else {
        format!("{trimmed}@{}", mail_domain.to_lowercase())
    };

    let Some((local, domain)) = normalized.split_once('@') else {
        return Err(AppError::BadRequest(
            "address must be a valid email address".into(),
        ));
    };

    if local.is_empty() || local.len() > 64 || domain != mail_domain.to_lowercase() {
        return Err(AppError::BadRequest(format!(
            "address must be under {}",
            mail_domain
        )));
    }

    if !local
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'))
    {
        return Err(AppError::BadRequest(
            "address can only contain letters, numbers, dots, underscores, and hyphens".into(),
        ));
    }

    Ok(normalized)
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

    let content_type = meta.trim_start_matches("data:").trim_end_matches(";base64");

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
