use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde_json::json;
use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    middleware::AuthUser,
    models::subscription::PACKAGES,
    services::{discord, discord_bot, mongo as db, stripe},
    AppState,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/payments/checkout", post(create_checkout))
        .route("/api/payments/confirm", get(confirm_payment))
        .route("/api/payments/webhook", post(stripe_webhook))
        .route("/api/payments/cancel", post(cancel_subscription))
        .route("/api/payments/portal", post(billing_portal))
        .route("/api/payments/test", post(test_payment))
}

#[derive(serde::Deserialize)]
struct PackageRequest {
    package: String,
}

/// Stripe Checkout (havi megújuló, HUF) — visszaadja a fizetési oldal URL-jét.
async fn create_checkout(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(req): Json<PackageRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !PACKAGES.contains(&req.package.as_str()) {
        return Err(AppError::BadRequest("Ismeretlen csomag".into()));
    }
    if state.config.stripe_secret_key.is_empty() {
        return Err(AppError::BadRequest("A fizetés jelenleg nem elérhető".into()));
    }

    let url = stripe::create_subscription_checkout(
        &state.http,
        &state.config,
        &req.package,
        &auth.email,
        &auth.user_id.to_hex(),
    )
    .await
    .map_err(AppError::Internal)?;

    tracing::info!("Stripe checkout indítva: user={} csomag={}", auth.email, req.package);
    Ok(Json(json!({ "url": url })))
}

/// A session-ből kinyeri a subscription idejét, és aktiválja az előfizetést.
/// A lejáratot a Stripe periódus végéhez igazítjuk (tartalék: most + 31 nap).
async fn activate_from_session(
    state: &Arc<AppState>,
    session: &serde_json::Value,
) -> anyhow::Result<Option<(ObjectId, String)>> {
    if session["payment_status"].as_str() != Some("paid") {
        return Ok(None);
    }
    let Some(user_oid) = session["client_reference_id"]
        .as_str()
        .and_then(|s| ObjectId::parse_str(s).ok())
    else {
        return Ok(None);
    };
    let package = session["metadata"]["package"].as_str().unwrap_or("");
    if !PACKAGES.contains(&package) {
        return Ok(None);
    }

    let customer_id = session["customer"].as_str().unwrap_or("");
    let subscription_id = session["subscription"].as_str().unwrap_or("");
    let is_test = session["metadata"]["test_payment"].as_str() == Some("true");

    // teszt fizetés (200 Ft): 1 nap; éles előfizetés: periódus vége a Stripe-tól (tartalék +31 nap)
    let mut expires_ms = if is_test {
        (chrono::Utc::now() + chrono::Duration::days(1)).timestamp_millis()
    } else {
        (chrono::Utc::now() + chrono::Duration::days(31)).timestamp_millis()
    };
    if !is_test && !subscription_id.is_empty() {
        if let Ok(sub) = stripe::get_subscription(&state.http, &state.config, subscription_id).await
        {
            if let Some(end) = sub["current_period_end"].as_i64() {
                expires_ms = end * 1000;
            }
        }
    }

    db::activate_stripe_subscription(
        &state.mongo.subscriptions,
        user_oid,
        package,
        customer_id,
        subscription_id,
        BsonDateTime::from_millis(expires_ms),
    )
    .await?;

    discord_bot::spawn_sync(state.clone(), user_oid);
    Ok(Some((user_oid, package.to_string())))
}

#[derive(serde::Deserialize)]
struct ConfirmQuery {
    session_id: String,
}

/// A Stripe-ról visszatérés megerősítése (?session_id=…). A webhooktól függetlenül
/// is aktivál — idempotens, így a kettő együtt sem okoz gondot.
async fn confirm_payment(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Query(q): Query<ConfirmQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let session = stripe::get_checkout_session(&state.http, &state.config, &q.session_id)
        .await
        .map_err(AppError::Internal)?;

    // csak a saját fizetését erősítheti meg
    if session["client_reference_id"].as_str() != Some(auth.user_id.to_hex().as_str()) {
        return Err(AppError::Forbidden);
    }

    match activate_from_session(&state, &session)
        .await
        .map_err(AppError::Internal)?
    {
        Some((user_oid, package)) => {
            tracing::info!("Előfizetés aktiválva (confirm): user={user_oid} csomag={package}");
            Ok(Json(json!({ "ok": true, "status": "active", "package": package })))
        }
        None => Ok(Json(json!({ "ok": false, "status": "pending" }))),
    }
}

/// Stripe webhook (aláírás-ellenőrzéssel). Innen jön az aktiválás, a havi
/// megújítás és a megszűnés — plusz a Discord fizetési értesítő a számlázáshoz.
async fn stripe_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, AppError> {
    let sig = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !stripe::verify_signature(&body, sig, &state.config.stripe_webhook_secret) {
        tracing::warn!("Stripe webhook: érvénytelen aláírás");
        return Err(AppError::Forbidden);
    }

    let event: serde_json::Value =
        serde_json::from_slice(&body).map_err(|e| AppError::BadRequest(e.to_string()))?;
    let event_type = event["type"].as_str().unwrap_or("");
    tracing::info!("Stripe webhook: {event_type}");

    match event_type {
        "checkout.session.completed" => {
            let session = &event["data"]["object"];
            if let Some((user_oid, package)) = activate_from_session(&state, session)
                .await
                .map_err(AppError::Internal)?
            {
                tracing::info!("Előfizetés aktiválva (webhook): user={user_oid} csomag={package}");

                // Discord értesítő a számlázáshoz — a Stripe-os számlázási adatokkal
                let details = &session["customer_details"];
                let label = stripe::package_info(&package).map(|(n, _)| n).unwrap_or("?");
                let label = if session["metadata"]["test_payment"].as_str() == Some("true") {
                    format!("⚠️ TESZT — {label} (200 Ft / 1 nap)")
                } else {
                    label.to_string()
                };
                discord::notify_payment(
                    state.http.clone(),
                    state.config.discord_webhook_payment.clone(),
                    discord::PaymentNotice {
                        kind: "first",
                        email: details["email"].as_str().unwrap_or("?").to_string(),
                        name: details["name"].as_str().map(|s| s.to_string()),
                        address: format_address(&details["address"]),
                        package_label: label,
                        amount_huf: session["amount_total"].as_u64().unwrap_or(0) / 100,
                        paid_at_utc: chrono::Utc::now(),
                        stripe_id: session["id"].as_str().unwrap_or("?").to_string(),
                    },
                );
            }
        }
        "invoice.paid" => {
            let invoice = &event["data"]["object"];
            // az első (subscription_create) számlát a checkout.session.completed kezeli
            if invoice["billing_reason"].as_str() != Some("subscription_cycle") {
                return Ok(StatusCode::OK);
            }
            let sub_id = invoice["subscription"].as_str().unwrap_or("");
            if sub_id.is_empty() {
                return Ok(StatusCode::OK);
            }

            // új periódus vége a számla soraiból
            let period_end = invoice["lines"]["data"][0]["period"]["end"]
                .as_i64()
                .map(|s| s * 1000)
                .unwrap_or_else(|| {
                    (chrono::Utc::now() + chrono::Duration::days(31)).timestamp_millis()
                });

            let renewed = db::renew_stripe_subscription(
                &state.mongo.subscriptions,
                sub_id,
                BsonDateTime::from_millis(period_end),
            )
            .await
            .map_err(AppError::Internal)?;

            if renewed {
                tracing::info!("Előfizetés megújítva (invoice.paid): {sub_id}");
                if let Ok(Some(sub)) =
                    db::find_subscription_by_stripe_sub(&state.mongo.subscriptions, sub_id).await
                {
                    discord_bot::spawn_sync(state.clone(), sub.user_id);
                    let label = stripe::package_info(&sub.package).map(|(n, _)| n).unwrap_or("?");
                    discord::notify_payment(
                        state.http.clone(),
                        state.config.discord_webhook_payment.clone(),
                        discord::PaymentNotice {
                            kind: "renewal",
                            email: invoice["customer_email"].as_str().unwrap_or("?").to_string(),
                            name: invoice["customer_name"].as_str().map(|s| s.to_string()),
                            address: format_address(&invoice["customer_address"]),
                            package_label: label.to_string(),
                            amount_huf: invoice["amount_paid"].as_u64().unwrap_or(0) / 100,
                            paid_at_utc: chrono::Utc::now(),
                            stripe_id: invoice["id"].as_str().unwrap_or("?").to_string(),
                        },
                    );
                }
            }
        }
        "customer.subscription.deleted" => {
            let sub_id = event["data"]["object"]["id"].as_str().unwrap_or("");
            if let Ok(Some(sub)) =
                db::cancel_stripe_subscription(&state.mongo.subscriptions, sub_id).await
            {
                tracing::info!("Előfizetés megszűnt (subscription.deleted): {sub_id}");
                discord_bot::spawn_sync(state.clone(), sub.user_id);
                let email = db::find_user_by_id(&state.mongo.users, sub.user_id)
                    .await
                    .ok()
                    .flatten()
                    .map(|u| u.email)
                    .unwrap_or_else(|| "?".into());
                let label = stripe::package_info(&sub.package).map(|(n, _)| n).unwrap_or("?");
                discord::notify_payment(
                    state.http.clone(),
                    state.config.discord_webhook_payment.clone(),
                    discord::PaymentNotice {
                        kind: "cancelled",
                        email,
                        name: None,
                        address: None,
                        package_label: label.to_string(),
                        amount_huf: 0,
                        paid_at_utc: chrono::Utc::now(),
                        stripe_id: sub_id.to_string(),
                    },
                );
            }
        }
        _ => {}
    }

    Ok(StatusCode::OK)
}

/// Stripe cím objektum → egysoros magyar formátum (számlázáshoz).
fn format_address(addr: &serde_json::Value) -> Option<String> {
    let line1 = addr["line1"].as_str()?;
    let mut parts = vec![];
    if let Some(p) = addr["postal_code"].as_str() {
        parts.push(p.to_string());
    }
    if let Some(c) = addr["city"].as_str() {
        parts.push(c.to_string());
    }
    parts.push(line1.to_string());
    if let Some(l2) = addr["line2"].as_str() {
        if !l2.is_empty() {
            parts.push(l2.to_string());
        }
    }
    if let Some(c) = addr["country"].as_str() {
        parts.push(format!("({c})"));
    }
    Some(parts.join(", "))
}

/// Lemondás: a Stripe-nál a periódus végén szűnik meg, addig a hozzáférés él.
async fn cancel_subscription(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(req): Json<PackageRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !PACKAGES.contains(&req.package.as_str()) {
        return Err(AppError::BadRequest("Ismeretlen csomag".into()));
    }

    let subs = db::user_subscriptions(&state.mongo.subscriptions, auth.user_id)
        .await
        .map_err(AppError::Internal)?;
    let Some(sub) = subs.iter().find(|s| s.package == req.package) else {
        return Err(AppError::BadRequest("Ehhez a csomaghoz nincs előfizetésed".into()));
    };

    // Stripe oldali lemondás (ha Stripe-os az előfizetés)
    if let Some(stripe_sub) = &sub.stripe_subscription_id {
        if !stripe_sub.is_empty() {
            stripe::cancel_at_period_end(&state.http, &state.config, stripe_sub)
                .await
                .map_err(AppError::Internal)?;
        }
    }
    db::set_auto_renew(&state.mongo.subscriptions, auth.user_id, &req.package, false)
        .await
        .map_err(AppError::Internal)?;

    tracing::info!("Megújítás lemondva: user={} csomag={}", auth.email, req.package);
    Ok(Json(json!({ "ok": true })))
}

/// Stripe ügyfélportál: számlák letöltése, kártya csere, lemondás kezelése.
async fn billing_portal(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let subs = db::user_subscriptions(&state.mongo.subscriptions, auth.user_id)
        .await
        .map_err(AppError::Internal)?;
    let Some(customer_id) = subs
        .iter()
        .filter_map(|s| s.stripe_customer_id.clone())
        .find(|c| !c.is_empty())
    else {
        return Err(AppError::BadRequest("Nincs Stripe-os előfizetésed".into()));
    };

    let url = stripe::billing_portal_url(&state.http, &state.config, &customer_id)
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(json!({ "url": url })))
}

#[derive(serde::Deserialize)]
struct TestPaymentRequest {
    package: String,
    /// jelenleg csak "expire" — azonnali lejáratás (a lejárt user élmény tesztelésére)
    action: String,
}

/// Teszt segéd: előfizetés azonnali lejáratása. Csak ALLOW_TEST_PAYMENT=true és engedélyezett user.
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
        // legolcsóbb ÉLES teszt: 200 Ft egyszeri fizetés → 1 nap hozzáférés
        "cheap" => {
            let url = stripe::create_test_checkout(
                &state.http,
                &state.config,
                &req.package,
                &auth.email,
                &auth.user_id.to_hex(),
            )
            .await
            .map_err(AppError::Internal)?;
            tracing::info!("TESZT 200 Ft checkout: user={} csomag={}", auth.email, req.package);
            Ok(Json(json!({ "ok": true, "url": url })))
        }
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
            discord_bot::spawn_sync(state.clone(), auth.user_id);
            Ok(Json(json!({ "ok": true, "status": "expired" })))
        }
        _ => Err(AppError::BadRequest(
            "Aktiváláshoz használd a fizetést (Előfizetek gomb)".into(),
        )),
    }
}
