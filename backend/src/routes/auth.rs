use axum::{
    extract::{ConnectInfo, Query, State},
    http::HeaderMap,
    response::Redirect,
    routing::{get, post},
    Json, Router,
};
use mongodb::bson::{doc, DateTime as BsonDateTime};
use std::{collections::BTreeMap, collections::HashMap, net::SocketAddr, sync::Arc};

use crate::{
    error::{AppError, AppResult},
    middleware::auth::{generate_token, hash_token},
    middleware::AuthUser,
    models::{
        user::{AuthResponse, LoginRequest, PublicUser, RegisterRequest},
        Session, User,
    },
    services::{discord, email, mongo as db, telegram},
    AppState,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/auth/google", get(google_redirect))
        .route("/api/auth/google/callback", get(google_callback))
        .route("/api/auth/forgot", post(forgot_password))
        .route("/api/auth/reset", post(reset_password))
        .route("/api/auth/telegram", post(telegram_auth))
        .route("/api/auth/telegram/unlink", post(telegram_unlink))
        .route("/api/config", get(public_config))
}

pub fn get_ip(headers: &HeaderMap, addr: Option<SocketAddr>) -> String {
    if let Some(fwd) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        return fwd.split(',').next().unwrap_or("unknown").trim().to_string();
    }
    if let Some(real) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        return real.trim().to_string();
    }
    addr.map(|a| a.ip().to_string()).unwrap_or_else(|| "unknown".to_string())
}

async fn build_public_user(state: &AppState, user: &User) -> AppResult<PublicUser> {
    let packages = match user.id {
        Some(oid) => db::active_packages(&state.mongo.subscriptions, oid)
            .await
            .map_err(AppError::Internal)?,
        None => vec![],
    };
    Ok(PublicUser {
        id: user.id_string(),
        email: user.email.clone(),
        name: user.name.clone(),
        avatar_url: user.avatar_url.clone(),
        telegram_username: user.telegram_username.clone(),
        telegram_linked: user.telegram_id.is_some(),
        discord_username: user.discord_username.clone(),
        discord_linked: user.discord_id.is_some(),
        is_admin: state.config.is_admin(&user.email),
        packages,
    })
}

async fn create_session_for_user(
    state: &AppState,
    user: &User,
    headers: &HeaderMap,
    addr: Option<SocketAddr>,
) -> AppResult<String> {
    let token = generate_token();
    let oid = user.id.ok_or(AppError::Unauthorized)?;
    let now = chrono::Utc::now();
    let expires = now + chrono::Duration::days(Session::LIFETIME_DAYS);
    let session = Session {
        id: None,
        token_hash: hash_token(&token),
        user_id: oid,
        user_agent: headers
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.chars().take(200).collect()),
        ip: Some(get_ip(headers, addr)),
        created_at: BsonDateTime::from_millis(now.timestamp_millis()),
        expires_at: BsonDateTime::from_millis(expires.timestamp_millis()),
    };
    db::create_session(&state.mongo.sessions, session)
        .await
        .map_err(AppError::Internal)?;
    Ok(token)
}

async fn register(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<RegisterRequest>,
) -> AppResult<Json<AuthResponse>> {
    let ip = get_ip(&headers, Some(addr));
    if !state.check_rate_limit(&ip, 10, 600) {
        return Err(AppError::TooManyRequests);
    }

    let email_norm = req.email.trim().to_lowercase();
    if !email_norm.contains('@') || email_norm.len() < 5 {
        return Err(AppError::BadRequest("Érvénytelen email cím".into()));
    }
    if req.password.len() < 8 {
        return Err(AppError::BadRequest("A jelszó legalább 8 karakter legyen".into()));
    }
    if db::find_user_by_email(&state.mongo.users, &email_norm)
        .await
        .map_err(AppError::Internal)?
        .is_some()
    {
        return Err(AppError::BadRequest("Ez az email már regisztrálva van".into()));
    }

    let hash = bcrypt::hash(&req.password, 10).map_err(|e| AppError::Internal(e.into()))?;
    let now = BsonDateTime::now();
    let user = User {
        id: None,
        email: email_norm,
        password_hash: Some(hash),
        google_id: None,
        telegram_id: None,
        telegram_username: None,
        name: req.name.clone(),
        avatar_url: None,
        discord_id: None,
        discord_username: None,
        discord_link_state_hash: None,
        discord_link_state_expires: None,
        reset_token_hash: None,
        reset_token_expires: None,
        created_at: now,
        updated_at: now,
    };
    let created = db::create_user(&state.mongo.users, user)
        .await
        .map_err(AppError::Internal)?;

    discord::notify_signup(
        state.http.clone(),
        state.config.discord_webhook_signup.clone(),
        created.email.clone(),
        created.name.clone(),
        "email",
        ip.clone(),
        headers
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string(),
    );

    let token = create_session_for_user(&state, &created, &headers, Some(addr)).await?;
    let public = build_public_user(&state, &created).await?;
    Ok(Json(AuthResponse { token, user: public }))
}

async fn login(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<AuthResponse>> {
    let ip = get_ip(&headers, Some(addr));
    if !state.check_rate_limit(&ip, 15, 600) {
        return Err(AppError::TooManyRequests);
    }

    // SECURITY: mindig fusson bcrypt, hogy a válaszidő ne árulja el, létezik-e az email.
    const DUMMY_HASH: &str = "$2b$10$dummyhashfortimingattackPrevention0000000000000000000";

    let user_opt = db::find_user_by_email(&state.mongo.users, &req.email)
        .await
        .map_err(AppError::Internal)?;
    let hash = user_opt
        .as_ref()
        .and_then(|u| u.password_hash.as_deref())
        .unwrap_or(DUMMY_HASH);

    let valid = bcrypt::verify(&req.password, hash).unwrap_or(false);
    let user = match (valid, user_opt) {
        (true, Some(u)) => u,
        _ => return Err(AppError::BadRequest("Hibás email vagy jelszó".into())),
    };

    let token = create_session_for_user(&state, &user, &headers, Some(addr)).await?;
    let public = build_public_user(&state, &user).await?;
    Ok(Json(AuthResponse { token, user: public }))
}

async fn logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    if let Some(auth) = headers.get("Authorization").and_then(|v| v.to_str().ok()) {
        if let Some(token) = auth.strip_prefix("Bearer ") {
            db::delete_session(&state.mongo.sessions, &hash_token(token))
                .await
                .map_err(AppError::Internal)?;
        }
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn me(State(state): State<Arc<AppState>>, auth: AuthUser) -> AppResult<Json<PublicUser>> {
    let user = db::find_user_by_id(&state.mongo.users, auth.user_id)
        .await
        .map_err(AppError::Internal)?
        .ok_or(AppError::Unauthorized)?;
    Ok(Json(build_public_user(&state, &user).await?))
}

// ── Google OAuth ───────────────────────────────────────────────────────────────

async fn google_redirect(State(state): State<Arc<AppState>>) -> Redirect {
    if state.config.google_client_id.is_empty() {
        return Redirect::temporary(&format!(
            "{}/login?error=google_not_configured",
            state.config.frontend_url
        ));
    }
    let redirect_uri = format!("{}/api/auth/google/callback", state.config.backend_url);
    let params = [
        ("client_id", state.config.google_client_id.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("response_type", "code"),
        ("scope", "openid email profile"),
        ("access_type", "offline"),
        ("prompt", "select_account"),
    ];
    let qs = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    Redirect::temporary(&format!("https://accounts.google.com/o/oauth2/v2/auth?{qs}"))
}

async fn google_callback(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Redirect {
    let frontend = state.config.frontend_url.clone();
    let fail = || Redirect::temporary(&format!("{frontend}/login?error=oauth_failed"));

    let code = match params.get("code") {
        Some(c) => c.clone(),
        None => return fail(),
    };
    let redirect_uri = format!("{}/api/auth/google/callback", state.config.backend_url);

    let token_data: serde_json::Value = match state
        .http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", state.config.google_client_id.as_str()),
            ("client_secret", state.config.google_client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
    {
        Ok(r) => match r.json().await {
            Ok(d) => d,
            Err(_) => return fail(),
        },
        Err(_) => return fail(),
    };

    let access_token = match token_data["access_token"].as_str() {
        Some(t) => t.to_string(),
        None => return fail(),
    };

    let userinfo: serde_json::Value = match state
        .http
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(&access_token)
        .send()
        .await
    {
        Ok(r) => match r.json().await {
            Ok(d) => d,
            Err(_) => return fail(),
        },
        Err(_) => return fail(),
    };

    let google_id = match userinfo["sub"].as_str() {
        Some(s) => s.to_string(),
        None => return fail(),
    };
    let email = userinfo["email"].as_str().unwrap_or("").to_string();
    let name = userinfo["name"].as_str().map(|s| s.to_string());
    let avatar_url = userinfo["picture"].as_str().map(|s| s.to_string());

    let is_new = db::find_user_by_google_id(&state.mongo.users, &google_id)
        .await
        .ok()
        .flatten()
        .is_none();

    let user = match db::upsert_google_user(&state.mongo.users, google_id, email, name, avatar_url).await {
        Ok(u) => u,
        Err(_) => return fail(),
    };

    if is_new {
        discord::notify_signup(
            state.http.clone(),
            state.config.discord_webhook_signup.clone(),
            user.email.clone(),
            user.name.clone(),
            "google",
            get_ip(&headers, Some(addr)),
            headers
                .get("user-agent")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string(),
        );
    }

    let token = match create_session_for_user(&state, &user, &headers, Some(addr)).await {
        Ok(t) => t,
        Err(_) => return fail(),
    };

    Redirect::temporary(&format!("{frontend}/auth/callback?token={token}"))
}

// ── Jelszó visszaállítás ───────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct ForgotRequest {
    email: String,
}

async fn forgot_password(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<ForgotRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let ip = get_ip(&headers, Some(addr));
    if !state.check_rate_limit(&ip, 5, 600) {
        return Err(AppError::TooManyRequests);
    }

    // Mindig ugyanazt válaszoljuk, hogy ne lehessen email címeket ellenőrizni.
    let ok = Json(serde_json::json!({
        "ok": true,
        "message": "Ha létezik a fiók, elküldtük az emailt."
    }));

    let user = match db::find_user_by_email(&state.mongo.users, &req.email)
        .await
        .map_err(AppError::Internal)?
    {
        Some(u) => u,
        None => return Ok(ok),
    };

    let token = generate_token();
    let expires = chrono::Utc::now() + chrono::Duration::hours(1);
    state
        .mongo
        .users
        .update_one(
            doc! { "_id": user.id },
            doc! { "$set": {
                "reset_token_hash": hash_token(&token),
                "reset_token_expires": BsonDateTime::from_millis(expires.timestamp_millis()),
                "updated_at": BsonDateTime::now(),
            }},
            None,
        )
        .await?;

    if let Err(e) = email::send_password_reset(&state.config, &user.email, &token).await {
        tracing::error!("reset email küldés sikertelen: {e:#}");
    }
    Ok(ok)
}

#[derive(serde::Deserialize)]
struct ResetRequest {
    token: String,
    password: String,
}

async fn reset_password(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ResetRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if req.password.len() < 8 {
        return Err(AppError::BadRequest("A jelszó legalább 8 karakter legyen".into()));
    }
    let token_hash = hash_token(&req.token);
    let user = state
        .mongo
        .users
        .find_one(
            doc! {
                "reset_token_hash": &token_hash,
                "reset_token_expires": { "$gt": BsonDateTime::now() }
            },
            None,
        )
        .await?
        .ok_or_else(|| AppError::BadRequest("Érvénytelen vagy lejárt link. Kérj újat!".into()))?;

    let hash = bcrypt::hash(&req.password, 10).map_err(|e| AppError::Internal(e.into()))?;
    state
        .mongo
        .users
        .update_one(
            doc! { "_id": user.id },
            doc! {
                "$set": { "password_hash": hash, "updated_at": BsonDateTime::now() },
                "$unset": { "reset_token_hash": "", "reset_token_expires": "" }
            },
            None,
        )
        .await?;

    // biztonsági okból minden meglévő session törlése
    if let Some(oid) = user.id {
        let _ = db::delete_user_sessions(&state.mongo.sessions, oid).await;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Telegram login / linkelés ──────────────────────────────────────────────────

/// A Telegram Login Widget mezői + opcionálisan a bejelentkezett user tokenje (linkeléshez).
async fn telegram_auth(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    auth: Option<AuthUser>,
    Json(fields): Json<BTreeMap<String, serde_json::Value>>,
) -> AppResult<Json<AuthResponse>> {
    if state.config.telegram_bot_token.is_empty() {
        return Err(AppError::BadRequest(
            "Telegram bejelentkezés nincs beállítva (TELEGRAM_BOT_TOKEN hiányzik)".into(),
        ));
    }

    // A widget számokat és stringeket is küld — stringgé alakítjuk az ellenőrzéshez.
    let str_fields: BTreeMap<String, String> = fields
        .iter()
        .map(|(k, v)| {
            let s = match v {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            (k.clone(), s)
        })
        .collect();

    if !telegram::verify_telegram_auth(&state.config.telegram_bot_token, &str_fields) {
        return Err(AppError::BadRequest("Érvénytelen Telegram aláírás".into()));
    }

    let telegram_id = str_fields
        .get("id")
        .and_then(|s| s.parse::<i64>().ok())
        .ok_or_else(|| AppError::BadRequest("Hiányzó Telegram ID".into()))?;
    let tg_username = str_fields.get("username").cloned();
    let tg_name = str_fields.get("first_name").cloned();
    let tg_photo = str_fields.get("photo_url").cloned();

    let user = if let Some(auth_user) = auth {
        // Bejelentkezett user → Telegram fiók hozzákapcsolása
        state
            .mongo
            .users
            .update_one(
                doc! { "_id": auth_user.user_id },
                doc! { "$set": {
                    "telegram_id": telegram_id,
                    "telegram_username": &tg_username,
                    "updated_at": BsonDateTime::now(),
                }},
                None,
            )
            .await?;
        db::find_user_by_id(&state.mongo.users, auth_user.user_id)
            .await
            .map_err(AppError::Internal)?
            .ok_or(AppError::Unauthorized)?
    } else {
        // Login Telegrammal: meglévő összekapcsolt fiók, vagy új fiók
        match db::find_user_by_telegram_id(&state.mongo.users, telegram_id)
            .await
            .map_err(AppError::Internal)?
        {
            Some(u) => u,
            None => {
                let now = BsonDateTime::now();
                let placeholder_email = format!("tg_{telegram_id}@telegram.melostippek.hu");
                let user = User {
                    id: None,
                    email: placeholder_email,
                    password_hash: None,
                    google_id: None,
                    telegram_id: Some(telegram_id),
                    telegram_username: tg_username.clone(),
                    name: tg_name,
                    avatar_url: tg_photo,
                    discord_id: None,
                    discord_username: None,
                    discord_link_state_hash: None,
                    discord_link_state_expires: None,
                    reset_token_hash: None,
                    reset_token_expires: None,
                    created_at: now,
                    updated_at: now,
                };
                let created = db::create_user(&state.mongo.users, user)
                    .await
                    .map_err(AppError::Internal)?;
                discord::notify_signup(
                    state.http.clone(),
                    state.config.discord_webhook_signup.clone(),
                    created.email.clone(),
                    created.name.clone(),
                    "telegram",
                    get_ip(&headers, Some(addr)),
                    headers
                        .get("user-agent")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("")
                        .to_string(),
                );
                created
            }
        }
    };

    let token = create_session_for_user(&state, &user, &headers, Some(addr)).await?;
    let public = build_public_user(&state, &user).await?;
    Ok(Json(AuthResponse { token, user: public }))
}

async fn telegram_unlink(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    state
        .mongo
        .users
        .update_one(
            doc! { "_id": auth.user_id },
            doc! {
                "$unset": { "telegram_id": "", "telegram_username": "" },
                "$set": { "updated_at": BsonDateTime::now() }
            },
            None,
        )
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Publikus konfiguráció a frontendnek (NEM tartalmaz kulcsokat).
async fn public_config(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "telegram_group_url": state.config.telegram_group_url,
        "telegram_bot_username": state.config.telegram_bot_username,
        "google_login_enabled": !state.config.google_client_id.is_empty(),
        "simplepay_enabled": !state.config.simplepay_merchant.is_empty(),
        "test_payment_enabled": state.config.allow_test_payment,
        "discord_enabled": state.config.discord_enabled(),
        "discord_invite_url": state.config.discord_invite_url,
    }))
}
