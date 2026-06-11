use chrono::Utc;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;

use crate::{
    error::AppError,
    models::raw_inbound_mail::RawInboundMail,
    schema::raw_inbound_mails,
    state::AppState,
};

/// Spawnable entry point — catches all errors and writes them to the `error` column.
pub async fn process_inbound_mail(state: AppState, mail_id: i64) {
    if let Err(e) = try_process(&state, mail_id).await {
        tracing::error!(mail_id, error = %e, "inbound mail processing failed");
        record_error(&state, mail_id, &e.to_string()).await;
    }
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

    // TODO(EML-4): parse mail.raw_mime, route to mailbox, send realtime notification
    let _ = &mail.raw_mime;

    {
        let mut conn = state.db.get().await?;
        diesel::update(raw_inbound_mails::table.find(mail_id))
            .set(raw_inbound_mails::processed_at.eq(Utc::now()))
            .execute(&mut conn)
            .await?;
    }

    // Delete from R2 only after processing is confirmed; clear key on success.
    if let Some(key) = mail.r2_key {
        match state.worker.delete_unprocessed(&key).await {
            Ok(()) => {
                let mut conn = state.db.get().await?;
                diesel::update(raw_inbound_mails::table.find(mail_id))
                    .set(raw_inbound_mails::r2_key.eq(None::<String>))
                    .execute(&mut conn)
                    .await?;
            }
            Err(e) => {
                tracing::warn!(
                    mail_id,
                    %key,
                    error = %e,
                    "R2 delete failed; will be retried on next recovery run"
                );
            }
        }
    }

    Ok(())
}

async fn record_error(state: &AppState, mail_id: i64, error_msg: &str) {
    let Ok(mut conn) = state.db.get().await else {
        return;
    };
    let _ = diesel::update(raw_inbound_mails::table.find(mail_id))
        .set(raw_inbound_mails::error.eq(error_msg))
        .execute(&mut conn)
        .await;
}
