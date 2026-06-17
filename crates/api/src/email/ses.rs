//! AWS SES (v2) provider adapter.
//!
//! Config payload shape (stored on `email_senders.config`):
//! ```json
//! { "region": "us-east-1" }
//! ```
//! Secret payload shape (stored on `email_senders.secret`):
//! ```json
//! { "access_key_id": "AKIA...", "secret_access_key": "..." }
//! ```
//!
//! Requests are signed with AWS Signature Version 4. HMAC-SHA256 is implemented
//! on top of the `sha2` crate so the adapter pulls in no extra dependencies.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::{
    required_secret_field, EmailAddress, EmailProvider, EmailSender, OutboundEmail, SendOutcome,
};
use crate::error::AppError;

const SERVICE: &str = "ses";
const PATH: &str = "/v2/email/outbound-emails";

pub struct SesSender {
    http: reqwest::Client,
    region: String,
    access_key_id: String,
    secret_access_key: String,
}

impl SesSender {
    pub fn new(
        http: reqwest::Client,
        region: impl Into<String>,
        access_key_id: impl Into<String>,
        secret_access_key: impl Into<String>,
    ) -> Self {
        Self {
            http,
            region: region.into(),
            access_key_id: access_key_id.into(),
            secret_access_key: secret_access_key.into(),
        }
    }

    pub fn from_credentials(
        http: reqwest::Client,
        config: &Value,
        secret: Option<&Value>,
    ) -> Result<Self, AppError> {
        let region = config
            .get("region")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_owned)
            .ok_or_else(|| AppError::BadRequest("ses sender config is missing `region`".into()))?;
        let access_key_id = required_secret_field(secret, "access_key_id")?;
        let secret_access_key = required_secret_field(secret, "secret_access_key")?;
        Ok(Self::new(http, region, access_key_id, secret_access_key))
    }

    fn host(&self) -> String {
        format!("email.{}.amazonaws.com", self.region)
    }
}

#[derive(Deserialize)]
struct SesResponse {
    #[serde(rename = "MessageId")]
    message_id: Option<String>,
}

fn addresses(list: &[EmailAddress]) -> Vec<String> {
    list.iter().map(EmailAddress::to_header).collect()
}

fn ses_payload(email: &OutboundEmail) -> Value {
    let mut destination = json!({ "ToAddresses": addresses(&email.to) });
    if !email.cc.is_empty() {
        destination["CcAddresses"] = json!(addresses(&email.cc));
    }
    if !email.bcc.is_empty() {
        destination["BccAddresses"] = json!(addresses(&email.bcc));
    }

    let mut body = json!({});
    if let Some(html) = &email.html {
        body["Html"] = json!({ "Data": html, "Charset": "UTF-8" });
    }
    if let Some(text) = &email.text {
        body["Text"] = json!({ "Data": text, "Charset": "UTF-8" });
    }

    let mut payload = json!({
        "FromEmailAddress": email.from.to_header(),
        "Destination": destination,
        "Content": {
            "Simple": {
                "Subject": { "Data": email.subject, "Charset": "UTF-8" },
                "Body": body,
            }
        }
    });
    if !email.reply_to.is_empty() {
        payload["ReplyToAddresses"] = json!(addresses(&email.reply_to));
    }
    payload
}

#[async_trait]
impl EmailSender for SesSender {
    fn provider(&self) -> EmailProvider {
        EmailProvider::Ses
    }

    async fn send(&self, email: &OutboundEmail) -> Result<SendOutcome, AppError> {
        email.validate()?;

        let host = self.host();
        let url = format!("https://{host}{PATH}");
        let payload = serde_json::to_vec(&ses_payload(email)).map_err(|_| AppError::Internal)?;

        let signed = sign_request(
            &SigningParams {
                access_key_id: &self.access_key_id,
                secret_access_key: &self.secret_access_key,
                region: &self.region,
                host: &host,
            },
            &payload,
            Utc::now(),
        );

        let response = self
            .http
            .post(&url)
            .header("content-type", "application/json")
            .header("x-amz-date", signed.amz_date)
            .header(reqwest::header::AUTHORIZATION, signed.authorization)
            .body(payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let detail = response.text().await.unwrap_or_default();
            return Err(AppError::BadRequest(format!(
                "ses send failed ({status}): {detail}"
            )));
        }

        let parsed: SesResponse = response
            .json()
            .await
            .unwrap_or(SesResponse { message_id: None });

        Ok(SendOutcome {
            provider: EmailProvider::Ses,
            message_id: parsed.message_id,
        })
    }
}

struct SigningParams<'a> {
    access_key_id: &'a str,
    secret_access_key: &'a str,
    region: &'a str,
    host: &'a str,
}

struct SignedRequest {
    amz_date: String,
    authorization: String,
}

/// Produce the `x-amz-date` and `Authorization` header values for a signed
/// SES v2 `POST` request. Split out from [`SesSender::send`] so the signing
/// logic is unit-testable with a fixed timestamp.
fn sign_request(params: &SigningParams, payload: &[u8], now: DateTime<Utc>) -> SignedRequest {
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let datestamp = now.format("%Y%m%d").to_string();
    let payload_hash = sha256_hex(payload);

    let canonical_headers = format!(
        "content-type:application/json\nhost:{}\nx-amz-date:{}\n",
        params.host, amz_date
    );
    let signed_headers = "content-type;host;x-amz-date";

    let canonical_request = format!(
        "POST\n{PATH}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    );

    let credential_scope = format!("{datestamp}/{}/{SERVICE}/aws4_request", params.region);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{}",
        sha256_hex(canonical_request.as_bytes())
    );

    let signing_key = derive_signing_key(
        params.secret_access_key,
        &datestamp,
        params.region,
        SERVICE,
    );
    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));

    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}",
        params.access_key_id
    );

    SignedRequest {
        amz_date,
        authorization,
    }
}

fn derive_signing_key(secret: &str, datestamp: &str, region: &str, service: &str) -> [u8; 32] {
    let k_date = hmac_sha256(format!("AWS4{secret}").as_bytes(), datestamp.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    hmac_sha256(&k_service, b"aws4_request")
}

fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

/// HMAC-SHA256 built directly on `sha2` (RFC 2104).
fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;

    let mut block_key = [0u8; BLOCK];
    if key.len() > BLOCK {
        block_key[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        block_key[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; BLOCK];
    let mut opad = [0x5cu8; BLOCK];
    for index in 0..BLOCK {
        ipad[index] ^= block_key[index];
        opad[index] ^= block_key[index];
    }

    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(message);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_hash);

    let mut out = [0u8; 32];
    out.copy_from_slice(&outer.finalize());
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn hmac_sha256_matches_rfc4231_case2() {
        // RFC 4231, Test Case 2.
        let mac = hmac_sha256(b"Jefe", b"what do ya want for nothing?");
        assert_eq!(
            hex::encode(mac),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }

    #[test]
    fn sha256_hex_of_empty_input() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn sign_request_is_deterministic_and_well_formed() {
        let params = SigningParams {
            access_key_id: "AKIDEXAMPLE",
            secret_access_key: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
            region: "us-east-1",
            host: "email.us-east-1.amazonaws.com",
        };
        let now = Utc.with_ymd_and_hms(2026, 6, 17, 12, 0, 0).unwrap();
        let signed = sign_request(&params, b"{}", now);

        assert_eq!(signed.amz_date, "20260617T120000Z");
        assert!(signed
            .authorization
            .starts_with("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260617/us-east-1/ses/aws4_request"));
        assert!(signed
            .authorization
            .contains("SignedHeaders=content-type;host;x-amz-date"));

        // Signature is a 64-char lowercase hex digest, and signing is stable.
        let signature = signed
            .authorization
            .rsplit("Signature=")
            .next()
            .unwrap();
        assert_eq!(signature.len(), 64);
        assert!(signature.chars().all(|c| c.is_ascii_hexdigit()));

        let signed_again = sign_request(&params, b"{}", now);
        assert_eq!(signed.authorization, signed_again.authorization);
    }

    #[test]
    fn ses_payload_includes_cc_and_bodies() {
        let email = OutboundEmail {
            from: EmailAddress::new("from@example.com"),
            to: vec![EmailAddress::new("to@example.com")],
            cc: vec![EmailAddress::new("cc@example.com")],
            bcc: vec![],
            reply_to: vec![EmailAddress::new("reply@example.com")],
            subject: "Hi".into(),
            html: Some("<p>hi</p>".into()),
            text: Some("hi".into()),
        };
        let payload = ses_payload(&email);
        assert_eq!(payload["FromEmailAddress"], "from@example.com");
        assert_eq!(payload["Destination"]["CcAddresses"][0], "cc@example.com");
        assert_eq!(payload["ReplyToAddresses"][0], "reply@example.com");
        assert_eq!(payload["Content"]["Simple"]["Body"]["Html"]["Data"], "<p>hi</p>");
    }
}
