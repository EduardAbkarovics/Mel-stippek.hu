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
    Router::new()
        .route("/api/track/visit", post(track_visit))
        .route("/api/track/leave", post(track_leave))
}

/// Vezérlőkarakterek nélkül, levágva — a frontendről jövő szövegekhez.
fn clean(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(max).collect::<String>().trim().to_string()
}

/// Bejelentkezett user adatai + aktív előfizetései a Discord értesítőkhöz.
async fn visit_account(
    state: &AppState,
    auth: Option<AuthUser>,
) -> AppResult<Option<discord::VisitAccount>> {
    let Some(a) = auth else { return Ok(None) };
    let Some(user) = db::find_user_by_id(&state.mongo.users, a.user_id)
        .await
        .map_err(AppError::Internal)?
    else {
        return Ok(None);
    };
    let subs = db::user_subscriptions(&state.mongo.subscriptions, a.user_id)
        .await
        .map_err(AppError::Internal)?;
    let subs = subs
        .iter()
        .filter(|s| s.is_active())
        .map(|s| {
            // RFC3339 eleje a dátum: "2026-07-01"
            let until: String = s
                .expires_at
                .try_to_rfc3339_string()
                .unwrap_or_default()
                .chars()
                .take(10)
                .collect();
            let renew = if s.auto_renew { "🔁" } else { "🛑 lemondva" };
            format!("{} — {until}-ig {renew}", discord::package_pretty(&s.package))
        })
        .collect();
    Ok(Some(discord::VisitAccount {
        email: user.email,
        name: user.name,
        telegram: user.telegram_username,
        subs,
    }))
}

#[derive(serde::Deserialize, Default)]
struct VisitRequest {
    #[serde(default)]
    path: Option<String>,
}

/// Látogatás követés: a frontend hívja oldalbetöltéskor, mi pedig Discordra
/// küldjük az IP-t, helyet, eszközt és (ha van) a fiók + előfizetés adatait.
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
    let path = clean(&req.path.unwrap_or_default(), 120);
    let path = if path.is_empty() { "/".to_string() } else { path };

    let account = visit_account(&state, auth).await?;

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

#[derive(serde::Deserialize, Default)]
struct LeaveRequest {
    /// A látogatás hossza ezredmásodpercben.
    #[serde(default)]
    duration_ms: u64,
    /// Megnézett oldalak sorrendben.
    #[serde(default)]
    pages: Vec<String>,
    /// Gomb/link feliratok, amikre kattintott (ismétlődhet).
    #[serde(default)]
    clicks: Vec<String>,
}

/// Látogatás vége: a frontend távozáskor (pagehide) küldi keepalive fetch-csel.
/// Összegzést küldünk Discordra: meddig volt itt, mit nézett, mire kattintott.
async fn track_leave(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    auth: Option<AuthUser>,
    Json(req): Json<LeaveRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let ip = get_ip(&headers, Some(addr));
    if !state.check_rate_limit(&format!("leave:{ip}"), 20, 600) {
        return Err(AppError::TooManyRequests);
    }

    let ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // max 12 óra — ennél hosszabb "látogatás" nyitva felejtett tab
    let duration_secs = (req.duration_ms / 1000).min(12 * 3600);
    let started_at = chrono::Utc::now() - chrono::Duration::seconds(duration_secs as i64);

    let pages: Vec<String> = req
        .pages
        .iter()
        .take(15)
        .map(|p| clean(p, 80))
        .filter(|p| !p.is_empty())
        .collect();

    // kattintások összesítése: felirat → darabszám, az első előfordulás sorrendjében
    let mut clicks: Vec<(String, u32)> = Vec::new();
    for c in req.clicks.iter().take(60) {
        let label = clean(c, 48);
        if label.is_empty() {
            continue;
        }
        match clicks.iter().position(|(l, _)| *l == label) {
            Some(i) => clicks[i].1 += 1,
            None if clicks.len() < 14 => clicks.push((label, 1)),
            None => {}
        }
    }

    let account = visit_account(&state, auth).await?;

    discord::notify_visit_summary(
        state.http.clone(),
        state.config.discord_webhook_visit.clone(),
        discord::VisitSummary {
            ip,
            ua,
            account,
            started_at_utc: started_at,
            duration_secs,
            pages,
            clicks,
        },
    );

    Ok(Json(serde_json::json!({ "ok": true })))
}
