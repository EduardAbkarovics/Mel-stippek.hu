use axum::{
    body::Bytes,
    extract::State,
    http::HeaderMap,
    routing::post,
    Json, Router,
};
use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use std::sync::Arc;

use crate::{
    error::{AppError, AppResult},
    middleware::AuthUser,
    models::subscription::PACKAGES,
    services::{mongo as db, whop},
    AppState,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/payments/checkout", post(create_checkout))
        .route("/api/payments/test", post(test_payment))
        .route("/api/webhooks/whop", post(whop_webhook))
}

#[derive(serde::Deserialize)]
struct TestPaymentRequest {
    package: String,
    /// "activate" = 30 napos teszt előfizetés | "expire" = azonnali lejáratás
    action: String,
}

/// Teszt fizetés Whop nélkül — CSAK ha ALLOW_TEST_PAYMENT=true (élesben kapcsold ki!).
/// Aktiválással a teljes előfizetői folyamat tesztelhető, lejáratással pedig az,
/// hogy a lejárt user tényleg nem látja a tartalmat.
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
        "activate" => {
            let expires =
                (chrono::Utc::now() + chrono::Duration::days(30)).timestamp_millis();
            db::upsert_subscription(
                &state.mongo.subscriptions,
                auth.user_id,
                &req.package,
                Some(format!("test_{}_{}", auth.user_id.to_hex(), req.package)),
                None,
                BsonDateTime::from_millis(expires),
            )
            .await
            .map_err(AppError::Internal)?;
            tracing::info!("TESZT előfizetés aktiválva: user={} csomag={}", auth.email, req.package);
            Ok(Json(serde_json::json!({ "ok": true, "status": "active" })))
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
            Ok(Json(serde_json::json!({ "ok": true, "status": "expired" })))
        }
        _ => Err(AppError::BadRequest("Ismeretlen művelet".into())),
    }
}

#[derive(serde::Deserialize)]
struct CheckoutRequest {
    package: String,
}

/// Whop checkout indítása — visszaadja a fizetési URL-t.
async fn create_checkout(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(req): Json<CheckoutRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !PACKAGES.contains(&req.package.as_str()) {
        return Err(AppError::BadRequest("Ismeretlen csomag".into()));
    }
    let plan_id = whop::plan_id_for_package(&state.config, &req.package).ok_or_else(|| {
        AppError::BadRequest(format!(
            "A(z) {} csomag Whop plan ID-je nincs beállítva a szerveren",
            req.package
        ))
    })?;

    let url = whop::create_checkout(
        &state.http,
        &state.config,
        &plan_id,
        &auth.user_id.to_hex(),
        &req.package,
    )
    .await
    .map_err(AppError::Internal)?;

    Ok(Json(serde_json::json!({ "url": url })))
}

/// Whop webhook: előfizetés aktiválás / megújítás / lemondás kezelése.
/// Az aláírást ellenőrizzük (webhook-id, webhook-timestamp, webhook-signature headerek).
async fn whop_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> AppResult<Json<serde_json::Value>> {
    // Aláírás ellenőrzés, ha van secret beállítva
    if !state.config.whop_webhook_secret.is_empty() {
        let id = headers.get("webhook-id").and_then(|v| v.to_str().ok()).unwrap_or("");
        let ts = headers
            .get("webhook-timestamp")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let sig = headers
            .get("webhook-signature")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !whop::verify_webhook_signature(&state.config.whop_webhook_secret, id, ts, &body, sig) {
            tracing::warn!("Whop webhook: érvénytelen aláírás");
            return Err(AppError::Forbidden);
        }
    } else {
        tracing::warn!("Whop webhook: WHOP_WEBHOOK_SECRET nincs beállítva, aláírás NEM ellenőrizve");
    }

    let payload: serde_json::Value =
        serde_json::from_slice(&body).map_err(|_| AppError::BadRequest("Hibás JSON".into()))?;

    let event_type = payload["type"]
        .as_str()
        .or_else(|| payload["action"].as_str())
        .unwrap_or("");
    let data = &payload["data"];

    tracing::info!("Whop webhook esemény: {event_type}");

    match event_type {
        // membership érvényes lett (első fizetés vagy megújítás)
        "membership.activated" | "membership.went_valid" | "membership_went_valid" => {
            handle_membership_valid(&state, data).await?;
        }
        "payment.succeeded" | "payment_succeeded" => {
            // a payment objektumban benne lehet a membership — ha igen, frissítjük
            if data["membership"].is_object() {
                handle_membership_valid(&state, &data["membership"]).await?;
            } else if data["metadata"]["user_id"].is_string() {
                handle_membership_valid(&state, data).await?;
            }
        }
        // membership érvénytelen lett (lemondás, sikertelen fizetés)
        "membership.deactivated" | "membership.went_invalid" | "membership_went_invalid" => {
            let membership_id = data["id"].as_str().unwrap_or("");
            if !membership_id.is_empty() {
                db::deactivate_subscription_by_membership(&state.mongo.subscriptions, membership_id)
                    .await
                    .map_err(AppError::Internal)?;
                tracing::info!("Előfizetés deaktiválva: membership={membership_id}");
            }
        }
        _ => {
            tracing::info!("Whop webhook: nem kezelt esemény: {event_type}");
        }
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Membership adatból előfizetés aktiválás: user a metadata.user_id-ból (vagy email alapján),
/// csomag a plan ID-ból (vagy metadata.package-ből), lejárat a renewal_period_end-ből (vagy +30 nap).
async fn handle_membership_valid(state: &AppState, data: &serde_json::Value) -> AppResult<()> {
    let membership_id = data["id"].as_str().map(|s| s.to_string());

    let plan_id = data["plan_id"]
        .as_str()
        .or_else(|| data["plan"]["id"].as_str())
        .or_else(|| data["plan"].as_str())
        .unwrap_or("")
        .to_string();

    // csomag meghatározása: plan ID-ból, vagy metadata.package-ből
    let package = whop::package_for_plan_id(&state.config, &plan_id)
        .map(|s| s.to_string())
        .or_else(|| data["metadata"]["package"].as_str().map(|s| s.to_string()));
    let package = match package {
        Some(p) if PACKAGES.contains(&p.as_str()) => p,
        _ => {
            tracing::warn!("Whop webhook: ismeretlen plan/csomag: {plan_id}");
            return Ok(());
        }
    };

    // user meghatározása: metadata.user_id, vagy email alapján
    let user_oid = if let Some(uid) = data["metadata"]["user_id"].as_str() {
        ObjectId::parse_str(uid).ok()
    } else {
        None
    };
    let user_oid = match user_oid {
        Some(oid) => Some(oid),
        None => {
            let email = data["user"]["email"]
                .as_str()
                .or_else(|| data["user_email"].as_str())
                .unwrap_or("");
            if email.is_empty() {
                None
            } else {
                db::find_user_by_email(&state.mongo.users, email)
                    .await
                    .map_err(AppError::Internal)?
                    .and_then(|u| u.id)
            }
        }
    };
    let user_oid = match user_oid {
        Some(oid) => oid,
        None => {
            tracing::warn!("Whop webhook: nem azonosítható a user (nincs metadata.user_id / email)");
            return Ok(());
        }
    };

    // lejárat: renewal_period_end / expires_at, különben most + 30 nap
    let expires_at = data["renewal_period_end"]
        .as_str()
        .or_else(|| data["expires_at"].as_str())
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.timestamp_millis())
        .or_else(|| {
            // unix másodperc formátum
            data["renewal_period_end"]
                .as_i64()
                .or_else(|| data["expires_at"].as_i64())
                .map(|s| s * 1000)
        })
        .unwrap_or_else(|| (chrono::Utc::now() + chrono::Duration::days(30)).timestamp_millis());

    db::upsert_subscription(
        &state.mongo.subscriptions,
        user_oid,
        &package,
        membership_id,
        if plan_id.is_empty() { None } else { Some(plan_id) },
        BsonDateTime::from_millis(expires_at),
    )
    .await
    .map_err(AppError::Internal)?;

    tracing::info!("Előfizetés aktiválva: user={user_oid} csomag={package}");
    Ok(())
}
