use mailparse::{
    addrparse_header, parse_mail, DispositionType, MailAddr, MailHeaderMap, ParsedMail, SingleInfo,
};

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct ParsedRecipient {
    pub kind: &'static str,
    pub address: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ParsedAttachment {
    pub filename: Option<String>,
    pub content_type: Option<String>,
    pub size: Option<i64>,
    pub content_id: Option<String>,
    pub inline: bool,
}

#[derive(Debug, Clone)]
pub struct ParsedMessage {
    pub message_id_header: Option<String>,
    pub thread_id: Option<String>,
    pub from_addr: Option<String>,
    pub from_name: Option<String>,
    pub subject: Option<String>,
    pub preview: Option<String>,
    pub recipients: Vec<ParsedRecipient>,
    pub attachments: Vec<ParsedAttachment>,
    pub html_body: Option<String>,
    pub text_body: Option<String>,
}

pub fn parse_message(raw: &[u8]) -> Result<ParsedMessage, AppError> {
    let parsed = parse_mail(raw).map_err(|_| AppError::Internal)?;
    let recipients = parse_recipients(&parsed)?;
    let attachments = collect_attachments(&parsed)?;
    let html_body = find_body_part(&parsed, "text/html")?;
    let text_body = find_body_part(&parsed, "text/plain")?;
    let subject = header_value(&parsed, "Subject");
    let preview_source = text_body
        .as_ref()
        .cloned()
        .or_else(|| html_body.as_ref().map(|body| strip_html(body)));
    let preview = preview_source
        .as_deref()
        .map(normalize_whitespace)
        .filter(|value| !value.is_empty())
        .map(|value| truncate_preview(&value, 160));

    let (from_addr, from_name) = parse_first_address(&parsed, "From")?;

    Ok(ParsedMessage {
        message_id_header: header_value(&parsed, "Message-Id"),
        thread_id: derive_thread_id(&parsed),
        from_addr,
        from_name,
        subject,
        preview,
        recipients,
        attachments,
        html_body,
        text_body,
    })
}

fn parse_recipients(parsed: &ParsedMail<'_>) -> Result<Vec<ParsedRecipient>, AppError> {
    let mut recipients = Vec::new();
    for (header_name, kind) in [
        ("To", "to"),
        ("Cc", "cc"),
        ("Bcc", "bcc"),
        ("Reply-To", "reply_to"),
    ] {
        recipients.extend(parse_addresses(parsed, header_name, kind)?);
    }
    Ok(recipients)
}

fn parse_addresses(
    parsed: &ParsedMail<'_>,
    header_name: &str,
    kind: &'static str,
) -> Result<Vec<ParsedRecipient>, AppError> {
    let Some(header) = parsed.headers.get_first_header(header_name) else {
        return Ok(Vec::new());
    };

    let addrs = addrparse_header(header).map_err(|_| AppError::Internal)?;
    let mut recipients = Vec::new();

    for addr in addrs.iter() {
        flatten_mail_addr(kind, addr, &mut recipients);
    }

    Ok(recipients)
}

fn flatten_mail_addr(kind: &'static str, addr: &MailAddr, out: &mut Vec<ParsedRecipient>) {
    match addr {
        MailAddr::Single(info) => out.push(ParsedRecipient {
            kind,
            address: info.addr.to_lowercase(),
            display_name: info.display_name.clone().and_then(normalize_optional),
        }),
        MailAddr::Group(group) => {
            for entry in &group.addrs {
                flatten_single_info(kind, entry, out);
            }
        }
    }
}

fn flatten_single_info(kind: &'static str, info: &SingleInfo, out: &mut Vec<ParsedRecipient>) {
    out.push(ParsedRecipient {
        kind,
        address: info.addr.to_lowercase(),
        display_name: info.display_name.clone().and_then(normalize_optional),
    });
}

fn parse_first_address(
    parsed: &ParsedMail<'_>,
    header_name: &str,
) -> Result<(Option<String>, Option<String>), AppError> {
    let recipients = parse_addresses(parsed, header_name, "from")?;
    Ok(recipients
        .into_iter()
        .next()
        .map(|value| (Some(value.address), value.display_name))
        .unwrap_or((None, None)))
}

fn find_body_part(parsed: &ParsedMail<'_>, mime_type: &str) -> Result<Option<String>, AppError> {
    if parsed.subparts.is_empty() {
        let disposition = parsed.get_content_disposition();
        if disposition.disposition == DispositionType::Attachment {
            return Ok(None);
        }

        if parsed.ctype.mimetype.eq_ignore_ascii_case(mime_type) {
            let body = parsed.get_body().map_err(|_| AppError::Internal)?;
            return Ok(normalize_optional(body));
        }
        return Ok(None);
    }

    for part in &parsed.subparts {
        if let Some(body) = find_body_part(part, mime_type)? {
            return Ok(Some(body));
        }
    }

    Ok(None)
}

fn collect_attachments(parsed: &ParsedMail<'_>) -> Result<Vec<ParsedAttachment>, AppError> {
    let mut attachments = Vec::new();
    collect_attachments_recursive(parsed, &mut attachments)?;
    Ok(attachments)
}

fn collect_attachments_recursive(
    parsed: &ParsedMail<'_>,
    attachments: &mut Vec<ParsedAttachment>,
) -> Result<(), AppError> {
    let disposition = parsed.get_content_disposition();
    let filename = disposition
        .params
        .get("filename")
        .cloned()
        .or_else(|| parsed.ctype.params.get("name").cloned());
    let content_id =
        header_value(parsed, "Content-Id").map(|value| value.trim_matches(['<', '>']).to_owned());
    let is_attachment = disposition.disposition == DispositionType::Attachment
        || filename.is_some()
        || content_id.is_some();

    if is_attachment {
        let size = parsed
            .get_body_raw()
            .map(|bytes| bytes.len() as i64)
            .map(Some)
            .map_err(|_| AppError::Internal)?;

        attachments.push(ParsedAttachment {
            filename: normalize_optional_opt(filename),
            content_type: normalize_optional(parsed.ctype.mimetype.clone()),
            size,
            content_id: normalize_optional_opt(content_id),
            inline: disposition.disposition == DispositionType::Inline,
        });
    }

    for part in &parsed.subparts {
        collect_attachments_recursive(part, attachments)?;
    }

    Ok(())
}

fn derive_thread_id(parsed: &ParsedMail<'_>) -> Option<String> {
    header_value(parsed, "In-Reply-To")
        .or_else(|| {
            header_value(parsed, "References").and_then(|value| {
                value
                    .split_whitespace()
                    .last()
                    .map(|segment| segment.to_owned())
            })
        })
        .or_else(|| header_value(parsed, "Message-Id"))
}

fn header_value(parsed: &ParsedMail<'_>, name: &str) -> Option<String> {
    parsed
        .headers
        .get_first_value(name)
        .and_then(normalize_optional)
}

fn normalize_optional(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_owned())
    }
}

fn normalize_optional_opt(value: Option<String>) -> Option<String> {
    value.and_then(normalize_optional)
}

fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_preview(value: &str, max_len: usize) -> String {
    let mut truncated = value.chars().take(max_len).collect::<String>();
    if value.chars().count() > max_len {
        truncated.push_str("...");
    }
    truncated
}

fn strip_html(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut in_tag = false;

    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                output.push(' ');
            }
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }

    normalize_whitespace(&output)
}

pub fn render_body(raw: &[u8]) -> Result<(String, String), AppError> {
    let parsed = parse_message(raw)?;
    let html = parsed.html_body.unwrap_or_default();
    let text = parsed
        .text_body
        .or_else(|| (!html.is_empty()).then(|| strip_html(&html)))
        .unwrap_or_default();
    Ok((html, text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_basic_message_fields() {
        let raw = concat!(
            "From: Alice <alice@example.com>\r\n",
            "To: Bob <bob@panit.dev>\r\n",
            "Subject: Hello world\r\n",
            "Message-Id: <msg-1@example.com>\r\n",
            "Content-Type: multipart/alternative; boundary=\"abc\"\r\n",
            "\r\n",
            "--abc\r\n",
            "Content-Type: text/plain; charset=utf-8\r\n",
            "\r\n",
            "Plain body.\r\n",
            "--abc\r\n",
            "Content-Type: text/html; charset=utf-8\r\n",
            "\r\n",
            "<p>HTML body.</p>\r\n",
            "--abc--\r\n"
        );

        let parsed = parse_message(raw.as_bytes()).unwrap();
        assert_eq!(parsed.from_addr.as_deref(), Some("alice@example.com"));
        assert_eq!(parsed.recipients.len(), 1);
        assert_eq!(parsed.recipients[0].address, "bob@panit.dev");
        assert_eq!(parsed.preview.as_deref(), Some("Plain body."));
        assert_eq!(parsed.html_body.as_deref(), Some("<p>HTML body.</p>"));
        assert_eq!(parsed.text_body.as_deref(), Some("Plain body."));
    }
}
