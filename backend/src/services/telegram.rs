use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

/// Telegram Login Widget adat ellenőrzés:
/// secret_key = SHA256(bot_token); data_check_string = sorted "key=value" sorok (hash nélkül);
/// HMAC-SHA256(data_check_string, secret_key) hex == hash.
pub fn verify_telegram_auth(bot_token: &str, fields: &BTreeMap<String, String>) -> bool {
    let hash = match fields.get("hash") {
        Some(h) => h.clone(),
        None => return false,
    };

    let data_check_string = fields
        .iter()
        .filter(|(k, _)| k.as_str() != "hash")
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("\n");

    let secret_key = Sha256::digest(bot_token.as_bytes());
    let mut mac = match Hmac::<Sha256>::new_from_slice(&secret_key) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(data_check_string.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());

    // auth_date max 1 napos lehet
    let fresh = fields
        .get("auth_date")
        .and_then(|d| d.parse::<i64>().ok())
        .map(|d| chrono::Utc::now().timestamp() - d < 86_400)
        .unwrap_or(false);

    expected == hash.to_lowercase() && fresh
}
