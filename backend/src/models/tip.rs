use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};

/// Alkategóriák (csak előfizetőknek):
/// "over_under" — Gólszám felett/alatt | "win" — Nyertes csapat | "light" — Alacsony kockázat
pub const CATEGORIES: [&str; 3] = ["over_under", "win", "light"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tip {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    /// Melyik csomag látja: "foci" | "esport" | "elo"
    pub package: String,
    /// "over_under" | "win" | "light"
    pub category: String,
    /// Pl. "Nitra vs. Kosice"
    pub match_name: String,
    /// A tipp maga, pl. "Nitra" vagy "4,5 felett"
    pub selection: String,
    /// Piac neve, pl. "1X2", "Gólok száma", "Mérkőzés győztese"
    pub market: String,
    pub odds: f64,
    /// Meccs kezdete
    pub starts_at: BsonDateTime,
    /// "pending" | "won" | "lost"
    pub result: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Admin email, aki létrehozta
    pub created_by: String,
    pub created_at: BsonDateTime,
    pub updated_at: BsonDateTime,
}

#[derive(Debug, Serialize)]
pub struct PublicTip {
    pub id: String,
    pub package: String,
    pub category: String,
    pub match_name: String,
    pub selection: String,
    pub market: String,
    pub odds: f64,
    pub starts_at: String,
    pub result: String,
    pub note: Option<String>,
    pub created_at: String,
}

impl From<&Tip> for PublicTip {
    fn from(t: &Tip) -> Self {
        PublicTip {
            id: t.id.map(|o| o.to_hex()).unwrap_or_default(),
            package: t.package.clone(),
            category: t.category.clone(),
            match_name: t.match_name.clone(),
            selection: t.selection.clone(),
            market: t.market.clone(),
            odds: t.odds,
            starts_at: t.starts_at.try_to_rfc3339_string().unwrap_or_default(),
            result: t.result.clone(),
            note: t.note.clone(),
            created_at: t.created_at.try_to_rfc3339_string().unwrap_or_default(),
        }
    }
}
