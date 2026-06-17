//! [Resend](https://resend.com) provider adapter.
//!
//! Secret payload shape (stored on `email_senders.secret`):
//! ```json
//! { "api_key": "re_..." }
//! ```

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{json, Value};

use super::{
    required_secret_field, EmailAddress, EmailProvider, EmailSender, OutboundEmail, SendOutcome,
};
use crate::error::AppError;

const RESEND_ENDPOINT: &str = "https://api.resend.com/emails";

pub struct ResendSender {
    http: reqwest::Client,
    api_key: String,
}

impl ResendSender {
    pub fn new(http: reqwest::Client, api_key: impl Into<String>) -> Self {
        Self {
            http,
            api_key: api_key.into(),
        }
    }

    pub fn from_credentials(http: reqwest::Client, secret: Option<&Value>) -> Result<Self, AppError> {
        let api_key = required_secret_field(secret, "api_key")?;
        Ok(Self::new(http, api_key))
    }
}

#[derive(Deserialize)]
struct ResendResponse {
    id: Option<String>,
}

fn headers(addresses: &[EmailAddress]) -> Vec<String> {
    addresses.iter().map(EmailAddress::to_header).collect()
}

#[async_trait]
impl EmailSender for ResendSender {
    fn provider(&self) -> EmailProvider {
        EmailProvider::Resend
    }

    async fn send(&self, email: &OutboundEmail) -> Result<SendOutcome, AppError> {
        email.validate()?;

        let mut body = json!({
            "from": email.from.to_header(),
            "to": headers(&email.to),
            "subject": email.subject,
        });

        if !email.cc.is_empty() {
            body["cc"] = json!(headers(&email.cc));
        }
        if !email.bcc.is_empty() {
            body["bcc"] = json!(headers(&email.bcc));
        }
        if !email.reply_to.is_empty() {
            body["reply_to"] = json!(headers(&email.reply_to));
        }
        if let Some(html) = &email.html {
            body["html"] = json!(html);
        }
        if let Some(text) = &email.text {
            body["text"] = json!(text);
        }

        let response = self
            .http
            .post(RESEND_ENDPOINT)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let detail = response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "resend send failed ({status}): {detail}"
            )));
        }

        let parsed: ResendResponse = response.json().await.unwrap_or(ResendResponse { id: None });

        Ok(SendOutcome {
            provider: EmailProvider::Resend,
            message_id: parsed.id,
        })
    }
}
