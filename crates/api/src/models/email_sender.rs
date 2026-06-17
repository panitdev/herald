use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde_json::Value;

use crate::schema::email_senders;

/// A stored outbound email sender credential.
///
/// Deliberately does NOT derive `Serialize`: the `secret` column holds
/// provider credentials that must never reach API clients. Use
/// `crate::routes::email_senders::EmailSenderResponse` for public output.
///
/// `owner_group_id` and `updated_at` are not read yet — the former is reserved
/// for upcoming group controls — hence `allow(dead_code)`.
#[allow(dead_code)]
#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = email_senders)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct EmailSenderRecord {
    pub id: i64,
    /// `system` | `user` | `group` — who may use this sender.
    pub scope: String,
    pub owner_user_id: Option<i64>,
    /// Reserved for upcoming group controls.
    pub owner_group_id: Option<i64>,
    /// Provider adapter selector: `resend` | `ses`.
    pub provider: String,
    pub display_name: String,
    /// Domain this sender may send from; `None` means unpinned.
    pub mail_domain: Option<String>,
    pub from_address: Option<String>,
    /// Non-secret provider configuration (e.g. SES region).
    pub config: Value,
    /// Secret provider credentials. Never serialised to clients.
    pub secret: Option<Value>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = email_senders)]
pub struct NewEmailSender<'a> {
    pub id: i64,
    pub scope: &'a str,
    pub owner_user_id: Option<i64>,
    pub owner_group_id: Option<i64>,
    pub provider: &'a str,
    pub display_name: &'a str,
    pub mail_domain: Option<&'a str>,
    pub from_address: Option<&'a str>,
    pub config: Value,
    pub secret: Option<Value>,
}
