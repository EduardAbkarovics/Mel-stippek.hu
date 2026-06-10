use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};

/// Login session — MongoDB-ben tárolva, lejárattal.
/// A kliens az opaque tokent kapja, mi csak a sha256 hash-t tároljuk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub token_hash: String,
    pub user_id: ObjectId,
    pub user_agent: Option<String>,
    pub ip: Option<String>,
    pub created_at: BsonDateTime,
    pub expires_at: BsonDateTime,
}

impl Session {
    pub const LIFETIME_DAYS: i64 = 30;
}
