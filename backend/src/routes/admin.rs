use axum::{
    extract::{Path, Query, State},
    routing::{delete, get, patch, post},
    Json, Router,
};
use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use std::{collections::HashMap, sync::Arc};

use crate::{
    error::{AppError, AppResult},
    middleware::AdminUser,
    models::{subscription::PACKAGES, tip::CATEGORIES, PublicSubscription, PublicTip, Tip},
    services::{mongo as db, odds},
    AppState,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/admin/matches", get(matches))
        .route("/api/admin/tips", get(all_tips).post(create_tip))
        .route("/api/admin/tips/:id", delete(delete_tip).patch(update_tip_result))
        .route("/api/admin/users", get(users))
        .route("/api/admin/stats", get(stats))
}

/// Meccsnaptár: foci / e-sport / élő meccsek oddsokkal (API kulcsok proxy-zva a backenden).
async fn matches(
    State(state): State<Arc<AppState>>,
    _admin: AdminUser,
    Query(params): Query<HashMap<String, String>>,
) -> AppResult<Json<serde_json::Value>> {
    let package = params.get("package").map(|s| s.as_str()).unwrap_or("foci");
    if !PACKAGES.contains(&package) {
        return Err(AppError::BadRequest("Ismeretlen csomag".into()));
    }
    let result = odds::matches_for_package(&state, package)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(result))
}

#[derive(serde::Deserialize)]
struct CreateTipRequest {
    package: String,
    category: String,
    match_name: String,
    selection: String,
    market: String,
    odds: f64,
    /// RFC3339, pl. "2026-06-11T18:30:00Z"
    starts_at: String,
    note: Option<String>,
}

async fn create_tip(
    State(state): State<Arc<AppState>>,
    admin: AdminUser,
    Json(req): Json<CreateTipRequest>,
) -> AppResult<Json<PublicTip>> {
    if !PACKAGES.contains(&req.package.as_str()) {
        return Err(AppError::BadRequest("Ismeretlen csomag".into()));
    }
    if !CATEGORIES.contains(&req.category.as_str()) {
        return Err(AppError::BadRequest("Ismeretlen kategória".into()));
    }
    if req.match_name.trim().is_empty() || req.selection.trim().is_empty() {
        return Err(AppError::BadRequest("Meccs és tipp megadása kötelező".into()));
    }
    if req.odds < 1.0 || req.odds > 1000.0 {
        return Err(AppError::BadRequest("Érvénytelen odds".into()));
    }
    let starts_at = chrono::DateTime::parse_from_rfc3339(&req.starts_at)
        .map_err(|_| AppError::BadRequest("Érvénytelen dátum".into()))?;

    let now = BsonDateTime::now();
    let tip = Tip {
        id: None,
        package: req.package,
        category: req.category,
        match_name: req.match_name.trim().to_string(),
        selection: req.selection.trim().to_string(),
        market: req.market.trim().to_string(),
        odds: req.odds,
        starts_at: BsonDateTime::from_millis(starts_at.timestamp_millis()),
        result: "pending".into(),
        note: req.note.filter(|n| !n.trim().is_empty()),
        created_by: admin.0.email,
        created_at: now,
        updated_at: now,
    };
    let created = db::create_tip(&state.mongo.tips, tip)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(PublicTip::from(&created)))
}

async fn all_tips(
    State(state): State<Arc<AppState>>,
    _admin: AdminUser,
) -> AppResult<Json<Vec<PublicTip>>> {
    let tips = db::list_all_tips(&state.mongo.tips)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(tips.iter().map(PublicTip::from).collect()))
}

async fn delete_tip(
    State(state): State<Arc<AppState>>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("Hibás ID".into()))?;
    let deleted = db::delete_tip(&state.mongo.tips, oid)
        .await
        .map_err(AppError::Internal)?;
    if !deleted {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(serde::Deserialize)]
struct UpdateTipRequest {
    /// "pending" | "won" | "lost"
    result: String,
}

async fn update_tip_result(
    State(state): State<Arc<AppState>>,
    _admin: AdminUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateTipRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !["pending", "won", "lost"].contains(&req.result.as_str()) {
        return Err(AppError::BadRequest("Érvénytelen eredmény".into()));
    }
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("Hibás ID".into()))?;
    let updated = db::set_tip_result(&state.mongo.tips, oid, &req.result)
        .await
        .map_err(AppError::Internal)?;
    if !updated {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Userek listája az aktív előfizetéseikkel.
async fn users(
    State(state): State<Arc<AppState>>,
    _admin: AdminUser,
) -> AppResult<Json<serde_json::Value>> {
    let users = db::list_users(&state.mongo.users)
        .await
        .map_err(AppError::Internal)?;
    let subs = db::list_subscriptions(&state.mongo.subscriptions)
        .await
        .map_err(AppError::Internal)?;

    let mut by_user: HashMap<String, Vec<PublicSubscription>> = HashMap::new();
    for s in &subs {
        by_user
            .entry(s.user_id.to_hex())
            .or_default()
            .push(PublicSubscription::from(s));
    }

    let list: Vec<serde_json::Value> = users
        .iter()
        .map(|u| {
            let id = u.id_string();
            serde_json::json!({
                "id": id,
                "email": u.email,
                "name": u.name,
                "telegram_username": u.telegram_username,
                "is_admin": state.config.is_admin(&u.email),
                "created_at": u.created_at.try_to_rfc3339_string().unwrap_or_default(),
                "subscriptions": by_user.remove(&id).unwrap_or_default(),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "users": list })))
}

async fn stats(
    State(state): State<Arc<AppState>>,
    _admin: AdminUser,
) -> AppResult<Json<serde_json::Value>> {
    let user_count = state.mongo.users.count_documents(None, None).await?;
    let active_subs = state
        .mongo
        .subscriptions
        .count_documents(
            mongodb::bson::doc! { "status": "active", "expires_at": { "$gt": BsonDateTime::now() } },
            None,
        )
        .await?;
    let tip_count = state.mongo.tips.count_documents(None, None).await?;
    let won = state
        .mongo
        .tips
        .count_documents(mongodb::bson::doc! { "result": "won" }, None)
        .await?;
    let lost = state
        .mongo
        .tips
        .count_documents(mongodb::bson::doc! { "result": "lost" }, None)
        .await?;

    Ok(Json(serde_json::json!({
        "users": user_count,
        "active_subscriptions": active_subs,
        "tips": tip_count,
        "won": won,
        "lost": lost,
    })))
}
