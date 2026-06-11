use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
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
    services::{mongo as db, simplepay},
    AppState,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/payments/checkout", post(create_checkout))
        .route("/api/payments/confirm", get(confirm_payment))
        .route("/api/payments/ipn", post(simplepay_ipn))
        .route("/api/payments/cancel", post(cancel_subscription))
        .route("/api/payments/test", post(test_payment))
}

/// orderRef = "{userHex}-{package}-{epochMs}". Így az IPN/back önmagában azonosítja a usert+csomagot.
fn make_order_ref(user_hex: &str, package: &str) -> String {
    format!("{}-{}-{}", user_hex, package, chrono::Utc::now().timestamp_millis())
}

fn parse_order_ref(order_ref: &str) -> Option<(ObjectId, String)> {
    let mut parts = order_ref.splitn(3, '-');
    let user = parts.next()?;
    let package = parts.next()?;
    parts.next()?; // timestamp
    let oid = ObjectId::parse_str(user).ok()?;
    if !PACKAGES.contains(&package) {
        return None;
    }
    Some((oid, package.to_string()))
}

#[derive(serde::Deserialize)]
struct PackageRequest {
    package: String,
}

/// SimplePay recurring checkout indítása — visszaadja a fizetési URL-t.
async fn create_checkout(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(req): Json<PackageRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !PACKAGES.contains(&req.package.as_str()) {
        return Err(AppError::BadRequest("Ismeretlen csomag".into()));
    }

    let user_hex = auth.user_id.to_hex();
    let order_ref = make_order_ref(&user_hex, &req.package);

    let res = simplepay::start_recurring_checkout(
        &state.http,
        &state.config,
        &req.package,
        &auth.email,
        &order_ref,
    )
    .await
    .map_err(AppError::Internal)?;

    // a tokeneket már most eltároljuk (a fizetés sikeressége az IPN/back-confirm)
    db::store_recurring_tokens(
        &state.mongo.subscriptions,
        auth.user_id,
        &req.package,
        &order_ref,
        &res.tokens,
        BsonDateTime::from_millis(res.token_until_ms),
    )
    .await
    .map_err(AppError::Internal)?;

    tracing::info!(
        "SimplePay checkout indítva: user={} csomag={} tokenek={}",
        auth.email,
        req.package,
        res.tokens.len()
    );
    Ok(Json(json!({ "url": res.payment_url })))
}

#[derive(serde::Deserialize)]
struct ConfirmQuery {
    r: Option<String>,
    s: Option<String>,
}

/// A SimplePay-ről visszatérés megerősítése (a frontend a `r`+`s` query paramokat küldi).
/// Sikeres fizetésnél aktiválja az előfizetést — az IPN-től függetlenül is (idempotens).
async fn confirm_payment(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Query(q): Query<ConfirmQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let (Some(r), Some(s)) = (q.r, q.s) else {
        return Ok(Json(json!({ "ok": false, "status": "missing" })));
    };

    if !simplepay::verify(&state.config.simplepay_secret_key, r.as_bytes(), &s) {
        return Err(AppError::Forbidden);
    }

    let decoded = simplepay::decode_back_r(&r)
        .map_err(|_| AppError::BadRequest("Hibás válasz".into()))?;
    let event = decoded["e"].as_str().unwrap_or("");
    let order_ref = decoded["o"].as_str().unwrap_or("");

    let Some((user_oid, package)) = parse_order_ref(order_ref) else {
        return Err(AppError::BadRequest("Ismeretlen rendelés".into()));
    };
    if user_oid != auth.user_id {
        return Err(AppError::Forbidden);
    }

    if event != "SUCCESS" {
        return Ok(Json(json!({ "ok": false, "status": event.to_lowercase() })));
    }

    let expires = (chrono::Utc::now() + chrono::Duration::days(31)).timestamp_millis();
    db::activate_subscription(
        &state.mongo.subscriptions,
        user_oid,
        &package,
        order_ref,
        BsonDateTime::from_millis(expires),
    )
    .await
    .map_err(AppError::Internal)?;

    tracing::info!("Előfizetés aktiválva (back-confirm): user={user_oid} csomag={package}");
    Ok(Json(json!({ "ok": true, "status": "active", "package": package })))
}

/// SimplePay IPN (server-to-server). Az aláírást ellenőrizzük, FINISHED esetén aktiválunk,
/// és kötelezően aláírt nyugtával válaszolunk (különben a SimplePay újraküldi).
async fn simplepay_ipn(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    let sig = headers
        .get("Signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !simplepay::verify(&state.config.simplepay_secret_key, &body, sig) {
        tracing::warn!("SimplePay IPN: érvénytelen aláírás");
        return Err(AppError::Forbidden);
    }

    let payload: serde_json::Value =
        serde_json::from_slice(&body).map_err(|_| AppError::BadRequest("Hibás JSON".into()))?;
    let status = payload["status"].as_str().unwrap_or("");
    let order_ref = payload["orderRef"].as_str().unwrap_or("");
    tracing::info!("SimplePay IPN: status={status} orderRef={order_ref}");

    if status == "FINISHED" {
        if let Some((user_oid, package)) = parse_order_ref(order_ref) {
            let expires = (chrono::Utc::now() + chrono::Duration::days(31)).timestamp_millis();
            db::activate_subscription(
                &state.mongo.subscriptions,
                user_oid,
                &package,
                order_ref,
                BsonDateTime::from_millis(expires),
            )
            .await
            .map_err(AppError::Internal)?;
            tracing::info!("Előfizetés aktiválva (IPN): user={user_oid} csomag={package}");
        }
    }

    // aláírt visszaigazolás
    let (resp_body, resp_sig) =
        simplepay::build_ipn_response(&state.config.simplepay_secret_key, &body)
            .map_err(AppError::Internal)?;
    let mut h = HeaderMap::new();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
    h.insert(
        "Signature",
        HeaderValue::from_str(&resp_sig).map_err(|e| AppError::Internal(e.into()))?,
    );
    Ok((h, resp_body).into_response())
}

/// Automatikus megújítás lemondása — a hozzáférés a lejáratig megmarad.
async fn cancel_subscription(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(req): Json<PackageRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !PACKAGES.contains(&req.package.as_str()) {
        return Err(AppError::BadRequest("Ismeretlen csomag".into()));
    }
    let found = db::set_auto_renew(&state.mongo.subscriptions, auth.user_id, &req.package, false)
        .await
        .map_err(AppError::Internal)?;
    if !found {
        return Err(AppError::BadRequest("Ehhez a csomaghoz nincs előfizetésed".into()));
    }
    tracing::info!("Megújítás lemondva: user={} csomag={}", auth.email, req.package);
    Ok(Json(json!({ "ok": true })))
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
            Ok(Json(json!({ "ok": true, "status": "expired" })))
        }
        _ => Err(AppError::BadRequest(
            "Aktiváláshoz használd a fizetést (Előfizetek gomb)".into(),
        )),
    }
}

/// Havi automatikus megújítás: a hamarosan lejáró, megújítható előfizetéseket
/// egy-egy tárolt tokennel terheli a SimplePay /dorecurring-on. Az ütemező hívja.
pub async fn process_recurring_renewals(state: &AppState) {
    let soon = (chrono::Utc::now() + chrono::Duration::days(1)).timestamp_millis();
    let subs = match db::find_renewable_subscriptions(
        &state.mongo.subscriptions,
        BsonDateTime::from_millis(soon),
    )
    .await
    {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("Megújítás: lekérdezési hiba: {e:#}");
            return;
        }
    };

    if subs.is_empty() {
        return;
    }
    tracing::info!("Megújítás: {} előfizetés terhelése esedékes", subs.len());

    for sub in subs {
        let Some(sub_id) = sub.id else { continue };
        let Some(token) = sub.simplepay_tokens.first().cloned() else { continue };

        let email = match db::find_user_by_id(&state.mongo.users, sub.user_id).await {
            Ok(Some(u)) => u.email,
            _ => {
                tracing::warn!("Megújítás: nem található user {}", sub.user_id);
                continue;
            }
        };

        let order_ref = make_order_ref(&sub.user_id.to_hex(), &sub.package);
        match simplepay::do_recurring(
            &state.http,
            &state.config,
            &sub.package,
            &email,
            &token,
            &order_ref,
        )
        .await
        {
            Ok(true) => {
                let expires =
                    (chrono::Utc::now() + chrono::Duration::days(31)).timestamp_millis();
                if let Err(e) = db::renew_with_token(
                    &state.mongo.subscriptions,
                    sub_id,
                    &token,
                    &order_ref,
                    BsonDateTime::from_millis(expires),
                )
                .await
                {
                    tracing::error!("Megújítás: DB hiba: {e:#}");
                } else {
                    tracing::info!(
                        "Előfizetés megújítva (recurring): user={} csomag={}",
                        sub.user_id,
                        sub.package
                    );
                }
            }
            Ok(false) => tracing::warn!(
                "Megújítás: sikertelen terhelés user={} csomag={}",
                sub.user_id,
                sub.package
            ),
            Err(e) => tracing::error!("Megújítás: /dorecurring hiba: {e:#}"),
        }
    }
}
