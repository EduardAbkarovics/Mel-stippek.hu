use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),
    #[error("Nincs bejelentkezve")]
    Unauthorized,
    #[error("Nincs jogosultság")]
    Forbidden,
    #[error("Nem található")]
    NotFound,
    #[error("Túl sok kérés, próbáld később")]
    TooManyRequests,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m.clone()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::Forbidden => (StatusCode::FORBIDDEN, self.to_string()),
            AppError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::TooManyRequests => (StatusCode::TOO_MANY_REQUESTS, self.to_string()),
            AppError::Internal(e) => {
                tracing::error!("internal error: {e:#}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Szerver hiba".to_string())
            }
        };
        (status, Json(json!({ "error": msg }))).into_response()
    }
}

impl From<mongodb::error::Error> for AppError {
    fn from(e: mongodb::error::Error) -> Self {
        AppError::Internal(e.into())
    }
}
