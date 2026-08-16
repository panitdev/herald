//! Resolution of which [`EmailSender`](super::EmailSender) to use.
//!
//! Senders come from two places, checked in this order:
//!   1. `email_senders` rows the user may use — their own (`scope = 'user'`) and
//!      shared `scope = 'system'` rows. (Group scope is reserved for later.)
//!   2. A system sender configured from the deployment environment, if any.
//!
//! Because step 2 is optional, herald-api runs fine with no provider key: the
//! resolver simply relies on whatever the user has registered. Equally, a
//! deployment can ship a shared key and users need register nothing.

use diesel::{
    BoolExpressionMethods, ExpressionMethods, OptionalExtension, QueryDsl, SelectableHelper,
};
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use super::{build_sender, DynEmailSender, EmailProvider};
use crate::{
    error::AppError,
    models::email_sender::EmailSenderRecord,
    receivers::Access,
    schema::{addresses, email_sender_members, email_senders},
    state::AppState,
};

/// Load every sender a user is allowed to use: their own rows, rows shared with
/// them, plus system rows.
pub async fn list_available(
    state: &AppState,
    user_id: i64,
) -> Result<Vec<EmailSenderRecord>, AppError> {
    let mut conn = state.db.get().await?;
    let member_ids = email_sender_members::table
        .filter(email_sender_members::user_id.eq(user_id))
        .select(email_sender_members::sender_id);

    let rows = email_senders::table
        .filter(email_senders::is_active.eq(true))
        .filter(
            email_senders::scope
                .eq("system")
                .or(email_senders::owner_user_id.eq(user_id))
                .or(email_senders::id.eq_any(member_ids)),
        )
        .order(email_senders::created_at.desc())
        .select(EmailSenderRecord::as_select())
        .load(&mut conn)
        .await?;
    Ok(rows)
}

/// Build a concrete sender adapter from a stored row.
pub fn build_from_record(
    http: reqwest::Client,
    record: &EmailSenderRecord,
) -> Result<DynEmailSender, AppError> {
    let provider = EmailProvider::parse(&record.provider).ok_or_else(|| {
        AppError::BadRequest(format!("unknown email provider `{}`", record.provider))
    })?;
    build_sender(http, provider, &record.config, record.secret.as_ref())
}

/// Resolve the best sender for `user_id` sending from `from_domain`.
///
/// Selection prefers a sender pinned to the exact sending domain, then a
/// user-owned sender over a shared system one. Domain-pinned senders are never
/// used for a different (or unknown) domain. Falls back to the environment
/// system sender when no stored row is eligible.
pub async fn resolve_sender(
    state: &AppState,
    user_id: i64,
    from_domain: Option<&str>,
) -> Result<DynEmailSender, AppError> {
    let candidates = list_available(state, user_id).await?;

    let best = candidates
        .iter()
        .filter_map(|record| eligibility_score(record, from_domain).map(|score| (score, record)))
        .max_by(|(left_score, left), (right_score, right)| {
            left_score
                .cmp(right_score)
                .then_with(|| left.created_at.cmp(&right.created_at))
        })
        .map(|(_, record)| record);

    if let Some(record) = best {
        return build_from_record(state.http.clone(), record);
    }

    state.system_email.clone().ok_or_else(|| {
        AppError::BadRequest("no email sender is configured for this account".into())
    })
}

/// Returns `None` when the sender may not be used for `from_domain`, otherwise a
/// preference score (higher is better).
fn eligibility_score(record: &EmailSenderRecord, from_domain: Option<&str>) -> Option<i32> {
    let mut score = match (record.mail_domain.as_deref(), from_domain) {
        // Pinned to a domain that matches the sending domain.
        (Some(pinned), Some(sending)) if pinned.eq_ignore_ascii_case(sending) => 2,
        // Pinned but the sending domain differs or is unknown — not eligible.
        (Some(_), _) => return None,
        // Not pinned to any domain — always eligible.
        (None, _) => 0,
    };

    if record.scope == "user" {
        score += 1;
    }

    Some(score)
}

pub async fn load_with_conn(
    conn: &mut AsyncPgConnection,
    sender_id: i64,
) -> Result<EmailSenderRecord, AppError> {
    email_senders::table
        .find(sender_id)
        .select(EmailSenderRecord::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "email.registry.load.lookup"))?
        .ok_or(AppError::NotFound)
}

/// What `user_id` may do with `sender`. Mirrors receiver membership: system
/// senders are usable by everyone and administered by nobody.
pub async fn access_for(
    conn: &mut AsyncPgConnection,
    sender: &EmailSenderRecord,
    user_id: i64,
) -> Result<Option<Access>, AppError> {
    if sender.owner_user_id == Some(user_id) {
        return Ok(Some(Access::Admin));
    }

    let role: Option<String> = email_sender_members::table
        .find((sender.id, user_id))
        .select(email_sender_members::role)
        .first(conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "email.registry.access_for.lookup_member"))?;

    if let Some(role) = role {
        return Ok(Access::parse(&role));
    }

    if sender.scope == "system" {
        return Ok(Some(Access::Member));
    }

    Ok(None)
}

pub async fn require_member(
    conn: &mut AsyncPgConnection,
    sender: &EmailSenderRecord,
    user_id: i64,
) -> Result<Access, AppError> {
    access_for(conn, sender, user_id)
        .await?
        .ok_or_else(|| AppError::Forbidden("you do not have access to this email sender".into()))
}

pub async fn require_admin(
    conn: &mut AsyncPgConnection,
    sender: &EmailSenderRecord,
    user_id: i64,
) -> Result<(), AppError> {
    match require_member(conn, sender, user_id).await? {
        Access::Admin => Ok(()),
        Access::Member => Err(AppError::Forbidden(
            "only an administrator of this email sender may do that".into(),
        )),
    }
}

/// Resolve the sender for a specific `From` address.
///
/// An address bound to a sender unit always uses it — that binding is the
/// "exactly one sender per address" rule. Everything else falls through to
/// domain-scored resolution, which is what unbound addresses (the majority
/// right after migration) rely on.
pub async fn resolve_sender_for_address(
    state: &AppState,
    user_id: i64,
    from_address: &str,
) -> Result<DynEmailSender, AppError> {
    let normalized = from_address.trim().to_lowercase();
    let mut conn = state.db.get().await?;

    let bound_sender_id: Option<Option<i64>> = addresses::table
        .filter(addresses::address.eq(&normalized))
        .select(addresses::sender_id)
        .first(&mut conn)
        .await
        .optional()
        .map_err(|err| AppError::db(err, "email.registry.resolve_for_address.lookup_address"))?;

    if let Some(Some(sender_id)) = bound_sender_id {
        let record = load_with_conn(&mut conn, sender_id).await?;
        require_member(&mut conn, &record, user_id).await?;
        if !record.is_active {
            return Err(AppError::BadRequest(
                "the sender bound to this address is disabled".into(),
            ));
        }
        return build_from_record(state.http.clone(), &record);
    }

    let from_domain = normalized.split_once('@').map(|(_, domain)| domain.to_owned());
    resolve_sender(state, user_id, from_domain.as_deref()).await
}
