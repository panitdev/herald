//! Outbound email sending abstraction.
//!
//! Email sending is intentionally decoupled from the rest of herald. A
//! [`EmailSender`] is just "something that can deliver an [`OutboundEmail`]",
//! backed by a provider adapter (Resend, AWS SES, ...). Credentials live either
//! in the `email_senders` table (per-user, per-group, or system rows) or in the
//! deployment environment. The herald-api binary works with *no* provider key
//! at all — end users can add their own — or with a shared system key.
//!
//! See [`registry`] for how a sender is resolved for a given user/domain.

pub mod registry;
pub mod resend;
pub mod ses;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

use crate::error::AppError;

/// Supported provider adapters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmailProvider {
    Resend,
    Ses,
}

impl EmailProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            EmailProvider::Resend => "resend",
            EmailProvider::Ses => "ses",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "resend" => Some(EmailProvider::Resend),
            "ses" => Some(EmailProvider::Ses),
            _ => None,
        }
    }
}

/// A single email participant (`From`, `To`, ...).
#[derive(Debug, Clone)]
pub struct EmailAddress {
    pub email: String,
    pub name: Option<String>,
}

impl EmailAddress {
    pub fn new(email: impl Into<String>) -> Self {
        Self {
            email: email.into(),
            name: None,
        }
    }

    pub fn with_name(email: impl Into<String>, name: Option<String>) -> Self {
        Self {
            email: email.into(),
            name,
        }
    }

    /// Render as an RFC 5322 mailbox, e.g. `Ada Lovelace <ada@example.com>`.
    pub fn to_header(&self) -> String {
        match &self.name {
            Some(name) if !name.trim().is_empty() => format!("{} <{}>", name, self.email),
            _ => self.email.clone(),
        }
    }
}

/// A provider-agnostic outbound message.
#[derive(Debug, Clone)]
pub struct OutboundEmail {
    pub from: EmailAddress,
    pub to: Vec<EmailAddress>,
    pub cc: Vec<EmailAddress>,
    pub bcc: Vec<EmailAddress>,
    pub reply_to: Vec<EmailAddress>,
    pub subject: String,
    pub html: Option<String>,
    pub text: Option<String>,
}

impl OutboundEmail {
    pub fn new(from: EmailAddress, to: Vec<EmailAddress>, subject: impl Into<String>) -> Self {
        Self {
            from,
            to,
            cc: Vec::new(),
            bcc: Vec::new(),
            reply_to: Vec::new(),
            subject: subject.into(),
            html: None,
            text: None,
        }
    }

    fn validate(&self) -> Result<(), AppError> {
        if self.to.is_empty() {
            return Err(AppError::BadRequest(
                "outbound email requires at least one recipient".into(),
            ));
        }
        if self.html.is_none() && self.text.is_none() {
            return Err(AppError::BadRequest(
                "outbound email requires an html or text body".into(),
            ));
        }
        Ok(())
    }
}

/// Result of a successful send.
#[derive(Debug, Clone)]
pub struct SendOutcome {
    pub provider: EmailProvider,
    /// Provider-assigned message id, when one is returned.
    pub message_id: Option<String>,
}

/// Something that can deliver an [`OutboundEmail`]. Implemented per provider.
#[async_trait]
pub trait EmailSender: Send + Sync {
    fn provider(&self) -> EmailProvider;

    /// Deliver an email. Implementations should validate via
    /// [`OutboundEmail::validate`] before talking to the provider.
    async fn send(&self, email: &OutboundEmail) -> Result<SendOutcome, AppError>;
}

pub type DynEmailSender = Arc<dyn EmailSender>;

/// Build a sender adapter from stored credentials.
///
/// `config` is the non-secret provider configuration and `secret` the secret
/// credential payload, exactly as stored on an `email_senders` row (or assembled
/// from environment variables for the system sender).
pub fn build_sender(
    http: reqwest::Client,
    provider: EmailProvider,
    config: &Value,
    secret: Option<&Value>,
) -> Result<DynEmailSender, AppError> {
    match provider {
        EmailProvider::Resend => Ok(Arc::new(resend::ResendSender::from_credentials(
            http, secret,
        )?)),
        EmailProvider::Ses => Ok(Arc::new(ses::SesSender::from_credentials(
            http, config, secret,
        )?)),
    }
}

/// Helper for adapters: pull a required string field out of a JSON object.
fn required_secret_field(secret: Option<&Value>, field: &str) -> Result<String, AppError> {
    secret
        .and_then(|value| value.get(field))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| AppError::BadRequest(format!("email sender secret is missing `{field}`")))
}
