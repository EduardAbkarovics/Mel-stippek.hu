use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, HeaderMap},
};
use sha2::{Digest, Sha256};
use std::sync::Arc;

use crate::{error::AppError, services::mongo, AppState};

/// Bejelentkezett user — a session token a MongoDB sessions collectionben van ellenőrizve.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: mongodb::bson::oid::ObjectId,
    pub email: String,
    pub is_admin: bool,
}

/// Csak admin (ADMIN_EMAILS env-ben felsorolt emailek).
#[derive(Debug, Clone)]
pub struct AdminUser(pub AuthUser);

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn generate_token() -> String {
    use base64::Engine;
    use rand::RngCore;
    let mut bytes = [0u8; 48];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    let auth = headers.get("Authorization")?.to_str().ok()?;
    let token = auth.strip_prefix("Bearer ")?;
    Some(token.to_string())
}

#[async_trait]
impl FromRequestParts<Arc<AppState>> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer_token(&parts.headers).ok_or(AppError::Unauthorized)?;
        let token_hash = hash_token(&token);

        let session = mongo::find_session(&state.mongo.sessions, &token_hash)
            .await
            .map_err(AppError::Internal)?
            .ok_or(AppError::Unauthorized)?;

        let user = mongo::find_user_by_id(&state.mongo.users, session.user_id)
            .await
            .map_err(AppError::Internal)?
            .ok_or(AppError::Unauthorized)?;

        Ok(AuthUser {
            user_id: session.user_id,
            is_admin: state.config.is_admin(&user.email),
            email: user.email,
        })
    }
}

#[async_trait]
impl FromRequestParts<Arc<AppState>> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if !user.is_admin {
            return Err(AppError::Forbidden);
        }
        Ok(AdminUser(user))
    }
}
