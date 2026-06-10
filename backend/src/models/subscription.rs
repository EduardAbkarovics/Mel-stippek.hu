use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};

/// Csomag azonosítók: "foci" | "esport" | "elo"
pub const PACKAGES: [&str; 3] = ["foci", "esport", "elo"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub user_id: ObjectId,
    /// "foci" | "esport" | "elo"
    pub package: String,
    /// "active" | "cancelled" | "expired"
    pub status: String,
    /// Stripe subscription ID (egyszeri teszt fizetésnél None).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stripe_subscription_id: Option<String>,
    pub started_at: BsonDateTime,
    /// Lejárat — ha elmúlt, a user NEM fér hozzá a tartalomhoz.
    pub expires_at: BsonDateTime,
    pub created_at: BsonDateTime,
    pub updated_at: BsonDateTime,
}

impl Subscription {
    pub fn is_active(&self) -> bool {
        self.status == "active"
            && self.expires_at.timestamp_millis() > BsonDateTime::now().timestamp_millis()
    }
}

#[derive(Debug, Serialize)]
pub struct PublicSubscription {
    pub package: String,
    pub status: String,
    pub active: bool,
    pub expires_at: String,
}

impl From<&Subscription> for PublicSubscription {
    fn from(s: &Subscription) -> Self {
        PublicSubscription {
            package: s.package.clone(),
            status: s.status.clone(),
            active: s.is_active(),
            expires_at: s
                .expires_at
                .try_to_rfc3339_string()
                .unwrap_or_default(),
        }
    }
}
