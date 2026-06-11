use anyhow::{anyhow, Result};

use crate::config::Config;

/// Csomag → (megjelenített név, havi ár fillérben).
/// FIGYELEM: a Stripe a HUF összeget fillérben várja, és 100-zal oszthatónak
/// kell lennie (9 990 Ft = 999 000).
pub fn package_info(package: &str) -> Option<(&'static str, u64)> {
    match package {
        "foci" => Some(("Foci csomag", 999_000)),
        "esport" => Some(("E-sport csomag", 799_000)),
        "elo" => Some(("Élő tippek", 999_000)),
        _ => None,
    }
}

async fn stripe_post(
    http: &reqwest::Client,
    config: &Config,
    url: &str,
    params: &[(&str, String)],
) -> Result<serde_json::Value> {
    let resp = http
        .post(url)
        .basic_auth(&config.stripe_secret_key, Some(""))
        .form(params)
        .send()
        .await?;
    let data: serde_json::Value = resp.json().await?;
    if let Some(err) = data["error"]["message"].as_str() {
        return Err(anyhow!("Stripe hiba: {err}"));
    }
    Ok(data)
}

async fn stripe_get(
    http: &reqwest::Client,
    config: &Config,
    url: &str,
) -> Result<serde_json::Value> {
    let resp = http
        .get(url)
        .basic_auth(&config.stripe_secret_key, Some(""))
        .send()
        .await?;
    let data: serde_json::Value = resp.json().await?;
    if let Some(err) = data["error"]["message"].as_str() {
        return Err(anyhow!("Stripe hiba: {err}"));
    }
    Ok(data)
}

/// Havi megújuló Stripe Checkout session — visszaadja a fizetési oldal URL-jét.
/// Magyar nyelvű felület + kötelező számlázási cím (a számlakiállításhoz kell).
pub async fn create_subscription_checkout(
    http: &reqwest::Client,
    config: &Config,
    package: &str,
    email: &str,
    user_hex: &str,
) -> Result<String> {
    let (name, amount_fillers) = package_info(package).ok_or_else(|| anyhow!("Ismeretlen csomag"))?;
    let frontend = &config.frontend_url;

    let params: Vec<(&str, String)> = vec![
        ("mode", "subscription".into()),
        ("locale", "hu".into()),
        ("payment_method_types[]", "card".into()),
        ("billing_address_collection", "required".into()),
        ("line_items[0][price_data][currency]", "huf".into()),
        (
            "line_items[0][price_data][product_data][name]",
            format!("Melóstippek.hu — {name}"),
        ),
        ("line_items[0][price_data][recurring][interval]", "month".into()),
        ("line_items[0][price_data][unit_amount]", amount_fillers.to_string()),
        ("line_items[0][quantity]", "1".into()),
        ("client_reference_id", user_hex.to_string()),
        ("customer_email", email.to_string()),
        ("metadata[package]", package.to_string()),
        ("subscription_data[metadata][package]", package.to_string()),
        (
            "success_url",
            format!("{frontend}/fizetes/siker?session_id={{CHECKOUT_SESSION_ID}}"),
        ),
        ("cancel_url", format!("{frontend}/#csomagok")),
    ];

    let data = stripe_post(http, config, "https://api.stripe.com/v1/checkout/sessions", &params).await?;
    data["url"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow!("Nincs URL a Stripe válaszban"))
}

/// Legolcsóbb éles teszt fizetés: egyszeri 200 Ft, sikeres fizetés után a
/// confirm/webhook 1 napra aktiválja a csomagot (metadata[test_payment]=true).
pub async fn create_test_checkout(
    http: &reqwest::Client,
    config: &Config,
    package: &str,
    email: &str,
    user_hex: &str,
) -> Result<String> {
    let (name, _) = package_info(package).ok_or_else(|| anyhow!("Ismeretlen csomag"))?;
    let frontend = &config.frontend_url;

    let params: Vec<(&str, String)> = vec![
        ("mode", "payment".into()),
        ("locale", "hu".into()),
        ("payment_method_types[]", "card".into()),
        ("line_items[0][price_data][currency]", "huf".into()),
        (
            "line_items[0][price_data][product_data][name]",
            format!("Melóstippek.hu — TESZT: {name} (1 nap)"),
        ),
        // 200 Ft = 20 000 fillér (Stripe HUF minimum ~175 Ft felett)
        ("line_items[0][price_data][unit_amount]", "20000".into()),
        ("line_items[0][quantity]", "1".into()),
        ("client_reference_id", user_hex.to_string()),
        ("customer_email", email.to_string()),
        ("metadata[package]", package.to_string()),
        ("metadata[test_payment]", "true".into()),
        (
            "success_url",
            format!("{frontend}/testpayment?paid=1&session_id={{CHECKOUT_SESSION_ID}}"),
        ),
        ("cancel_url", format!("{frontend}/testpayment")),
    ];

    let data = stripe_post(http, config, "https://api.stripe.com/v1/checkout/sessions", &params).await?;
    data["url"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow!("Nincs URL a Stripe válaszban"))
}

pub async fn get_checkout_session(
    http: &reqwest::Client,
    config: &Config,
    session_id: &str,
) -> Result<serde_json::Value> {
    stripe_get(
        http,
        config,
        &format!("https://api.stripe.com/v1/checkout/sessions/{session_id}"),
    )
    .await
}

pub async fn get_subscription(
    http: &reqwest::Client,
    config: &Config,
    subscription_id: &str,
) -> Result<serde_json::Value> {
    stripe_get(
        http,
        config,
        &format!("https://api.stripe.com/v1/subscriptions/{subscription_id}"),
    )
    .await
}

/// Lemondás a periódus végén — a hozzáférés a már kifizetett hónap végéig megmarad.
pub async fn cancel_at_period_end(
    http: &reqwest::Client,
    config: &Config,
    subscription_id: &str,
) -> Result<()> {
    stripe_post(
        http,
        config,
        &format!("https://api.stripe.com/v1/subscriptions/{subscription_id}"),
        &[("cancel_at_period_end", "true".to_string())],
    )
    .await?;
    Ok(())
}

/// Stripe ügyfélportál (számlák, kártya csere) — visszaadja a portál URL-jét.
pub async fn billing_portal_url(
    http: &reqwest::Client,
    config: &Config,
    customer_id: &str,
) -> Result<String> {
    let data = stripe_post(
        http,
        config,
        "https://api.stripe.com/v1/billing_portal/sessions",
        &[
            ("customer", customer_id.to_string()),
            ("locale", "hu".to_string()),
            ("return_url", format!("{}/profil", config.frontend_url)),
        ],
    )
    .await?;
    data["url"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow!("Nincs URL a Stripe válaszban"))
}

/// Stripe webhook aláírás ellenőrzés (HMAC-SHA256, `t=...,v1=...` formátum).
pub fn verify_signature(payload: &[u8], sig_header: &str, secret: &str) -> bool {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

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
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(signed_payload.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());
    signatures.iter().any(|&s| s == expected)
}
