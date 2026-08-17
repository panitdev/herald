use axum::{
    body::Body,
    extract::{ws::WebSocketUpgrade, State},
    http::{header, HeaderMap, Response, StatusCode},
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
    email::registry,
    receivers,
    auth::{extract_token, AuthUser},
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
pub mod contacts;
pub mod drops;
pub mod email_receivers;
pub mod email_senders;
pub mod internal;
pub mod objects;
pub mod sync;
pub mod units;
pub mod workspaces;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/api/me", get(me).patch(update_me))
        .route("/api/logout", post(logout))
        .route("/api/me/addresses", post(create_address))
        .route("/api/me/addresses/{id}/units", axum::routing::patch(bind_address_units))
        .route("/api/me/avatar", get(me_avatar))
        .route(
            "/api/me/email-senders",
            get(email_senders::list_email_senders).post(email_senders::create_email_sender),
        )
        .route(
            "/api/me/email-senders/{id}",
            axum::routing::delete(email_senders::delete_email_sender),
        )
        .route(
            "/api/me/email-senders/test",
            post(email_senders::send_test_email),
        )
        .route(
            "/api/me/email-receivers",
            get(email_receivers::list_email_receivers)
                .post(email_receivers::create_email_receiver),
        )
        .route(
            "/api/me/email-receivers/{id}",
            axum::routing::patch(email_receivers::update_email_receiver)
                .delete(email_receivers::delete_email_receiver),
        )
        .route(
            "/api/me/email-receivers/{id}/token",
            post(email_receivers::rotate_email_receiver_token),
        )
        // Units are shared through their workspace, so membership is edited in
        // exactly one place regardless of which kind of unit it governs.
        .route(
            "/api/me/workspaces",
            get(workspaces::list_workspaces).post(workspaces::create_workspace),
        )
        .route(
            "/api/me/workspaces/{id}",
            axum::routing::delete(workspaces::delete_workspace),
        )
        .route(
            "/api/me/workspaces/{id}/members",
            get(workspaces::list_workspace_members).post(workspaces::add_workspace_member),
        )
        .route(
            "/api/me/workspaces/{id}/members/{user_id}",
            axum::routing::delete(workspaces::remove_workspace_member),
        )
        .route(
            "/chat/conversations",
            get(chat::list_conversations).post(chat::create_conversation),
        )
        .route(
            "/chat/conversations/{id}/messages",
            get(chat::list_messages).post(chat::send_message),
        )
        .route("/api/users/search", get(contacts::search_users))
        .route(
            "/api/contacts",
            get(contacts::list_contacts).post(contacts::add_contact),
        )
        .route(
            "/api/contacts/{user_id}",
            axum::routing::delete(contacts::remove_contact),
        )
        .route("/drops", post(drops::create_drop))
        .route("/drops/{id}", axum::routing::delete(drops::delete_drop))
        .route("/realtime", get(realtime_socket))
        .route("/internal/mail/inbound", post(internal::inbound_mail))
        .route("/sync/bootstrap", post(sync::bootstrap))
        .route("/sync/pull", get(sync::pull))
        .route("/objects/messages/{id}/raw", get(objects::raw_message))
        .route("/objects/messages/{id}/body", get(objects::message_body))
}

/// Revokes the caller's Surge session (best-effort) and clears the `surge_session` cookie
/// for the configured cookie domain. Unauthenticated calls are a no-op success — logout
/// should never itself require being logged in.
async fn logout(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Some(raw_token) = extract_token(&headers) {
        if let Some(token) = surge::SessionToken::from_raw(&raw_token) {
            if let Err(error) = state.auth.revoke_session(&token).await {
                tracing::warn!(error = %error, "failed to revoke surge session during logout");
            }
        }
    }

    let clear_cookie = format!(
        "surge_session=; Domain={}; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
        state.config.surge_cookie_domain
    );

    (
        StatusCode::NO_CONTENT,
        [(header::SET_COOKIE, clear_cookie)],
    )
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
#[serde(rename_all = "camelCase")]
struct AddressResponse {
    id: String,
    address: String,
    created_at: String,
    /// Receiver unit that delivers inbound mail for this address.
    receiver_id: Option<String>,
    /// Sender unit used when sending from this address.
    sender_id: Option<String>,
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

/// Distinguishing "bind to nothing" (`null`) from "leave alone" (absent) needs
/// key presence, which `Option<Option<T>>` cannot express through serde — so
/// the body is read as raw JSON and the two fields are pulled out by hand.
fn unit_field(body: &serde_json::Value, key: &str) -> Result<Option<Option<i64>>, AppError> {
    let object = body
        .as_object()
        .ok_or_else(|| AppError::BadRequest("body must be a JSON object".into()))?;

    let Some(value) = object.get(key) else {
        return Ok(None);
    };

    match value {
        serde_json::Value::Null => Ok(Some(None)),
        serde_json::Value::String(raw) => Ok(Some(Some(units::parse_id(raw)?))),
        _ => Err(AppError::BadRequest(format!(
            "{key} must be an id string or null"
        ))),
    }
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
        .map_err(|err| AppError::db(err, "routes.update_me.update_user_profile"))?;

    let addresses = load_user_addresses(&state, updated.id).await?;

    Ok(Json(me_response(&updated, addresses)))
}

/// Claim an address.
///
/// With user-registered receivers, claiming is an authority question: an
/// address may only be claimed under a domain whose receiver the caller is a
/// member of. The system receiver keeps `MAIL_DOMAIN` open to everyone, which
/// is what preserves the previous behaviour.
async fn create_address(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(input): Json<CreateAddressRequest>,
) -> ApiResult<Json<CreateAddressResponse>> {
    let normalized = normalize_address_input(&input.address, &state.config.mail_domain)?;
    let mut conn = state.db.get().await?;

    let (_, domain) = normalized
        .split_once('@')
        .ok_or_else(|| AppError::BadRequest("address must be a valid email address".into()))?;
    let receiver = receivers::find_for_domain(&mut conn, domain)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!("no email receiver is registered for `{domain}`"))
        })?;
    receivers::require_member(&mut conn, &receiver, user.id).await?;

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

/// Bind (or unbind) the receiver and sender units of one of the caller's
/// addresses. An address has exactly one of each; passing `null` clears the
/// binding, omitting a field leaves it untouched.
async fn bind_address_units(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    axum::extract::Path(address_id): axum::extract::Path<i64>,
    Json(input): Json<serde_json::Value>,
) -> ApiResult<Json<AddressResponse>> {
    let mut conn = state.db.get().await?;

    if !user_has_address(&mut conn, user.id, address_id).await? {
        return Err(AppError::NotFound);
    }

    let address: Address = addresses::table
        .find(address_id)
        .select(Address::as_select())
        .first(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "routes.bind_address_units.lookup_address"))?;
    let address_domain = address
        .address
        .split_once('@')
        .map(|(_, domain)| domain.to_owned());

    let mut receiver_id = unit_field(&input, "receiverId")?;
    if let Some(Some(id)) = receiver_id {
        let receiver = receivers::load_with_conn(&mut conn, id).await?;
        receivers::require_member(&mut conn, &receiver, user.id).await?;

        // A domain-pinned receiver will never be routed mail for another
        // domain, so binding it there would only look like it works.
        if let (Some(pinned), Some(domain)) = (receiver.mail_domain.as_deref(), address_domain.as_deref())
        {
            if !pinned.eq_ignore_ascii_case(domain) {
                return Err(AppError::BadRequest(format!(
                    "this receiver only accepts mail for `{pinned}`"
                )));
            }
        }

        receiver_id = Some(Some(receiver.id));
    }

    let mut sender_id = unit_field(&input, "senderId")?;
    if let Some(Some(id)) = sender_id {
        let sender = registry::load_with_conn(&mut conn, id).await?;
        registry::require_member(&mut conn, &sender, user.id).await?;

        if let (Some(pinned), Some(domain)) = (sender.mail_domain.as_deref(), address_domain.as_deref())
        {
            if !pinned.eq_ignore_ascii_case(domain) {
                return Err(AppError::BadRequest(format!(
                    "this sender only sends from `{pinned}`"
                )));
            }
        }

        sender_id = Some(Some(sender.id));
    }

    if receiver_id.is_none() && sender_id.is_none() {
        return Err(AppError::BadRequest(
            "provide receiverId and/or senderId".into(),
        ));
    }

    let updated: Address = diesel::update(addresses::table.find(address_id))
        .set((
            receiver_id.map(|value| addresses::receiver_id.eq(value)),
            sender_id.map(|value| addresses::sender_id.eq(value)),
        ))
        .returning(Address::as_returning())
        .get_result(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "routes.bind_address_units.update"))?;

    Ok(Json(address_response(&updated)))
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
        receiver_id: address.receiver_id.map(|id| id.to_string()),
        sender_id: address.sender_id.map(|id| id.to_string()),
    }
}

/// Normalize a claimed address. A bare local part is completed with the
/// deployment domain; a full address may name any domain, because which domains
/// are claimable is decided by receiver membership rather than by config.
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

    if local.is_empty() || local.len() > 64 {
        return Err(AppError::BadRequest(
            "address local part must be between 1 and 64 characters".into(),
        ));
    }

    let domain_valid = domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && domain
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'));
    if !domain_valid {
        return Err(AppError::BadRequest(
            "address must have a valid domain".into(),
        ));
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
