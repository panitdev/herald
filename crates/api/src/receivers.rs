//! Inbound email receivers as registrable units.
//!
//! A receiver is "something that hands herald raw RFC 822 messages": today a
//! Cloudflare Workers Email handler, tomorrow anything else that can POST
//! `/internal/mail/inbound`. Each one authenticates with its own bearer token
//! (stored hashed) and may only deliver to addresses bound to it — see
//! [`crate::mail::try_process`]. That containment is what makes it safe to let
//! end users register receivers for their own domains.
//!
//! Two access axes exist and must not be conflated:
//!   * `user_addresses` — who receives the mail delivered to an address.
//!   * `email_receiver_members` — who may administer a receiver and bind
//!     addresses to it.

use diesel::{
    BoolExpressionMethods, ExpressionMethods, OptionalExtension, QueryDsl, SelectableHelper,
    TextExpressionMethods,
};
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde_json::json;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    error::AppError,
    models::email_receiver::{EmailReceiverRecord, NewEmailReceiver},
    schema::{addresses, email_receiver_members, email_receivers},
    state::AppState,
    worker_client::{InboundWorkerClient, WorkerEndpoint},
};

/// What a user may do with a unit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    /// May bind addresses to the unit, but not reconfigure or share it.
    Member,
    /// May reconfigure, rotate credentials, share and delete the unit.
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

/// A freshly minted inbound credential. The plaintext exists only here — the
/// caller must return it to the registrant, because only the hash is stored.
pub struct MintedToken {
    pub plaintext: String,
    pub hash: String,
    pub hint: String,
}

pub fn mint_token() -> MintedToken {
    let plaintext = format!(
        "hrcv_{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    );
    let hash = hash_token(&plaintext);
    let hint = plaintext[plaintext.len() - 6..].to_owned();
    MintedToken {
        plaintext,
        hash,
        hint,
    }
}

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

/// Resolve the receiver a bearer token belongs to. Lookup is by digest, so the
/// plaintext never has to be compared against stored data.
pub async fn authenticate(
    state: &AppState,
    token: &str,
) -> Result<EmailReceiverRecord, AppError> {
    let mut conn = state.db.get().await?;
    let receiver = email_receivers::table
        .filter(email_receivers::inbound_token_hash.eq(hash_token(token)))
        .filter(email_receivers::is_active.eq(true))
        .select(EmailReceiverRecord::as_select())
        .first(&mut conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "receivers.authenticate.lookup"))?;

    receiver.ok_or_else(|| AppError::Unauthorized("invalid receiver token".into()))
}

pub async fn load(state: &AppState, receiver_id: i64) -> Result<EmailReceiverRecord, AppError> {
    let mut conn = state.db.get().await?;
    load_with_conn(&mut conn, receiver_id).await
}

pub async fn load_with_conn(
    conn: &mut AsyncPgConnection,
    receiver_id: i64,
) -> Result<EmailReceiverRecord, AppError> {
    email_receivers::table
        .find(receiver_id)
        .select(EmailReceiverRecord::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "receivers.load.lookup"))?
        .ok_or(AppError::NotFound)
}

/// The deployment-wide receiver: the one every address falls back to and the
/// one the bundled Cloudflare worker authenticates as.
pub async fn system_receiver(
    conn: &mut AsyncPgConnection,
) -> Result<Option<EmailReceiverRecord>, AppError> {
    let record = email_receivers::table
        .filter(email_receivers::scope.eq("system"))
        .order(email_receivers::created_at.asc())
        .select(EmailReceiverRecord::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "receivers.system_receiver.lookup"))?;
    Ok(record)
}

/// Every receiver a user may bind addresses to: system, owned, or shared.
pub async fn list_available(
    state: &AppState,
    user_id: i64,
) -> Result<Vec<EmailReceiverRecord>, AppError> {
    let mut conn = state.db.get().await?;
    let member_ids = email_receiver_members::table
        .filter(email_receiver_members::user_id.eq(user_id))
        .select(email_receiver_members::receiver_id);

    let rows = email_receivers::table
        .filter(email_receivers::is_active.eq(true))
        .filter(
            email_receivers::scope
                .eq("system")
                .or(email_receivers::owner_user_id.eq(user_id))
                .or(email_receivers::id.eq_any(member_ids)),
        )
        .order(email_receivers::created_at.asc())
        .select(EmailReceiverRecord::as_select())
        .load(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "receivers.list_available.load"))?;
    Ok(rows)
}

/// The receiver that accepts mail for `domain`, if one is registered.
pub async fn find_for_domain(
    conn: &mut AsyncPgConnection,
    domain: &str,
) -> Result<Option<EmailReceiverRecord>, AppError> {
    let record = email_receivers::table
        .filter(email_receivers::mail_domain.eq(domain.to_lowercase()))
        .filter(email_receivers::is_active.eq(true))
        .select(EmailReceiverRecord::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "receivers.find_for_domain.lookup"))?;
    Ok(record)
}

/// What `user_id` may do with `receiver`. System receivers are usable by
/// everyone (that is what keeps open signup on `MAIL_DOMAIN` working) but
/// administered by nobody.
pub async fn access_for(
    conn: &mut AsyncPgConnection,
    receiver: &EmailReceiverRecord,
    user_id: i64,
) -> Result<Option<Access>, AppError> {
    if receiver.owner_user_id == Some(user_id) {
        return Ok(Some(Access::Admin));
    }

    let role: Option<String> = email_receiver_members::table
        .find((receiver.id, user_id))
        .select(email_receiver_members::role)
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "receivers.access_for.lookup_member"))?;

    if let Some(role) = role {
        return Ok(Access::parse(&role));
    }

    if receiver.is_system() {
        return Ok(Some(Access::Member));
    }

    Ok(None)
}

pub async fn require_member(
    conn: &mut AsyncPgConnection,
    receiver: &EmailReceiverRecord,
    user_id: i64,
) -> Result<Access, AppError> {
    access_for(conn, receiver, user_id)
        .await?
        .ok_or_else(|| AppError::Forbidden("you do not have access to this email receiver".into()))
}

pub async fn require_admin(
    conn: &mut AsyncPgConnection,
    receiver: &EmailReceiverRecord,
    user_id: i64,
) -> Result<(), AppError> {
    match require_member(conn, receiver, user_id).await? {
        Access::Admin => Ok(()),
        Access::Member => Err(AppError::Forbidden(
            "only an administrator of this email receiver may do that".into(),
        )),
    }
}

/// Build a staging client for a receiver, when it exposes a staging endpoint.
pub fn worker_client(
    state: &AppState,
    receiver: &EmailReceiverRecord,
) -> Option<std::sync::Arc<dyn InboundWorkerClient>> {
    let url = receiver.worker_url()?;
    let token = receiver.worker_token()?;
    Some(state.workers.client_for(&WorkerEndpoint {
        url: url.to_owned(),
        token: token.to_owned(),
    }))
}

/// Create (or refresh) the deployment-wide receiver from the environment.
///
/// This is what keeps the already-deployed Cloudflare worker working across
/// this change: its `HERALD_INTERNAL_SECRET` stays a valid inbound token, now
/// as the system receiver's credential. Existing unbound addresses are bound to
/// it so delivery filtering has something to match against.
pub async fn ensure_system_receiver(state: &AppState) -> Result<EmailReceiverRecord, AppError> {
    let mut conn = state.db.get().await?;

    let mail_domain = state.config.mail_domain.to_lowercase();
    let config = json!({ "worker_url": state.config.worker_url });
    let secret = json!({ "worker_token": state.config.internal_secret });
    let token_hash = hash_token(&state.config.internal_secret);
    let token_hint = state
        .config
        .internal_secret
        .chars()
        .rev()
        .take(6)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();

    let existing = system_receiver(&mut conn).await?;

    let receiver = match existing {
        Some(existing) => {
            let updated = diesel::update(email_receivers::table.find(existing.id))
                .set((
                    email_receivers::mail_domain.eq(Some(&mail_domain)),
                    email_receivers::config.eq(&config),
                    email_receivers::secret.eq(Some(&secret)),
                    email_receivers::inbound_token_hash.eq(&token_hash),
                    email_receivers::inbound_token_hint.eq(&token_hint),
                    email_receivers::is_active.eq(true),
                    email_receivers::updated_at.eq(chrono::Utc::now()),
                ))
                .returning(EmailReceiverRecord::as_returning())
                .get_result(&mut conn)
                .await;

            match updated {
                Ok(receiver) => receiver,
                // `MAIL_DOMAIN` now names a domain some user already claimed.
                // Booting matters more than owning the domain, so keep the rest
                // of the configuration and leave the claim where it is.
                Err(diesel::result::Error::DatabaseError(
                    diesel::result::DatabaseErrorKind::UniqueViolation,
                    _,
                )) => {
                    tracing::warn!(
                        mail_domain = %mail_domain,
                        "MAIL_DOMAIN is already claimed by another receiver; \
                         leaving the system receiver unpinned"
                    );
                    diesel::update(email_receivers::table.find(existing.id))
                        .set((
                            email_receivers::config.eq(&config),
                            email_receivers::secret.eq(Some(&secret)),
                            email_receivers::inbound_token_hash.eq(&token_hash),
                            email_receivers::inbound_token_hint.eq(&token_hint),
                            email_receivers::is_active.eq(true),
                            email_receivers::updated_at.eq(chrono::Utc::now()),
                        ))
                        .returning(EmailReceiverRecord::as_returning())
                        .get_result(&mut conn)
                        .await
                        .map_err(|err| {
                            AppError::db(err, "receivers.ensure_system_receiver.update_unpinned")
                        })?
                }
                Err(err) => {
                    return Err(AppError::db(err, "receivers.ensure_system_receiver.update"))
                }
            }
        }
        None => {
            let new_receiver = NewEmailReceiver {
                id: state.next_id(),
                scope: "system",
                owner_user_id: None,
                owner_group_id: None,
                display_name: "Deployment receiver",
                mail_domain: Some(&mail_domain),
                config,
                secret: Some(secret),
                inbound_token_hash: &token_hash,
                inbound_token_hint: &token_hint,
            };

            diesel::insert_into(email_receivers::table)
                .values(&new_receiver)
                .returning(EmailReceiverRecord::as_returning())
                .get_result(&mut conn)
                .await
                .map_err(|err| AppError::db(err, "receivers.ensure_system_receiver.insert"))?
        }
    };

    // Only claim addresses the system receiver could legitimately receive for.
    // A blanket backfill would quietly re-bind addresses orphaned by a deleted
    // user receiver, defeating the domain guard in `mail::is_deliverable` on the
    // next boot.
    let Some(receiver_domain) = receiver.mail_domain.as_deref() else {
        return Ok(receiver);
    };
    let domain_suffix = format!("%@{receiver_domain}");
    let bound = diesel::update(
        addresses::table
            .filter(addresses::receiver_id.is_null())
            .filter(addresses::address.like(&domain_suffix)),
    )
    .set(addresses::receiver_id.eq(receiver.id))
    .execute(&mut conn)
    .await
    .map_err(|err| AppError::db(err, "receivers.ensure_system_receiver.bind_addresses"))?;

    if bound > 0 {
        tracing::info!(
            receiver_id = receiver.id,
            count = bound,
            "bound previously unbound addresses to the system receiver"
        );
    }

    Ok(receiver)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minted_tokens_are_unique_and_only_stored_hashed() {
        let first = mint_token();
        let second = mint_token();

        assert_ne!(first.plaintext, second.plaintext);
        assert_ne!(first.hash, second.hash);
        assert!(first.plaintext.starts_with("hrcv_"));
        // The hash must not leak the credential it stands for.
        assert!(!first.hash.contains(&first.plaintext));
        assert_eq!(hash_token(&first.plaintext), first.hash);
        assert!(first.plaintext.ends_with(&first.hint));
    }

    #[test]
    fn access_roles_round_trip() {
        assert_eq!(Access::parse("admin"), Some(Access::Admin));
        assert_eq!(Access::parse("member"), Some(Access::Member));
        assert_eq!(Access::parse("owner"), None);
        assert_eq!(Access::Admin.as_str(), "admin");
    }
}
