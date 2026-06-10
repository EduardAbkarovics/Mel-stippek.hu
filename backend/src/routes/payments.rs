use axum::{
    body::Bytes,
    extract::{Query, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    middleware::AuthUser,
    models::subscription::PACKAGES,
    services::{mongo as db, stripe},
    AppState,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/payments/checkout", post(create_checkout))
        .route("/api/payments/test-checkout", post(test_checkout))
        .route("/api/payments/test", post(test_payment))
        .route("/api/payments/confirm", get(confirm_payment))
        .route("/api/webhooks/stripe", post(stripe_webhook))
}

#[derive(serde::Deserialize)]
struct CheckoutRequest {
    package: String,
}

/// Stripe előfizetéses checkout indítása — visszaadja a fizetési URL-t.
async fn create_checkout(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(req): Json<CheckoutRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !PACKAGES.contains(&req.package.as_str()) {
        return Err(AppError::BadRequest("Ismeretlen csomag".into()));
    }

    let url = stripe::create_subscription_checkout(
        &state.http,
        &state.config,
        &req.package,
        &auth.user_id.to_hex(),
        &auth.email,
    )
    .await
    .map_err(AppError::Internal)?;

    Ok(Json(serde_json::json!({ "url": url })))
}

/// 1 USD-s teszt Stripe checkout — CSAK ha ALLOW_TEST_PAYMENT=true és a user engedélyezett.
/// A sikeres fizetés a kiválasztott csomagot 30 napra aktiválja.
async fn test_checkout(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(req): Json<CheckoutRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !state.config.allow_test_payment || !state.config.can_use_test_payment(&auth.email) {
        return Err(AppError::Forbidden);
    }
    if !PACKAGES.contains(&req.package.as_str()) {
        return Err(AppError::BadRequest("Ismeretlen csomag".into()));
    }

    let url = stripe::create_test_checkout(
        &state.http,
        &state.config,
        &req.package,
        &auth.user_id.to_hex(),
        &auth.email,
    )
    .await
    .map_err(AppError::Internal)?;

    tracing::info!("TESZT checkout ($1) létrehozva: user={} csomag={}", auth.email, req.package);
    Ok(Json(serde_json::json!({ "url": url })))
}

#[derive(serde::Deserialize)]
struct TestPaymentRequest {
    package: String,
    /// jelenleg csak "expire" — azonnali lejáratás (a lejárt user élmény tesztelésére)
    action: String,
}

/// Teszt segéd: előfizetés azonnali lejáratása (annak tesztelésére, hogy a lejárt
/// user tényleg nem látja a tartalmat). Aktiváláshoz a teszt fizetést kell használni.
async fn test_payment(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(req): Json<TestPaymentRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !state.config.allow_test_payment || !state.config.can_use_test_payment(&auth.email) {
        return Err(AppError::Forbidden);
    }
    if !PACKAGES.contains(&req.package.as_str()) {
        return Err(AppError::BadRequest("Ismeretlen csomag".into()));
    }

    match req.action.as_str() {
        "expire" => {
            let found =
                db::expire_subscription(&state.mongo.subscriptions, auth.user_id, &req.package)
                    .await
                    .map_err(AppError::Internal)?;
            if !found {
                return Err(AppError::BadRequest(
                    "Ehhez a csomaghoz nincs előfizetésed".into(),
                ));
            }
            tracing::info!("TESZT előfizetés lejáratva: user={} csomag={}", auth.email, req.package);
            Ok(Json(serde_json::json!({ "ok": true, "status": "expired" })))
        }
        _ => Err(AppError::BadRequest(
            "Aktiváláshoz használd a teszt fizetést ($1)".into(),
        )),
    }
}

#[derive(serde::Deserialize)]
struct ConfirmQuery {
    session_id: String,
}

/// Fizetés megerősítése a frontendről (a Stripe-tól visszatérés után) — webhook nélkül,
/// pl. localhoston is aktiválja az előfizetést, ha a session ki van fizetve.
async fn confirm_payment(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Query(q): Query<ConfirmQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let session = stripe::get_checkout_session(&state.http, &state.config, &q.session_id)
        .await
        .map_err(AppError::Internal)?;

    // csak a saját session-jét erősítheti meg
    let client_ref = session["client_reference_id"].as_str().unwrap_or("");
    if client_ref != auth.user_id.to_hex() {
        return Err(AppError::Forbidden);
    }

    if session["payment_status"].as_str() != Some("paid") {
        return Ok(Json(serde_json::json!({ "ok": false, "status": "pending" })));
    }

    fulfill_session(&state, &session).await?;
    Ok(Json(serde_json::json!({ "ok": true, "status": "active" })))
}

/// Stripe webhook: előfizetés aktiválás / megújítás / lemondás kezelése.
async fn stripe_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> AppResult<Json<serde_json::Value>> {
    let sig = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !state.config.stripe_webhook_secret.is_empty() {
        if !stripe::verify_webhook_signature(&body, sig, &state.config.stripe_webhook_secret) {
            tracing::warn!("Stripe webhook: érvénytelen aláírás");
            return Err(AppError::Forbidden);
        }
    } else {
        tracing::warn!("Stripe webhook: STRIPE_WEBHOOK_SECRET nincs beállítva, aláírás NEM ellenőrizve");
    }

    let event: serde_json::Value =
        serde_json::from_slice(&body).map_err(|_| AppError::BadRequest("Hibás JSON".into()))?;

    let event_type = event["type"].as_str().unwrap_or("");
    tracing::info!("Stripe webhook esemény: {event_type}");

    match event_type {
        // első fizetés / teszt fizetés sikeres
        "checkout.session.completed" => {
            fulfill_session(&state, &event["data"]["object"]).await?;
        }
        // havi megújulás sikeres → előfizetés meghosszabbítása
        "invoice.paid" | "invoice.payment_succeeded" => {
            let sub_id = event["data"]["object"]["subscription"].as_str().unwrap_or("");
            if !sub_id.is_empty() {
                let expires =
                    (chrono::Utc::now() + chrono::Duration::days(31)).timestamp_millis();
                db::renew_subscription_by_stripe_id(
                    &state.mongo.subscriptions,
                    sub_id,
                    BsonDateTime::from_millis(expires),
                )
                .await
                .map_err(AppError::Internal)?;
                tracing::info!("Előfizetés megújítva: stripe_sub={sub_id}");
            }
        }
        // lemondás / sikertelen fizetés → deaktiválás
        "customer.subscription.deleted" | "customer.subscription.updated" => {
            let sub = &event["data"]["object"];
            let sub_id = sub["id"].as_str().unwrap_or("");
            let status = sub["status"].as_str().unwrap_or("");
            if event_type.ends_with("deleted")
                || matches!(status, "canceled" | "unpaid" | "incomplete_expired")
            {
                if !sub_id.is_empty() {
                    db::deactivate_subscription_by_stripe_id(&state.mongo.subscriptions, sub_id)
                        .await
                        .map_err(AppError::Internal)?;
                    tracing::info!("Előfizetés deaktiválva: stripe_sub={sub_id}");
                }
            }
        }
        _ => {
            tracing::info!("Stripe webhook: nem kezelt esemény: {event_type}");
        }
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Egy kifizetett checkout session feldolgozása: a metaadatból kiolvassa a usert és a csomagot,
/// majd aktiválja az előfizetést. Egyszeri (teszt) fizetésnél 30 nap, előfizetésnél 31 nap
/// (a megújulást az invoice.paid hosszabbítja).
async fn fulfill_session(state: &AppState, session: &serde_json::Value) -> AppResult<()> {
    let package = session["metadata"]["package"].as_str().unwrap_or("");
    if !PACKAGES.contains(&package) {
        tracing::warn!("Stripe fulfill: ismeretlen csomag a metaadatban: '{package}'");
        return Ok(());
    }

    let user_id = session["metadata"]["user_id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .or_else(|| session["client_reference_id"].as_str())
        .unwrap_or("");
    let user_oid = match ObjectId::parse_str(user_id) {
        Ok(oid) => oid,
        Err(_) => {
            tracing::warn!("Stripe fulfill: érvénytelen user_id: '{user_id}'");
            return Ok(());
        }
    };

    let stripe_sub_id = session["subscription"].as_str().map(|s| s.to_string());
    let is_test = session["metadata"]["test_payment"].as_str() == Some("true");
    let days = if is_test { 30 } else { 31 };
    let expires = (chrono::Utc::now() + chrono::Duration::days(days)).timestamp_millis();

    db::upsert_subscription(
        &state.mongo.subscriptions,
        user_oid,
        package,
        stripe_sub_id,
        BsonDateTime::from_millis(expires),
    )
    .await
    .map_err(AppError::Internal)?;

    tracing::info!(
        "Előfizetés aktiválva: user={user_oid} csomag={package} (teszt={is_test})"
    );
    Ok(())
}
