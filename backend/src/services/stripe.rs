use anyhow::{anyhow, Result};
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::config::Config;

/// Csomag → (havi ár centben, Stripe terméknév). USD-ben, mert a frontend $ árakat mutat.
pub fn package_price(package: &str) -> Option<(u64, &'static str)> {
    match package {
        "foci" => Some((3000, "Melóstippek.hu — Foci csomag")),
        "esport" => Some((2500, "Melóstippek.hu — E-sport csomag")),
        "elo" => Some((3000, "Melóstippek.hu — Élő tippek")),
        _ => None,
    }
}

/// Havi előfizetéses Stripe Checkout session — visszaadja a fizetési URL-t.
pub async fn create_subscription_checkout(
    http: &reqwest::Client,
    config: &Config,
    package: &str,
    user_id: &str,
    email: &str,
) -> Result<String> {
    let (price_cents, name) =
        package_price(package).ok_or_else(|| anyhow!("Ismeretlen csomag: {package}"))?;
    let frontend = &config.frontend_url;

    let params: Vec<(&str, String)> = vec![
        ("mode", "subscription".into()),
        ("payment_method_types[]", "card".into()),
        ("line_items[0][price_data][currency]", "usd".into()),
        ("line_items[0][price_data][product_data][name]", name.into()),
        ("line_items[0][price_data][recurring][interval]", "month".into()),
        ("line_items[0][price_data][unit_amount]", price_cents.to_string()),
        ("line_items[0][quantity]", "1".into()),
        ("client_reference_id", user_id.into()),
        ("customer_email", email.into()),
        ("metadata[user_id]", user_id.into()),
        ("metadata[package]", package.into()),
        // a megújulási (subscription) eseményekhez is mentjük a metaadatot
        ("subscription_data[metadata][user_id]", user_id.into()),
        ("subscription_data[metadata][package]", package.into()),
        (
            "success_url",
            format!("{frontend}/fizetes/siker?session_id={{CHECKOUT_SESSION_ID}}"),
        ),
        ("cancel_url", format!("{frontend}/#csomagok")),
    ];

    post_checkout(http, config, &params).await
}

/// 1 USD-s teszt Stripe Checkout (egyszeri fizetés) — a teljes fizetési folyamat
/// valódi tesztelésére. A sikeres fizetés a csomagot 30 napra aktiválja.
pub async fn create_test_checkout(
    http: &reqwest::Client,
    config: &Config,
    package: &str,
    user_id: &str,
    email: &str,
) -> Result<String> {
    let frontend = &config.frontend_url;

    let params: Vec<(&str, String)> = vec![
        ("mode", "payment".into()),
        ("payment_method_types[]", "card".into()),
        ("line_items[0][price_data][currency]", "usd".into()),
        (
            "line_items[0][price_data][product_data][name]",
            format!("Melóstippek.hu — Teszt fizetés ({package}) $1"),
        ),
        ("line_items[0][price_data][unit_amount]", "100".into()),
        ("line_items[0][quantity]", "1".into()),
        ("client_reference_id", user_id.into()),
        ("customer_email", email.into()),
        ("metadata[user_id]", user_id.into()),
        ("metadata[package]", package.into()),
        ("metadata[test_payment]", "true".into()),
        (
            "success_url",
            format!("{frontend}/testpayment?payment=success&session_id={{CHECKOUT_SESSION_ID}}"),
        ),
        ("cancel_url", format!("{frontend}/testpayment?payment=cancelled")),
    ];

    post_checkout(http, config, &params).await
}

/// Közös Stripe Checkout session létrehozás, a fizetési URL kinyerésével.
async fn post_checkout(
    http: &reqwest::Client,
    config: &Config,
    params: &[(&str, String)],
) -> Result<String> {
    if config.stripe_secret_key.is_empty() {
        return Err(anyhow!("STRIPE_SECRET_KEY nincs beállítva a backend .env-ben"));
    }

    let resp = http
        .post("https://api.stripe.com/v1/checkout/sessions")
        .basic_auth(&config.stripe_secret_key, Some(""))
        .form(params)
        .send()
        .await?;

    let data: serde_json::Value = resp.json().await?;
    if let Some(err) = data["error"]["message"].as_str() {
        return Err(anyhow!("Stripe checkout hiba: {err}"));
    }

    data["url"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow!("Stripe: hiányzó checkout URL a válaszban: {data}"))
}

/// Checkout session lekérése a Stripe-tól — a /confirm végpont használja, hogy
/// webhook nélkül (pl. localhoston) is azonnal aktiválhassuk az előfizetést.
pub async fn get_checkout_session(
    http: &reqwest::Client,
    config: &Config,
    session_id: &str,
) -> Result<serde_json::Value> {
    let resp = http
        .get(format!(
            "https://api.stripe.com/v1/checkout/sessions/{session_id}"
        ))
        .basic_auth(&config.stripe_secret_key, Some(""))
        .send()
        .await?;
    Ok(resp.json().await?)
}

/// Stripe webhook aláírás ellenőrzés: a "stripe-signature" header `t=...,v1=...` formátumú,
/// a signed payload = "{t}.{body}", HMAC-SHA256 a webhook secrettel, hex-ben.
pub fn verify_webhook_signature(payload: &[u8], sig_header: &str, secret: &str) -> bool {
    if secret.is_empty() {
        return false;
    }

    let mut timestamp = "";
    let mut signatures: Vec<&str> = vec![];
    for part in sig_header.split(',') {
        if let Some(ts) = part.strip_prefix("t=") {
            timestamp = ts;
        } else if let Some(v1) = part.strip_prefix("v1=") {
            signatures.push(v1);
        }
    }
    if timestamp.is_empty() || signatures.is_empty() {
        return false;
    }

    let signed_payload = format!("{}.{}", timestamp, String::from_utf8_lossy(payload));
    let mut mac = match Hmac::<Sha256>::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(signed_payload.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());
    signatures.iter().any(|&s| s == expected)
}
