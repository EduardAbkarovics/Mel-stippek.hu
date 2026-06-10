use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub google_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub telegram_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub telegram_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    /// Jelszó visszaállító token (sha256 hex) + lejárat
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_token_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_token_expires: Option<BsonDateTime>,
    pub created_at: BsonDateTime,
    pub updated_at: BsonDateTime,
}

impl User {
    pub fn id_string(&self) -> String {
        self.id.map(|o| o.to_hex()).unwrap_or_default()
    }
}

#[derive(Debug, Serialize)]
pub struct PublicUser {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub telegram_username: Option<String>,
    pub telegram_linked: bool,
    pub is_admin: bool,
    /// Aktív (nem lejárt) előfizetések csomagjai: "foci" | "esport" | "elo"
    pub packages: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: PublicUser,
}
