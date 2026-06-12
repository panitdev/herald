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
    error::AppError,
    mail_parser::{parse_message, render_body, ParsedAttachment, ParsedRecipient},
    mailboxes::ensure_system_mailboxes,
    models::{
        attachment::{Attachment, NewAttachment},
        mailbox::Mailbox,
        message::{Message, NewMessage},
        message_mailbox::{MessageMailbox, NewMessageMailbox},
        message_recipient::{MessageRecipient, NewMessageRecipient},
        raw_inbound_mail::{NewRawInboundMail, RawInboundMail},
        sync_event::NewSyncEvent,
        user::User,
    },
    schema::{
        attachments, mailboxes, message_mailboxes, message_recipients, messages, raw_inbound_mails,
        sync_events, users,
    },
    state::AppState,
};

const RAW_MIME_CONTENT_TYPE: &str = "message/rfc822";

pub async fn ingest_raw_mail(
    state: &AppState,
    raw: Bytes,
    r2_key: Option<&str>,
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
    };

    let mut conn = state.db.get().await?;

    let saved = if r2_key.is_some() {
        diesel::insert_into(raw_inbound_mails::table)
            .values(&new_mail)
            .on_conflict(raw_inbound_mails::raw_sha256)
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
            .on_conflict(raw_inbound_mails::raw_sha256)
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

pub async fn find_owned_message(
    state: &AppState,
    user_id: i64,
    message_id: i64,
) -> Result<(Message, RawInboundMail), AppError> {
    let mut conn = state.db.get().await?;
    let accessible_message_ids = message_mailboxes::table
        .inner_join(mailboxes::table)
        .filter(mailboxes::user_id.eq(user_id))
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

    if mail.processed_at.is_some() {
        cleanup_worker_staging(state, mail_id, mail.r2_key.as_deref()).await;
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
            let target_users: Vec<User> = users::table
                .filter(users::address.eq_any(&recipient_addresses))
                .select(User::as_select())
                .load(conn)
                .await?;

            if target_users.is_empty() {
                return Err(AppError::BadRequest(
                    "no local users matched recipients".into(),
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

            for user in target_users {
                let ensured = ensure_system_mailboxes(conn, &state.ids, user.id).await?;
                let inbox = ensured
                    .all
                    .iter()
                    .find(|mailbox| mailbox.system_role.as_deref() == Some("inbox"))
                    .cloned()
                    .ok_or_else(|| AppError::BadRequest("missing inbox mailbox".into()))?;

                let mut new_events = mailbox_sync_events(state, user.id, &ensured.created);
                let Some(message_mailbox) = insert_message_mailbox(conn, &message, &inbox).await? else {
                    if !new_events.is_empty() {
                        diesel::insert_into(sync_events::table)
                            .values(&new_events)
                            .execute(conn)
                            .await?;
                    }
                    continue;
                };

                new_events.push(sync_event(state, user.id, "message", message.id, json!(message)));
                new_events.extend(recipients.iter().map(|recipient| {
                    sync_event(
                        state,
                        user.id,
                        "messageRecipient",
                        recipient.id,
                        json!(recipient),
                    )
                }));
                new_events.extend(attachments.iter().map(|attachment| {
                    sync_event(
                        state,
                        user.id,
                        "attachment",
                        attachment.id,
                        json!(attachment),
                    )
                }));
                new_events.push(sync_event(
                    state,
                    user.id,
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

    cleanup_worker_staging(state, mail.id, mail.r2_key.as_deref()).await;

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

async fn cleanup_worker_staging(state: &AppState, mail_id: i64, r2_key: Option<&str>) {
    let Some(key) = r2_key else {
        return;
    };

    match state.worker.delete_unprocessed(key).await {
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
            if seen.insert(recipient.address.clone()) {
                Some(recipient.address.clone())
            } else {
                None
            }
        })
        .collect()
}

fn canonical_blob_key(raw_sha256: &str) -> String {
    format!("raw/{raw_sha256}.eml")
}

fn sha256_hex(raw: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw);
    hex::encode(hasher.finalize())
}
