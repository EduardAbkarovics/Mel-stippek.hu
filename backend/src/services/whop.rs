use anyhow::{anyhow, Result};
use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::config::Config;

/// Csomag → Whop plan ID (env-ből).
pub fn plan_id_for_package(config: &Config, package: &str) -> Option<String> {
    let id = match package {
        "foci" => &config.whop_plan_foci,
        "esport" => &config.whop_plan_esport,
        "elo" => &config.whop_plan_elo,
        _ => return None,
    };
    if id.is_empty() {
        None
    } else {
        Some(id.clone())
    }
}

/// Whop plan ID → csomag.
pub fn package_for_plan_id(config: &Config, plan_id: &str) -> Option<&'static str> {
    if plan_id == config.whop_plan_foci {
        Some("foci")
    } else if plan_id == config.whop_plan_esport {
        Some("esport")
    } else if plan_id == config.whop_plan_elo {
        Some("elo")
    } else {
        None
    }
}

/// Checkout konfiguráció létrehozása a Whop API-n (metadata-ban a user azonosítóval),
/// visszaadja a fizetési URL-t, ahova a usert átirányítjuk.
pub async fn create_checkout(
    http: &reqwest::Client,
    config: &Config,
    plan_id: &str,
    user_id: &str,
    package: &str,
) -> Result<String> {
    if config.whop_api_key.is_empty() {
        return Err(anyhow!("WHOP_API_KEY nincs beállítva a backend .env-ben"));
    }

    let body = serde_json::json!({
        "plan_id": plan_id,
        "metadata": { "user_id": user_id, "package": package },
        "redirect_url": format!("{}/fizetes/siker", config.frontend_url),
    });

    let resp = http
        .post("https://api.whop.com/api/v1/checkout_configurations")
        .bearer_auth(&config.whop_api_key)
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    let data: serde_json::Value = resp.json().await?;
    if !status.is_success() {
        return Err(anyhow!("Whop checkout hiba ({status}): {data}"));
    }

    // purchase_url lehet relatív ("/checkout/plan_x?session=...") vagy abszolút.
    if let Some(url) = data["purchase_url"].as_str() {
        if url.starts_with("http") {
            return Ok(url.to_string());
        }
        return Ok(format!("https://whop.com{url}"));
    }
    if let Some(session_id) = data["id"].as_str() {
        return Ok(format!("https://whop.com/checkout/{plan_id}?session={session_id}"));
    }
    Err(anyhow!("Whop checkout: hiányzó purchase_url a válaszban: {data}"))
}

/// Whop webhook aláírás ellenőrzés (Svix-kompatibilis):
/// signed_content = "{webhook-id}.{webhook-timestamp}.{body}", HMAC-SHA256 a base64-dekódolt secrettel,
/// az eredmény base64 — a "webhook-signature" header "v1,<base64>" formátumú.
pub fn verify_webhook_signature(
    secret: &str,
    webhook_id: &str,
    timestamp: &str,
    body: &[u8],
    signature_header: &str,
) -> bool {
    // a secret "whsec_" prefixszel jön, a maradék base64
    let secret_b64 = secret.strip_prefix("whsec_").unwrap_or(secret);
    let key = match base64::engine::general_purpose::STANDARD.decode(secret_b64) {
        Ok(k) => k,
        Err(_) => secret_b64.as_bytes().to_vec(),
    };

    let mut mac = match Hmac::<Sha256>::new_from_slice(&key) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(webhook_id.as_bytes());
    mac.update(b".");
    mac.update(timestamp.as_bytes());
    mac.update(b".");
    mac.update(body);
    let expected = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());

    // a header több aláírást is tartalmazhat szóközzel elválasztva: "v1,xxx v1,yyy"
    signature_header.split_whitespace().any(|part| {
        part.strip_prefix("v1,")
            .map(|sig| constant_time_eq(sig.as_bytes(), expected.as_bytes()))
            .unwrap_or(false)
    })
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}
