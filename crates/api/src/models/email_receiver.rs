use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde_json::Value;

use crate::schema::{email_receiver_members, email_receivers};

/// A registered inbound email entry point.
///
/// Deliberately does NOT derive `Serialize`: `secret` holds the credential
/// herald uses against the receiver's staging endpoint, and
/// `inbound_token_hash` is a credential digest. Use
/// `crate::routes::email_receivers::EmailReceiverResponse` for public output.
///
/// `owner_group_id` is reserved for upcoming group controls, mirroring
/// `email_senders`.
#[allow(dead_code)]
#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = email_receivers)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct EmailReceiverRecord {
    pub id: i64,
    /// `system` | `user` | `group` — who may administer this receiver.
    pub scope: String,
    pub owner_user_id: Option<i64>,
    /// Reserved for upcoming group controls.
    pub owner_group_id: Option<i64>,
    pub display_name: String,
    /// Domain this receiver accepts mail for; `None` means unpinned.
    pub mail_domain: Option<String>,
    /// Non-secret configuration, notably `worker_url`.
    pub config: Value,
    /// Secret configuration, notably `worker_token`. Never serialised.
    pub secret: Option<Value>,
    pub inbound_token_hash: String,
    pub inbound_token_hint: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl EmailReceiverRecord {
    /// The deployment-wide receiver every address falls back to.
    pub fn is_system(&self) -> bool {
        self.scope == "system"
    }

    /// Staging endpoint used for R2 recovery, when the receiver exposes one.
    pub fn worker_url(&self) -> Option<&str> {
        self.config
            .get("worker_url")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }

    /// Bearer token for herald -> receiver staging calls.
    pub fn worker_token(&self) -> Option<&str> {
        self.secret
            .as_ref()
            .and_then(|secret| secret.get("worker_token"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
    }
}

#[derive(Debug, Insertable)]
#[diesel(table_name = email_receivers)]
pub struct NewEmailReceiver<'a> {
    pub id: i64,
    pub scope: &'a str,
    pub owner_user_id: Option<i64>,
    pub owner_group_id: Option<i64>,
    pub display_name: &'a str,
    pub mail_domain: Option<&'a str>,
    pub config: Value,
    pub secret: Option<Value>,
    pub inbound_token_hash: &'a str,
    pub inbound_token_hint: &'a str,
}

/// Membership grants administration of a receiver and the right to bind
/// addresses to it. Distinct from `user_addresses`, which decides who receives
/// the mail that lands on an address.
#[allow(dead_code)]
#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = email_receiver_members)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct EmailReceiverMember {
    pub receiver_id: i64,
    pub user_id: i64,
    /// `admin` | `member`.
    pub role: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = email_receiver_members)]
pub struct NewEmailReceiverMember<'a> {
    pub receiver_id: i64,
    pub user_id: i64,
    pub role: &'a str,
}
