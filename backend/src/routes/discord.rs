//! Discord fiók-összekapcsolás (OAuth2) — a profilról indítva, state nonce-szal
//! kötve a bejelentkezett userhez. Sikeres link után guild join + rang-sync.

use axum::{
    extract::{ConnectInfo, Query, State},
    http::HeaderMap,
    response::Redirect,
    routing::{get, post},
    Json, Router,
};
use mongodb::bson::{doc, DateTime as BsonDateTime};
use serde_json::{json, Value};
use std::{net::SocketAddr, sync::Arc};

use crate::{
    error::{AppError, AppResult},
    middleware::auth::{generate_token, hash_token},
    middleware::AuthUser,
    routes::auth::get_ip,
    services::{discord_bot, mongo as db},
    AppState,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/auth/discord/url", get(discord_url))
        .route("/api/auth/discord/callback", get(discord_callback))
        .route("/api/auth/discord/unlink", post(discord_unlink))
}

/// A Discord authorize URL kiadása a bejelentkezett usernek. A state nonce
/// hash-elve a user docra kerül 10 perces lejárattal (reset-token minta).
async fn discord_url(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> AppResult<Json<Value>> {
    let ip = get_ip(&headers, Some(addr));
    if !state.check_rate_limit(&ip, 10, 600) {
        return Err(AppError::TooManyRequests);
    }
    if !state.config.discord_enabled() {
        return Err(AppError::BadRequest(
            "A Discord összekapcsolás nincs beállítva".into(),
        ));
    }

    let nonce = generate_token();
    let expires = chrono::Utc::now() + chrono::Duration::minutes(10);
    state
        .mongo
        .users
        .update_one(
            doc! { "_id": auth.user_id },
            doc! { "$set": {
                "discord_link_state_hash": hash_token(&nonce),
                "discord_link_state_expires": BsonDateTime::from_millis(expires.timestamp_millis()),
                "updated_at": BsonDateTime::now(),
            }},
            None,
        )
        .await?;

    let redirect_uri = format!("{}/api/auth/discord/callback", state.config.backend_url);
    let params = [
        ("client_id", state.config.discord_client_id.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("response_type", "code"),
        ("scope", "identify guilds.join"),
        ("state", nonce.as_str()),
        ("prompt", "consent"),
    ];
    let qs = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    Ok(Json(json!({
        "url": format!("https://discord.com/oauth2/authorize?{qs}")
    })))
}

#[derive(serde::Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

/// A Discordtól visszaérkező browser — minden ágon a profilra irányítunk vissza.
async fn discord_callback(
    State(state): State<Arc<AppState>>,
    Query(q): Query<CallbackQuery>,
) -> Redirect {
    let frontend = state.config.frontend_url.clone();
    match handle_callback(&state, q).await {
        Ok(()) => Redirect::temporary(&format!("{frontend}/profil?discord=linked")),
        Err(kind) => Redirect::temporary(&format!("{frontend}/profil?discord_error={kind}")),
    }
}

async fn handle_callback(state: &Arc<AppState>, q: CallbackQuery) -> Result<(), &'static str> {
    if q.error.is_some() {
        return Err("oauth");
    }
    let code = q.code.ok_or("oauth")?;
    let nonce = q.state.ok_or("expired")?;

    // a nonce köti a callbacket a userhez — lejárt/idegen state itt bukik el
    let user = state
        .mongo
        .users
        .find_one(
            doc! {
                "discord_link_state_hash": hash_token(&nonce),
                "discord_link_state_expires": { "$gt": BsonDateTime::now() },
            },
            None,
        )
        .await
        .map_err(|e| {
            tracing::error!("Discord callback db hiba: {e}");
            "oauth"
        })?
        .ok_or("expired")?;
    let user_oid = user.id.ok_or("oauth")?;

    // code → access token
    let redirect_uri = format!("{}/api/auth/discord/callback", state.config.backend_url);
    let resp = state
        .http
        .post("https://discord.com/api/v10/oauth2/token")
        .form(&[
            ("client_id", state.config.discord_client_id.as_str()),
            ("client_secret", state.config.discord_client_secret.as_str()),
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await
        .map_err(|_| "oauth")?;
    if !resp.status().is_success() {
        tracing::warn!("Discord token csere hiba: {}", resp.status());
        return Err("oauth");
    }
    let token_json: Value = resp.json().await.map_err(|_| "oauth")?;
    let access_token = token_json["access_token"].as_str().ok_or("oauth")?.to_string();

    // ki a Discord user?
    let resp = state
        .http
        .get("https://discord.com/api/v10/users/@me")
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|_| "oauth")?;
    if !resp.status().is_success() {
        return Err("oauth");
    }
    let me: Value = resp.json().await.map_err(|_| "oauth")?;
    let discord_id = me["id"].as_str().ok_or("oauth")?.to_string();
    let discord_username = me["global_name"]
        .as_str()
        .or_else(|| me["username"].as_str())
        .unwrap_or("?")
        .to_string();

    // egy Discord fiók csak egy oldalbeli fiókhoz tartozhat
    let taken = state
        .mongo
        .users
        .find_one(
            doc! { "discord_id": &discord_id, "_id": { "$ne": user_oid } },
            None,
        )
        .await
        .map_err(|_| "oauth")?;
    if taken.is_some() {
        return Err("taken");
    }

    state
        .mongo
        .users
        .update_one(
            doc! { "_id": user_oid },
            doc! {
                "$set": {
                    "discord_id": &discord_id,
                    "discord_username": &discord_username,
                    "updated_at": BsonDateTime::now(),
                },
                "$unset": { "discord_link_state_hash": "", "discord_link_state_expires": "" },
            },
            None,
        )
        .await
        .map_err(|_| "oauth")?;

    // guild join + rangok — ha itt hiba van, a link attól még él (a sweep megjavítja)
    match discord_bot::ensure_ids(state).await {
        Ok(ids) => {
            let packages = db::active_packages(&state.mongo.subscriptions, user_oid)
                .await
                .unwrap_or_default();
            let role_ids: Vec<String> = packages
                .iter()
                .filter_map(|p| ids.roles.get(p.as_str()).cloned())
                .collect();
            match discord_bot::join_guild(state, ids, &discord_id, &access_token, &role_ids).await
            {
                // már tag volt → a rangokat külön szinkronizáljuk
                Ok(true) => {
                    if let Err(e) = discord_bot::sync_user_roles(state, user_oid).await {
                        tracing::warn!("Discord rang-sync a link után: {e:#}");
                    }
                }
                Ok(false) => {}
                Err(e) => tracing::warn!("Discord guild join: {e:#}"),
            }
        }
        Err(e) => tracing::warn!("Discord ID felderítés: {e:#}"),
    }
    Ok(())
}

/// Leválasztás: a kezelt rangok lekerülnek, a user a szerveren maradhat.
async fn discord_unlink(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<Value>> {
    let user = db::find_user_by_id(&state.mongo.users, auth.user_id)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::Unauthorized)?;
    if let Some(discord_id) = user.discord_id {
        discord_bot::spawn_remove_all_roles(state.clone(), discord_id);
    }
    state
        .mongo
        .users
        .update_one(
            doc! { "_id": auth.user_id },
            doc! {
                "$unset": {
                    "discord_id": "",
                    "discord_username": "",
                    "discord_link_state_hash": "",
                    "discord_link_state_expires": "",
                },
                "$set": { "updated_at": BsonDateTime::now() },
            },
            None,
        )
        .await?;
    Ok(Json(json!({ "ok": true })))
}
