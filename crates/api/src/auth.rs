use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use diesel::{ExpressionMethods, OptionalExtension, QueryDsl, SelectableHelper};
use diesel_async::RunQueryDsl;
use serde::Deserialize;
use std::time::Instant;
use uuid::Uuid;

use crate::{
    addresses::ensure_user_address,
    error::AppError,
    models::user::{NewUser, User},
    state::AppState,
};

/// Verified Kratos session from the incoming request.
#[derive(Debug, Clone)]
pub struct KratosIdentity {
    pub kratos_user_id: Uuid,
    pub username: String,
}

#[derive(Deserialize)]
struct WhoAmIResponse {
    identity: KratosIdentityPayload,
}

#[derive(Deserialize)]
struct KratosIdentityPayload {
    id: Uuid,
    traits: KratosTraits,
}

#[derive(Deserialize)]
struct KratosTraits {
    username: String,
}

impl FromRequestParts<AppState> for KratosIdentity {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let started_at = Instant::now();

        let cookie_header = parts
            .headers
            .get(header::COOKIE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);

        let auth_header = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);

        let has_session_cookie = cookie_header
            .as_deref()
            .map(|c| c.contains("ory_kratos_session"))
            .unwrap_or(false);
        let has_bearer = auth_header
            .as_deref()
            .map(|a| a.starts_with("Bearer "))
            .unwrap_or(false);

        if !has_session_cookie && !has_bearer {
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis(),
                "kratos auth rejected before whoami"
            );
            return Err(AppError::Unauthorized(
                "missing session cookie or Bearer token".into(),
            ));
        }

        let whoami_url = format!("{}/sessions/whoami", state.config.kratos_public_url);
        let mut req = state.http.get(&whoami_url);

        if let Some(cookies) = &cookie_header {
            req = req.header(header::COOKIE, cookies);
        }
        if let Some(auth) = &auth_header {
            req = req.header(header::AUTHORIZATION, auth);
        }

        let whoami_started = Instant::now();
        let resp = req.send().await.map_err(AppError::Http)?;
        tracing::info!(
            elapsed_ms = whoami_started.elapsed().as_millis(),
            status = %resp.status(),
            "kratos whoami"
        );

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED
            || resp.status() == reqwest::StatusCode::FORBIDDEN
        {
            return Err(AppError::Unauthorized("invalid or expired session".into()));
        }

        if !resp.status().is_success() {
            return Err(AppError::Unauthorized(
                "identity provider session verification failed".into(),
            ));
        }

        let payload: WhoAmIResponse = resp.json().await.map_err(|_| {
            AppError::Unauthorized("unexpected response from identity provider".into())
        })?;

        tracing::info!(
            elapsed_ms = started_at.elapsed().as_millis(),
            username = %payload.identity.traits.username,
            "kratos identity extracted"
        );

        Ok(KratosIdentity {
            kratos_user_id: payload.identity.id,
            username: payload.identity.traits.username,
        })
    }
}

impl KratosIdentity {
    /// Returns the local `User` row, provisioning it (with default mailboxes) on first login.
    /// Safe to call concurrently — uses ON CONFLICT DO NOTHING for idempotent inserts.
    pub async fn resolve_user(&self, state: &AppState) -> Result<User, AppError> {
        use crate::schema::users::dsl::*;

        let mut conn = state.db.get().await?;

        let existing: Option<User> = users
            .filter(kratos_id.eq(self.kratos_user_id))
            .select(User::as_select())
            .first(&mut conn)
            .await
            .optional()
            .map_err(|err| AppError::db(err, "auth.resolve_user.lookup_user"))?;

        if let Some(u) = existing {
            let default_address = u.address.to_lowercase();
            ensure_user_address(&mut conn, &state.ids, u.id, &default_address)
                .await
                .map_err(|err| {
                    tracing::error!(
                        user_id = u.id,
                        address = %default_address,
                        error = %err,
                        "failed to ensure existing user address during auth"
                    );
                    err
                })?;
            return Ok(u);
        }

        let email_address = format!(
            "{}@{}",
            self.username.to_lowercase(),
            state.config.mail_domain.to_lowercase()
        );

        let new_user = NewUser {
            id: state.next_id(),
            kratos_id: self.kratos_user_id,
            username: &self.username,
            address: &email_address,
            display_name: &self.username,
            avatar_url: None,
        };

        // ON CONFLICT DO NOTHING handles concurrent first-logins racing to insert the same user.
        let inserted: Option<User> = diesel::insert_into(users)
            .values(&new_user)
            .on_conflict_do_nothing()
            .returning(User::as_returning())
            .get_result(&mut conn)
            .await
            .optional()
            .map_err(|err| AppError::db(err, "auth.resolve_user.insert_user"))?;

        let user = match inserted {
            Some(u) => u,
            None => users
                .filter(kratos_id.eq(self.kratos_user_id))
                .select(User::as_select())
                .first(&mut conn)
                .await
                .map_err(|err| AppError::db(err, "auth.resolve_user.lookup_raced_user"))?,
        };

        ensure_user_address(&mut conn, &state.ids, user.id, &email_address)
            .await
            .map_err(|err| {
                tracing::error!(
                    user_id = user.id,
                    address = %email_address,
                    error = %err,
                    "failed to ensure new user address during auth"
                );
                err
            })?;

        Ok(user)
    }
}

/// Fully provisioned authenticated user — use as an Axum extractor in protected handlers.
pub struct AuthUser(pub User);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let identity = KratosIdentity::from_request_parts(parts, state).await?;
        let user = identity.resolve_user(state).await?;
        Ok(AuthUser(user))
    }
}
