use anyhow::{anyhow, Result};
use base64::Engine;
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::Sha384;

use crate::config::Config;

/// Csomag → (havi ár HUF-ban, megnevezés). SimplePay magyar fiók → forint, egész szám.
pub fn package_price(package: &str) -> Option<(u64, &'static str)> {
    match package {
        "foci" => Some((9990, "Melóstippek.hu — Foci csomag")),
        "esport" => Some((7990, "Melóstippek.hu — E-sport csomag")),
        "elo" => Some((9990, "Melóstippek.hu — Élő tippek")),
        _ => None,
    }
}

/// SimplePay v2 API alap-URL (sandbox vagy éles).
fn base_url(cfg: &Config) -> &'static str {
    if cfg.simplepay_sandbox {
        "https://sandbox.simplepay.hu/payment/v2"
    } else {
        "https://secure.simplepay.hu/payment/v2"
    }
}

/// 32 hex karakteres salt (16 random bájt).
fn salt() -> String {
    let bytes: [u8; 16] = rand::random();
    hex::encode(bytes)
}

/// HMAC-SHA384(body) a secret kulccsal, base64-ben — ez megy a `Signature` headerbe.
pub fn sign(secret: &str, body: &[u8]) -> String {
    let mut mac = Hmac::<Sha384>::new_from_slice(secret.as_bytes()).expect("HMAC kulcs");
    mac.update(body);
    base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes())
}

/// Bejövő (IPN / back) aláírás ellenőrzése konstans idejű összehasonlítással.
pub fn verify(secret: &str, body: &[u8], signature: &str) -> bool {
    let expected = sign(secret, body);
    constant_time_eq(expected.as_bytes(), signature.trim().as_bytes())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// ISO8601 helyi idő, pl. "2026-06-11T12:00:00+02:00" (SimplePay ezt várja).
fn iso(dt: chrono::DateTime<chrono::Local>) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%:z").to_string()
}

/// A /start vagy /dorecurring JSON kérés elküldése aláírva, a válasz aláírásának
/// ellenőrzésével. Visszaadja a dekódolt válasz JSON-t.
async fn post_signed(
    http: &reqwest::Client,
    cfg: &Config,
    endpoint: &str,
    body: &Value,
) -> Result<Value> {
    if cfg.simplepay_merchant.is_empty() || cfg.simplepay_secret_key.is_empty() {
        return Err(anyhow!("SIMPLEPAY_MERCHANT / SIMPLEPAY_SECRET_KEY nincs beállítva"));
    }
    let body_str = serde_json::to_string(body)?;
    let signature = sign(&cfg.simplepay_secret_key, body_str.as_bytes());

    let resp = http
        .post(format!("{}{endpoint}", base_url(cfg)))
        .header("Content-Type", "application/json")
        .header("Signature", signature)
        .body(body_str)
        .send()
        .await?;

    let resp_sig = resp
        .headers()
        .get("Signature")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let bytes = resp.bytes().await?;

    if let Some(sig) = resp_sig {
        if !verify(&cfg.simplepay_secret_key, &bytes, &sig) {
            return Err(anyhow!("SimplePay: érvénytelen válasz-aláírás"));
        }
    }

    let data: Value = serde_json::from_slice(&bytes)
        .map_err(|_| anyhow!("SimplePay: hibás válasz JSON: {}", String::from_utf8_lossy(&bytes)))?;

    if let Some(err) = data["errorCodes"].as_array() {
        if !err.is_empty() {
            return Err(anyhow!("SimplePay hiba: {}", data["errorCodes"]));
        }
    }
    Ok(data)
}

/// Recurring (token regisztrációs) Checkout indítása. A `times` darab token a
/// jövőbeli havi terhelésekhez kell (token-onként egy levonás a /dorecurring-on).
pub struct StartResult {
    pub payment_url: String,
    pub tokens: Vec<String>,
    /// a tokenek érvényességi határa (recurring.until)
    pub token_until_ms: i64,
}

pub async fn start_recurring_checkout(
    http: &reqwest::Client,
    cfg: &Config,
    package: &str,
    email: &str,
    order_ref: &str,
) -> Result<StartResult> {
    let (total, _name) =
        package_price(package).ok_or_else(|| anyhow!("Ismeretlen csomag: {package}"))?;

    let now = chrono::Local::now();
    let until = now + chrono::Duration::days(365);
    let token_until_ms = until.timestamp_millis();
    let frontend = &cfg.frontend_url;

    // Az IPN URL-t a SimplePay kereskedői adminban kell beállítani: <backend>/api/payments/ipn
    let body = json!({
        "salt": salt(),
        "merchant": cfg.simplepay_merchant,
        "orderRef": order_ref,
        "currency": "HUF",
        "customerEmail": email,
        "language": "HU",
        "sdkVersion": "Melostippek-Rust-1.0",
        "methods": ["CARD"],
        "total": total,
        "timeout": iso(now + chrono::Duration::minutes(30)),
        "url": format!("{frontend}/fizetes/siker"),
        "recurring": {
            "times": 12,
            "until": iso(until),
            "maxAmount": total
        }
    });

    let data = post_signed(http, cfg, "/start", &body).await?;

    let payment_url = data["paymentUrl"]
        .as_str()
        .ok_or_else(|| anyhow!("SimplePay: hiányzó paymentUrl: {data}"))?
        .to_string();
    let tokens = data["tokens"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default();

    Ok(StartResult { payment_url, tokens, token_until_ms })
}

/// Egy tárolt tokennel kezdeményezett (felhasználói interakció nélküli) havi terhelés.
/// FINISHED státusz esetén sikeres.
pub async fn do_recurring(
    http: &reqwest::Client,
    cfg: &Config,
    package: &str,
    email: &str,
    token: &str,
    order_ref: &str,
) -> Result<bool> {
    let (total, _name) =
        package_price(package).ok_or_else(|| anyhow!("Ismeretlen csomag: {package}"))?;

    let body = json!({
        "salt": salt(),
        "merchant": cfg.simplepay_merchant,
        "orderRef": order_ref,
        "currency": "HUF",
        "customerEmail": email,
        "token": token,
        "type": "MIT",
        "threeDSReqAuthMethod": "02",
        "methods": ["CARD"],
        "total": total,
        "sdkVersion": "Melostippek-Rust-1.0"
    });

    let data = post_signed(http, cfg, "/dorecurring", &body).await?;
    let status = data["status"].as_str().unwrap_or("");
    Ok(status == "FINISHED")
}

/// Az IPN-re adandó válasz: a kapott JSON + `receiveDate`, aláírva. (body, signature)
pub fn build_ipn_response(secret: &str, received: &[u8]) -> Result<(String, String)> {
    let mut data: Value = serde_json::from_slice(received)
        .map_err(|_| anyhow!("IPN: hibás JSON"))?;
    if let Some(obj) = data.as_object_mut() {
        obj.insert(
            "receiveDate".into(),
            json!(iso(chrono::Local::now())),
        );
    }
    let body = serde_json::to_string(&data)?;
    let signature = sign(secret, body.as_bytes());
    Ok((body, signature))
}

/// A back-redirect `r` paraméter (base64 JSON) dekódolása.
/// Mezők: r (eredménykód), t (transactionId), e (esemény: SUCCESS/FAIL/CANCEL/TIMEOUT), o (orderRef).
pub fn decode_back_r(r_b64: &str) -> Result<Value> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(r_b64)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(r_b64))
        .map_err(|_| anyhow!("back: hibás base64"))?;
    Ok(serde_json::from_slice(&bytes)?)
}
