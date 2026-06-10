use axum::{extract::State, routing::get, Json, Router};
use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    middleware::AuthUser,
    models::PublicTip,
    services::mongo as db,
    AppState,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/tips", get(my_tips))
}

/// A bejelentkezett user tippjei — CSAK az aktív (nem lejárt) előfizetései csomagjaiból.
/// Lejárt előfizetéssel üres listát kap.
async fn my_tips(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let packages = db::active_packages(&state.mongo.subscriptions, auth.user_id)
        .await
        .map_err(AppError::Internal)?;

    let tips = db::tips_for_packages(&state.mongo.tips, &packages, 200)
        .await
        .map_err(AppError::Internal)?;
    let tips: Vec<PublicTip> = tips.iter().map(PublicTip::from).collect();

    Ok(Json(serde_json::json!({
        "packages": packages,
        "tips": tips,
    })))
}
