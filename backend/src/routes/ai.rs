use axum::{
    extract::{ConnectInfo, State},
    http::HeaderMap,
    routing::post,
    Json, Router,
};
use serde_json::json;
use std::{net::SocketAddr, sync::Arc};

use crate::{
    error::{AppError, AppResult},
    routes::auth::get_ip,
    AppState,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/ai/chat", post(chat))
}

/// Az asszisztens "személyisége" és a tudásbázis — az oldal tényadatai.
const SYSTEM_PROMPT: &str = "Te Lia vagy, a Melóstippek.hu barátságos, laza AI asszisztense. \
KIZÁRÓLAG magyarul válaszolsz, röviden és lényegre törően (max 4-5 mondat), tegeződsz. \
Az oldalról tudottak: napi 2-5 profi fogadási tipp focira, e-sportra és élő meccsekre. \
Csomagok (havi előfizetés, automatikus megújítással, bankkártyával SimplePay-en át): \
Foci csomag 9 990 Ft/hó, E-sport csomag 7 990 Ft/hó, Élő csomag 9 990 Ft/hó. \
Az előfizetés bármikor lemondható a Profil oldalon, a hozzáférés a lejáratig megmarad. \
Tipp kategóriák: Over/Under, Win és Light. A tippek a Tippjeim oldalon jelennek meg előfizetés után. \
INGYENES napi 1 tipp a Telegram csoportban — ezt bátran ajánld a bizonytalanoknak. \
Regisztrálni emaillel, Google-lel vagy Telegrammal lehet. \
A szerencsejáték 18+ és kockázattal jár — ha valaki problémás játékról ír, jelezd, hogy felelősen játsszon. \
Ha valamit nem tudsz biztosan, mondd meg őszintén, és irányítsd a Telegram csoporthoz. \
SOHA ne ígérj garantált nyereményt. Nem adsz konkrét tippeket ingyen — az az előfizetőké.";

#[derive(serde::Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(serde::Deserialize)]
struct ChatRequest {
    messages: Vec<ChatMessage>,
}

/// Ask AI chat — DeepSeek proxy. A kulcs csak a backenden él, a frontend ide POST-ol.
async fn chat(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<ChatRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let ip = get_ip(&headers, Some(addr));
    if !state.check_rate_limit(&format!("ai:{ip}"), 15, 600) {
        return Err(AppError::TooManyRequests);
    }
    if state.config.deepseek_api_key.is_empty() {
        return Err(AppError::BadRequest(
            "Az AI asszisztens jelenleg nem elérhető".into(),
        ));
    }

    // Csak user/assistant szerepek, az utolsó 12 üzenet, üzenetenként max 1500 karakter.
    let mut messages = vec![json!({ "role": "system", "content": SYSTEM_PROMPT })];
    let recent = req.messages.iter().rev().take(12).rev();
    for m in recent {
        if m.role != "user" && m.role != "assistant" {
            continue;
        }
        let content: String = m.content.trim().chars().take(1500).collect();
        if content.is_empty() {
            continue;
        }
        messages.push(json!({ "role": m.role, "content": content }));
    }
    if messages.len() < 2 {
        return Err(AppError::BadRequest("Üres üzenet".into()));
    }

    let resp = state
        .http
        .post("https://api.deepseek.com/chat/completions")
        .timeout(std::time::Duration::from_secs(45))
        .bearer_auth(&state.config.deepseek_api_key)
        .json(&json!({
            "model": "deepseek-chat",
            "messages": messages,
            "max_tokens": 600,
            "temperature": 0.8,
            "stream": false,
        }))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("DeepSeek kérés hiba: {e}")))?;

    let status = resp.status();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("DeepSeek válasz hiba: {e}")))?;

    if !status.is_success() {
        tracing::error!("DeepSeek API hiba ({status}): {body}");
        return Err(AppError::Internal(anyhow::anyhow!(
            "DeepSeek API hiba: {status}"
        )));
    }

    let reply = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("Hoppá, most nem tudok válaszolni — próbáld újra! 🙈")
        .trim()
        .to_string();

    Ok(Json(json!({ "reply": reply })))
}
