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

    #[error("database error: {0}")]
    Db(#[from] diesel::result::Error),

    #[error("pool error: {0}")]
    Pool(#[from] diesel_async::pooled_connection::bb8::RunError),

    #[error("upstream request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("internal error")]
    Internal,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg): (StatusCode, String) = match &self {
            AppError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, "unauthorized".to_owned()),
            AppError::NotFound => (StatusCode::NOT_FOUND, "not found".to_owned()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Db(e) => {
                use diesel::result::Error as De;
                match e {
                    De::NotFound => (StatusCode::NOT_FOUND, "not found".to_owned()),
                    _ => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "database error".to_owned(),
                    ),
                }
            }
            AppError::Pool(_) => (
                StatusCode::SERVICE_UNAVAILABLE,
                "service unavailable".to_owned(),
            ),
            AppError::Http(_) => (StatusCode::BAD_GATEWAY, "upstream error".to_owned()),
            AppError::Io(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "storage error".to_owned(),
            ),
            AppError::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal error".to_owned(),
            ),
        };
        (status, Json(json!({ "error": msg }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, AppError>;
