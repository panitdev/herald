use bytes::Bytes;
use chrono::Utc;
use diesel::{
    dsl, upsert::excluded, ExpressionMethods, OptionalExtension, QueryDsl, SelectableHelper,
};
use diesel_async::{AsyncConnection, RunQueryDsl};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

use crate::{
    email::{EmailAddress, OutboundEmail, SendOutcome},
    error::AppError,
    mail_parser::{parse_message, render_body, ParsedAttachment, ParsedRecipient},
    mailboxes::ensure_system_mailboxes,
    models::{
        address::Address,
        attachment::{Attachment, NewAttachment},
        email_receiver::EmailReceiverRecord,
        mailbox::Mailbox,
        message::{Message, NewMessage},
        message_mailbox::{MessageMailbox, NewMessageMailbox},
        message_recipient::{MessageRecipient, NewMessageRecipient},
        raw_inbound_mail::{NewRawInboundMail, RawInboundMail},
        sync_event::NewSyncEvent,
    },
    schema::{
        addresses, attachments, mailboxes, message_mailboxes, message_recipients, messages,
        raw_inbound_mails, sync_events, user_addresses,
    },
    state::AppState,
};

const RAW_MIME_CONTENT_TYPE: &str = "message/rfc822";

/// Persist a raw message under the receiver that accepted it.
///
/// Deduplication is keyed on `(raw_sha256, receiver_id)`: identical bytes
/// reaching two receivers are two deliveries, and collapsing them would make
/// whichever arrived second vanish.
pub async fn ingest_raw_mail(
    state: &AppState,
    raw: Bytes,
    r2_key: Option<&str>,
    receiver_id: Option<i64>,
) -> Result<i64, AppError> {
    let raw_sha256 = sha256_hex(&raw);
    let raw_size = raw.len() as i64;
    let blob_key = canonical_blob_key(&raw_sha256);

    state
        .blob_store
        .put(&blob_key, raw, RAW_MIME_CONTENT_TYPE)
        .await?;

    let new_mail = NewRawInboundMail {
        id: state.next_id(),
        blob_key: &blob_key,
        raw_sha256: &raw_sha256,
        raw_size,
        r2_key,
        receiver_id,
    };

    let mut conn = state.db.get().await?;

    let saved = if r2_key.is_some() {
        diesel::insert_into(raw_inbound_mails::table)
            .values(&new_mail)
            .on_conflict((raw_inbound_mails::raw_sha256, raw_inbound_mails::receiver_id))
            .do_update()
            .set((
                raw_inbound_mails::blob_key.eq(excluded(raw_inbound_mails::blob_key)),
                raw_inbound_mails::raw_size.eq(excluded(raw_inbound_mails::raw_size)),
                raw_inbound_mails::r2_key.eq(excluded(raw_inbound_mails::r2_key)),
                raw_inbound_mails::error.eq(None::<String>),
            ))
            .returning(RawInboundMail::as_returning())
            .get_result(&mut conn)
            .await?
    } else {
        diesel::insert_into(raw_inbound_mails::table)
            .values(&new_mail)
            .on_conflict((raw_inbound_mails::raw_sha256, raw_inbound_mails::receiver_id))
            .do_update()
            .set((
                raw_inbound_mails::blob_key.eq(excluded(raw_inbound_mails::blob_key)),
                raw_inbound_mails::raw_size.eq(excluded(raw_inbound_mails::raw_size)),
                raw_inbound_mails::error.eq(None::<String>),
            ))
            .returning(RawInboundMail::as_returning())
            .get_result(&mut conn)
            .await?
    };

    Ok(saved.id)
}

pub async fn requeue_pending_inbound_mail(state: AppState) {
    let rows: Result<Vec<i64>, AppError> = async {
        let mut conn = state.db.get().await?;
        let ids = raw_inbound_mails::table
            .filter(raw_inbound_mails::processed_at.is_null())
            .select(raw_inbound_mails::id)
            .load(&mut conn)
            .await?;
        Ok(ids)
    }
    .await;

    match rows {
        Ok(ids) => {
            for mail_id in ids {
                tokio::spawn(process_inbound_mail(state.clone(), mail_id));
            }
        }
        Err(error) => {
            tracing::warn!(error = %error, "failed to requeue pending inbound mail");
        }
    }
}

pub async fn process_inbound_mail(state: AppState, mail_id: i64) {
    if let Err(error) = try_process(&state, mail_id).await {
        tracing::error!(mail_id, error = %error, "inbound mail processing failed");
        let mark_processed = matches!(error, AppError::BadRequest(_));
        record_error(&state, mail_id, &error.to_string(), mark_processed).await;
    }
}

pub async fn render_message_body(
    state: &AppState,
    user_id: i64,
    message_id: i64,
) -> Result<(Message, RawInboundMail, String, String), AppError> {
    let (message, raw_mail) = find_owned_message(state, user_id, message_id).await?;
    let raw = state.blob_store.get(&raw_mail.blob_key).await?.bytes;
    let (html, text) = render_body(&raw)?;
    Ok((message, raw_mail, html, text))
}

/// Store a successfully delivered outbound message in the sender's Sent mailbox.
/// The raw RFC 822 representation is kept in the same blob store used by inbound mail
/// so the existing body and source-download endpoints work for both directions.
pub async fn persist_outbound_mail(
    state: &AppState,
    user_id: i64,
    email: &OutboundEmail,
    outcome: &SendOutcome,
) -> Result<i64, AppError> {
    let message_id_header = format!("<{}.herald>", state.next_id());
    let raw = serialize_outbound(email, &message_id_header);
    let raw_sha256 = sha256_hex(&raw);
    let blob_key = canonical_blob_key(&raw_sha256);
    let raw_size = raw.len() as i64;
    state
        .blob_store
        .put(&blob_key, Bytes::from(raw), RAW_MIME_CONTENT_TYPE)
        .await?;

    let now = Utc::now();
    let mut conn = state.db.get().await?;
    conn.transaction::<i64, AppError, _>(|conn| {
        let blob_key = blob_key.clone();
        let raw_sha256 = raw_sha256.clone();
        let provider = outcome.provider.as_str().to_owned();
        let provider_message_id = outcome.message_id.clone();
        Box::pin(async move {
            let raw_mail = diesel::insert_into(raw_inbound_mails::table)
                .values(&NewRawInboundMail {
                    id: state.next_id(),
                    blob_key: &blob_key,
                    raw_sha256: &raw_sha256,
                    raw_size,
                    r2_key: None,
                    receiver_id: None,
                })
                .returning(RawInboundMail::as_returning())
                .get_result(conn)
                .await?;

            diesel::update(raw_inbound_mails::table.find(raw_mail.id))
                .set(raw_inbound_mails::processed_at.eq(now))
                .execute(conn)
                .await?;

            let address_id = user_addresses::table
                .filter(user_addresses::user_id.eq(user_id))
                .inner_join(addresses::table)
                .filter(addresses::address.eq(&email.from.email))
                .select(addresses::id)
                .first::<i64>(conn)
                .await?;
            let ensured = ensure_system_mailboxes(conn, &state.ids, address_id).await?;
            let sent = ensured
                .all
                .iter()
                .find(|mailbox| mailbox.system_role.as_deref() == Some("sent"))
                .ok_or_else(|| AppError::Internal)?;

            let preview = email
                .text
                .as_deref()
                .or(email.html.as_deref())
                .map(|body| body.chars().take(160).collect::<String>());
            let message = diesel::insert_into(messages::table)
                .values(&NewMessage {
                    id: state.next_id(),
                    raw_inbound_mail_id: raw_mail.id,
                    message_id_header: Some(&message_id_header),
                    thread_id: None,
                    from_addr: Some(&email.from.email),
                    from_name: email.from.name.as_deref(),
                    subject: Some(&email.subject),
                    preview: preview.as_deref(),
                    received_at: now,
                    outbound_provider: Some(&provider),
                    outbound_provider_message_id: provider_message_id.as_deref(),
                })
                .returning(Message::as_returning())
                .get_result(conn)
                .await?;

            let recipients: Vec<NewMessageRecipient<'_>> = email
                .to
                .iter()
                .map(|recipient| NewMessageRecipient {
                    id: state.next_id(),
                    message_id: message.id,
                    kind: "to",
                    address: &recipient.email,
                    display_name: recipient.name.as_deref(),
                })
                .chain(email.cc.iter().map(|recipient| NewMessageRecipient {
                    id: state.next_id(),
                    message_id: message.id,
                    kind: "cc",
                    address: &recipient.email,
                    display_name: recipient.name.as_deref(),
                }))
                .chain(email.bcc.iter().map(|recipient| NewMessageRecipient {
                    id: state.next_id(),
                    message_id: message.id,
                    kind: "bcc",
                    address: &recipient.email,
                    display_name: recipient.name.as_deref(),
                }))
                .collect();
            if !recipients.is_empty() {
                diesel::insert_into(message_recipients::table)
                    .values(&recipients)
                    .execute(conn)
                    .await?;
            }

            let relation = NewMessageMailbox {
                message_id: message.id,
                mailbox_id: sent.id,
                relation: "location",
            };
            diesel::insert_into(message_mailboxes::table)
                .values(&relation)
                .execute(conn)
                .await?;

            let mut events = mailbox_sync_events(state, user_id, &ensured.created);
            events.extend([
                sync_event(state, user_id, "message", message.id, json!(message)),
                sync_event(
                    state,
                    user_id,
                    "messageMailbox",
                    message.id,
                    json!(MessageMailbox {
                        message_id: message.id,
                        mailbox_id: sent.id,
                        relation: "location".to_owned(),
                        created_at: now,
                    }),
                ),
            ]);
            events.extend(recipients.iter().map(|recipient| {
                sync_event(
                    state,
                    user_id,
                    "messageRecipient",
                    recipient.id,
                    json!({
                        "id": recipient.id,
                        "message_id": recipient.message_id,
                        "kind": recipient.kind,
                        "address": recipient.address,
                        "display_name": recipient.display_name,
                    }),
                )
            }));
            diesel::insert_into(sync_events::table)
                .values(&events)
                .execute(conn)
                .await?;

            Ok(message.id)
        })
    })
    .await
}

fn serialize_outbound(email: &OutboundEmail, message_id: &str) -> Vec<u8> {
    let cc = email
        .cc
        .iter()
        .map(EmailAddress::to_header)
        .collect::<Vec<_>>();
    let bcc = email
        .bcc
        .iter()
        .map(EmailAddress::to_header)
        .collect::<Vec<_>>();
    let body = email.text.as_deref().or(email.html.as_deref()).unwrap_or_default();
    let content_type = if email.text.is_some() {
        "text/plain"
    } else {
        "text/html"
    };
    let mut raw = format!(
        "Message-ID: {message_id}\r\nFrom: {}\r\nTo: {}\r\n{}{}Subject: {}\r\nDate: {}\r\nMIME-Version: 1.0\r\nContent-Type: {content_type}; charset=UTF-8\r\n\r\n",
        email.from.to_header(),
        email.to.iter().map(EmailAddress::to_header).collect::<Vec<_>>().join(", "),
        if cc.is_empty() { String::new() } else { format!("Cc: {}\r\n", cc.join(", ")) },
        if bcc.is_empty() { String::new() } else { format!("Bcc: {}\r\n", bcc.join(", ")) },
        email.subject,
        Utc::now().to_rfc2822(),
    );
    raw.push_str(body);
    raw.into_bytes()
}

pub async fn find_owned_message(
    state: &AppState,
    user_id: i64,
    message_id: i64,
) -> Result<(Message, RawInboundMail), AppError> {
    let mut conn = state.db.get().await?;
    let accessible_address_ids = user_addresses::table
        .filter(user_addresses::user_id.eq(user_id))
        .select(user_addresses::address_id);
    let accessible_mailbox_ids = mailboxes::table
        .filter(mailboxes::address_id.eq_any(accessible_address_ids))
        .select(mailboxes::id);
    let accessible_message_ids = message_mailboxes::table
        .filter(message_mailboxes::mailbox_id.eq_any(accessible_mailbox_ids))
        .select(message_mailboxes::message_id);

    let message = messages::table
        .inner_join(raw_inbound_mails::table)
        .filter(messages::id.eq(message_id))
        .filter(messages::id.eq_any(accessible_message_ids))
        .select((Message::as_select(), RawInboundMail::as_select()))
        .first(&mut conn)
        .await?;
    Ok(message)
}

async fn try_process(state: &AppState, mail_id: i64) -> Result<(), AppError> {
    let mail: RawInboundMail = {
        let mut conn = state.db.get().await?;
        raw_inbound_mails::table
            .find(mail_id)
            .select(RawInboundMail::as_select())
            .first(&mut conn)
            .await?
    };

    // Which receiver accepted this message decides where it may be delivered.
    // Rows ingested before receivers existed carry no id and fall back to the
    // system receiver, which is also the only receiver allowed to deliver into
    // addresses that are not bound to anything yet.
    let receiver = match mail.receiver_id {
        Some(receiver_id) => crate::receivers::load(state, receiver_id).await?,
        None => {
            let mut conn = state.db.get().await?;
            crate::receivers::system_receiver(&mut conn).await?.ok_or_else(|| {
                AppError::BadRequest("no receiver is configured for this message".into())
            })?
        }
    };
    let receiver_id = receiver.id;
    let receiver_domain = {
        let mut conn = state.db.get().await?;
        let is_system = crate::receivers::is_system(&mut conn, &receiver).await?;
        receiver.mail_domain.clone().filter(|_| is_system)
    };

    if mail.processed_at.is_some() {
        cleanup_worker_staging(state, mail_id, mail.r2_key.as_deref(), &receiver).await;
        return Ok(());
    }

    let raw_key = mail.blob_key.clone();

    let raw = state.blob_store.get(&raw_key).await?.bytes;
    let parsed = parse_message(&raw)?;
    let recipient_addresses = recipient_addresses_for_delivery(&parsed.recipients);

    if recipient_addresses.is_empty() {
        return Err(AppError::BadRequest(
            "message does not contain any deliverable recipients".into(),
        ));
    }

    let mut conn = state.db.get().await?;
    conn.transaction::<(), AppError, _>(|conn| {
        let parsed = parsed.clone();
        let recipient_addresses = recipient_addresses.clone();
        Box::pin(async move {
            let matched_addresses: Vec<Address> = addresses::table
                .filter(addresses::address.eq_any(&recipient_addresses))
                .select(Address::as_select())
                .load(conn)
                .await?;

            // A receiver may only deliver to addresses bound to it. Without
            // this, any registered receiver could inject mail into any inbox.
            let target_addresses: Vec<Address> = matched_addresses
                .into_iter()
                .filter(|address| {
                    is_deliverable(
                        &address.address,
                        address.receiver_id,
                        receiver_id,
                        receiver_domain.as_deref(),
                    )
                })
                .collect();

            if target_addresses.is_empty() {
                return Err(AppError::BadRequest(
                    "no local addresses bound to this receiver matched recipients".into(),
                ));
            }

            let message_insert = NewMessage {
                id: state.next_id(),
                raw_inbound_mail_id: mail.id,
                message_id_header: parsed.message_id_header.as_deref(),
                thread_id: parsed.thread_id.as_deref(),
                from_addr: parsed.from_addr.as_deref(),
                from_name: parsed.from_name.as_deref(),
                subject: parsed.subject.as_deref(),
                preview: parsed.preview.as_deref(),
                received_at: mail.received_at,
                outbound_provider: None,
                outbound_provider_message_id: None,
            };

            let inserted_message = diesel::insert_into(messages::table)
                .values(&message_insert)
                .on_conflict(messages::raw_inbound_mail_id)
                .do_nothing()
                .returning(Message::as_returning())
                .get_result(conn)
                .await
                .optional()?;

            let (message, recipients, attachments) = if let Some(message) = inserted_message {
                let recipients =
                    insert_message_recipients(conn, state, &message, &parsed.recipients).await?;
                let attachments =
                    insert_attachments(conn, state, &message, &parsed.attachments).await?;
                (message, recipients, attachments)
            } else {
                let message = messages::table
                    .filter(messages::raw_inbound_mail_id.eq(mail.id))
                    .select(Message::as_select())
                    .first(conn)
                    .await?;
                let recipients = load_message_recipients(conn, &message).await?;
                let attachments = load_attachments(conn, &message).await?;
                (message, recipients, attachments)
            };

            for address in target_addresses {
                let ensured = ensure_system_mailboxes(conn, &state.ids, address.id).await?;
                let inbox = ensured
                    .all
                    .iter()
                    .find(|mailbox| mailbox.system_role.as_deref() == Some("inbox"))
                    .cloned()
                    .ok_or_else(|| AppError::BadRequest("missing inbox mailbox".into()))?;
                let target_user_ids: Vec<i64> = user_addresses::table
                    .filter(user_addresses::address_id.eq(address.id))
                    .select(user_addresses::user_id)
                    .load(conn)
                    .await?;

                let Some(message_mailbox) = insert_message_mailbox(conn, &message, &inbox).await?
                else {
                    for user_id in target_user_ids {
                        let new_events = mailbox_sync_events(state, user_id, &ensured.created);
                        if !new_events.is_empty() {
                            diesel::insert_into(sync_events::table)
                                .values(&new_events)
                                .execute(conn)
                                .await?;
                        }
                    }
                    continue;
                };

                for user_id in target_user_ids {
                    let mut new_events = mailbox_sync_events(state, user_id, &ensured.created);
                    new_events.push(sync_event(
                        state,
                        user_id,
                        "message",
                        message.id,
                        json!(message),
                    ));
                    new_events.extend(recipients.iter().map(|recipient| {
                        sync_event(
                            state,
                            user_id,
                            "messageRecipient",
                            recipient.id,
                            json!(recipient),
                        )
                    }));
                    new_events.extend(attachments.iter().map(|attachment| {
                        sync_event(
                            state,
                            user_id,
                            "attachment",
                            attachment.id,
                            json!(attachment),
                        )
                    }));
                    new_events.push(sync_event(
                        state,
                        user_id,
                        "messageMailbox",
                        message_mailbox.message_id,
                        json!(message_mailbox),
                    ));

                    if !new_events.is_empty() {
                        diesel::insert_into(sync_events::table)
                            .values(&new_events)
                            .execute(conn)
                            .await?;
                    }
                }
            }

            diesel::update(raw_inbound_mails::table.find(mail.id))
                .set((
                    raw_inbound_mails::processed_at.eq(Utc::now()),
                    raw_inbound_mails::error.eq(None::<String>),
                ))
                .execute(conn)
                .await?;

            Ok(())
        })
    })
    .await?;

    cleanup_worker_staging(state, mail.id, mail.r2_key.as_deref(), &receiver).await;

    Ok(())
}

async fn insert_message_recipients(
    conn: &mut diesel_async::AsyncPgConnection,
    state: &AppState,
    message: &Message,
    recipients: &[ParsedRecipient],
) -> Result<Vec<MessageRecipient>, AppError> {
    if recipients.is_empty() {
        return Ok(Vec::new());
    }

    let rows: Vec<NewMessageRecipient<'_>> = recipients
        .iter()
        .map(|recipient| NewMessageRecipient {
            id: state.next_id(),
            message_id: message.id,
            kind: recipient.kind,
            address: &recipient.address,
            display_name: recipient.display_name.as_deref(),
        })
        .collect();
    let ids: Vec<i64> = rows.iter().map(|row| row.id).collect();

    diesel::insert_into(message_recipients::table)
        .values(&rows)
        .execute(conn)
        .await?;

    let inserted = message_recipients::table
        .filter(message_recipients::id.eq_any(ids))
        .select(MessageRecipient::as_select())
        .load(conn)
        .await?;

    Ok(inserted)
}

async fn load_message_recipients(
    conn: &mut diesel_async::AsyncPgConnection,
    message: &Message,
) -> Result<Vec<MessageRecipient>, AppError> {
    let recipients = message_recipients::table
        .filter(message_recipients::message_id.eq(message.id))
        .select(MessageRecipient::as_select())
        .load(conn)
        .await?;
    Ok(recipients)
}

async fn insert_attachments(
    conn: &mut diesel_async::AsyncPgConnection,
    state: &AppState,
    message: &Message,
    attachments_in_mail: &[ParsedAttachment],
) -> Result<Vec<Attachment>, AppError> {
    if attachments_in_mail.is_empty() {
        return Ok(Vec::new());
    }

    let rows: Vec<NewAttachment<'_>> = attachments_in_mail
        .iter()
        .map(|attachment| NewAttachment {
            id: state.next_id(),
            message_id: message.id,
            filename: attachment.filename.as_deref(),
            content_type: attachment.content_type.as_deref(),
            size: attachment.size,
            content_id: attachment.content_id.as_deref(),
            inline: attachment.inline,
            blob_key: None,
        })
        .collect();
    let ids: Vec<i64> = rows.iter().map(|row| row.id).collect();

    diesel::insert_into(attachments::table)
        .values(&rows)
        .execute(conn)
        .await?;

    let inserted = attachments::table
        .filter(attachments::id.eq_any(ids))
        .select(Attachment::as_select())
        .load(conn)
        .await?;

    Ok(inserted)
}

async fn load_attachments(
    conn: &mut diesel_async::AsyncPgConnection,
    message: &Message,
) -> Result<Vec<Attachment>, AppError> {
    let attachments = attachments::table
        .filter(attachments::message_id.eq(message.id))
        .select(Attachment::as_select())
        .load(conn)
        .await?;
    Ok(attachments)
}

async fn insert_message_mailbox(
    conn: &mut diesel_async::AsyncPgConnection,
    message: &Message,
    inbox: &Mailbox,
) -> Result<Option<MessageMailbox>, AppError> {
    let relation = NewMessageMailbox {
        message_id: message.id,
        mailbox_id: inbox.id,
        relation: "location",
    };

    let inserted = diesel::insert_into(message_mailboxes::table)
        .values(&relation)
        .on_conflict_do_nothing()
        .execute(conn)
        .await?;

    if inserted == 0 {
        return Ok(None);
    }

    let inserted = message_mailboxes::table
        .filter(message_mailboxes::message_id.eq(message.id))
        .filter(message_mailboxes::mailbox_id.eq(inbox.id))
        .select(MessageMailbox::as_select())
        .first(conn)
        .await?;

    Ok(Some(inserted))
}

fn mailbox_sync_events(state: &AppState, user_id: i64, mailboxes: &[Mailbox]) -> Vec<NewSyncEvent> {
    mailboxes
        .iter()
        .map(|mailbox| sync_event(state, user_id, "mailbox", mailbox.id, json!(mailbox)))
        .collect()
}

fn sync_event(
    state: &AppState,
    user_id: i64,
    object_type: &str,
    object_id: i64,
    data: serde_json::Value,
) -> NewSyncEvent {
    NewSyncEvent {
        id: state.next_id(),
        user_id,
        object_type: object_type.to_owned(),
        object_id,
        op: "upsert".to_owned(),
        data_json: Some(data),
    }
}

async fn cleanup_worker_staging(
    state: &AppState,
    mail_id: i64,
    r2_key: Option<&str>,
    receiver: &EmailReceiverRecord,
) {
    let Some(key) = r2_key else {
        return;
    };

    let Some(worker) = crate::receivers::worker_client(state, receiver) else {
        tracing::warn!(
            mail_id,
            receiver_id = receiver.id,
            "receiver has no staging endpoint; leaving staged object in place"
        );
        return;
    };

    match worker.delete_unprocessed(key).await {
        Ok(()) => {
            if let Ok(mut conn) = state.db.get().await {
                let _ = diesel::update(raw_inbound_mails::table.find(mail_id))
                    .set(raw_inbound_mails::r2_key.eq(None::<String>))
                    .execute(&mut conn)
                    .await;
            }
        }
        Err(error) => {
            tracing::warn!(
                mail_id,
                %key,
                error = %error,
                "R2 delete failed; will be retried on next recovery run"
            );
        }
    }
}

async fn record_error(state: &AppState, mail_id: i64, error_msg: &str, mark_processed: bool) {
    let Ok(mut conn) = state.db.get().await else {
        return;
    };

    let processed_at = if mark_processed {
        Some(Utc::now())
    } else {
        None
    };
    let _ = diesel::update(raw_inbound_mails::table.find(mail_id))
        .set((
            raw_inbound_mails::error.eq(error_msg),
            raw_inbound_mails::processed_at.eq(processed_at),
        ))
        .execute(&mut conn)
        .await;
}

pub async fn current_sync_cursor(state: &AppState, user_id: i64) -> Result<i64, AppError> {
    let mut conn = state.db.get().await?;
    let cursor = sync_events::table
        .filter(sync_events::user_id.eq(user_id))
        .select(dsl::max(sync_events::id))
        .first::<Option<i64>>(&mut conn)
        .await?
        .unwrap_or(0);
    Ok(cursor)
}

fn recipient_addresses_for_delivery(recipients: &[ParsedRecipient]) -> Vec<String> {
    let mut seen = HashSet::new();
    recipients
        .iter()
        .filter(|recipient| matches!(recipient.kind, "to" | "cc" | "bcc"))
        .filter_map(|recipient| {
            let address = recipient.address.to_lowercase();
            if seen.insert(address.clone()) {
                Some(address)
            } else {
                None
            }
        })
        .collect()
}

/// May a message accepted by `receiver_id` be delivered to `address`?
///
/// A bound address only accepts its own receiver. An unbound address — one that
/// predates receivers, or whose receiver was deleted — is reachable only by the
/// system receiver, and only under the system receiver's own domain
/// (`system_domain`, `None` for any other receiver). Without that domain check,
/// deleting a receiver would hand its addresses to the deployment worker.
fn is_deliverable(
    address: &str,
    address_receiver_id: Option<i64>,
    receiver_id: i64,
    system_domain: Option<&str>,
) -> bool {
    match address_receiver_id {
        Some(bound) => bound == receiver_id,
        None => match (address.split_once('@'), system_domain) {
            (Some((_, domain)), Some(system_domain)) => domain.eq_ignore_ascii_case(system_domain),
            _ => false,
        },
    }
}

fn canonical_blob_key(raw_sha256: &str) -> String {
    format!("raw/{raw_sha256}.eml")
}

fn sha256_hex(raw: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delivery_is_confined_to_the_receiver_that_accepted_the_mail() {
        // A receiver delivers only to its own addresses...
        assert!(is_deliverable("ada@panit.dev", Some(7), 7, None));
        // ...never into an inbox belonging to another receiver, even when it is
        // the system receiver holding the broadest privileges.
        assert!(!is_deliverable("ada@panit.dev", Some(9), 7, None));
        assert!(!is_deliverable("ada@panit.dev", Some(9), 1, Some("panit.dev")));
    }

    #[test]
    fn unbound_addresses_are_reachable_only_by_the_system_receiver_under_its_own_domain() {
        assert!(is_deliverable("ada@panit.dev", None, 1, Some("panit.dev")));
        // A user-registered receiver never reaches an unbound address...
        assert!(!is_deliverable("ada@panit.dev", None, 7, None));
        // ...and an address orphaned by a deleted receiver does not fall into
        // the deployment worker's scope just because it lost its binding.
        assert!(!is_deliverable("ada@alice.dev", None, 1, Some("panit.dev")));
    }
}
