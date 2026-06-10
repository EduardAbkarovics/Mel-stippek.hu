use axum::{
    extract::{ConnectInfo, State},
    http::HeaderMap,
    routing::post,
    Json, Router,
};
use std::{net::SocketAddr, sync::Arc};

use crate::{
    error::{AppError, AppResult},
    middleware::AuthUser,
    routes::auth::get_ip,
    services::{discord, mongo as db},
    AppState,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/track/visit", post(track_visit))
}

#[derive(serde::Deserialize, Default)]
struct VisitRequest {
    #[serde(default)]
    path: Option<String>,
}

/// Látogatás követés: a frontend hívja oldalbetöltéskor, mi pedig Discordra
/// küldjük az IP-t, helyet, eszközt és (ha van) a fiók adatait.
async fn track_visit(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    auth: Option<AuthUser>,
    Json(req): Json<VisitRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let ip = get_ip(&headers, Some(addr));
    if !state.check_rate_limit(&format!("visit:{ip}"), 20, 600) {
        return Err(AppError::TooManyRequests);
    }

    let ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let path = req
        .path
        .unwrap_or_default()
        .chars()
        .filter(|c| !c.is_control())
        .take(120)
        .collect::<String>();
    let path = if path.is_empty() { "/".to_string() } else { path };

    // fiók adatok, ha be van jelentkezve
    let account = match auth {
        Some(a) => {
            let user = db::find_user_by_id(&state.mongo.users, a.user_id)
                .await
                .map_err(AppError::Internal)?;
            user.map(|u| (u.email, u.name, u.telegram_username))
        }
        None => None,
    };

    discord::notify_visit(
        state.http.clone(),
        state.config.discord_webhook_visit.clone(),
        path,
        ip,
        ua,
        account,
    );

    Ok(Json(serde_json::json!({ "ok": true })))
}
