use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("unauthorized: {0}")]
    Unauthorized(String),

    #[error("not found")]
    NotFound,

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("database error")]
    Db(#[from] diesel::result::Error),

    #[error("pool unavailable")]
    Pool(#[from] diesel_async::pooled_connection::bb8::RunError),

    #[error("upstream request failed")]
    Http(#[from] reqwest::Error),

    #[error("internal error")]
    Internal,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            AppError::Unauthorized(m) => (StatusCode::UNAUTHORIZED, m.as_str().to_owned()),
            AppError::NotFound => (StatusCode::NOT_FOUND, "not found".into()),
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m.as_str().to_owned()),
            AppError::Db(e) => {
                use diesel::result::{DatabaseErrorKind, Error as De};
                match e {
                    De::NotFound => (StatusCode::NOT_FOUND, "not found".into()),
                    De::DatabaseError(DatabaseErrorKind::UniqueViolation, _) => {
                        (StatusCode::CONFLICT, "already exists".into())
                    }
                    _ => (StatusCode::INTERNAL_SERVER_ERROR, "database error".into()),
                }
            }
            AppError::Pool(_) => (StatusCode::SERVICE_UNAVAILABLE, "service unavailable".into()),
            AppError::Http(_) => (StatusCode::BAD_GATEWAY, "upstream error".into()),
            AppError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into()),
        };
        (status, Json(json!({ "error": msg }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, AppError>;
