use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
};
use bytes::Bytes;
use diesel_async::RunQueryDsl;

use crate::{
    error::{ApiResult, AppError},
    mail::process_inbound_mail,
    models::raw_inbound_mail::NewRawInboundMail,
    schema::raw_inbound_mails,
    state::AppState,
};

pub async fn inbound_mail(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<StatusCode> {
    verify_bearer(&headers, &state.config.internal_secret)?;

    let r2_key = headers
        .get("X-R2-Key")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let mail_id = {
        let mut conn = state.db.get().await?;
        let new_mail = NewRawInboundMail {
            id: state.next_id(),
            raw_mime: &body,
            r2_key: r2_key.as_deref(),
        };
        diesel::insert_into(raw_inbound_mails::table)
            .values(&new_mail)
            .returning(raw_inbound_mails::id)
            .get_result::<i64>(&mut conn)
            .await?
    };

    tokio::spawn(process_inbound_mail(state, mail_id));

    Ok(StatusCode::OK)
}

fn verify_bearer(headers: &HeaderMap, expected: &str) -> Result<(), AppError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    if token != Some(expected) {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}
