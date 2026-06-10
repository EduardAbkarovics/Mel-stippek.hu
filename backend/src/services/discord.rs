use serde_json::json;

/// Eszköz leírás a User-Agent headerből.
pub fn device_from_ua(ua: &str) -> String {
    let os = if ua.contains("Android") {
        "Android"
    } else if ua.contains("iPhone") || ua.contains("iPad") {
        "iOS"
    } else if ua.contains("Windows") {
        "Windows"
    } else if ua.contains("Mac OS X") {
        "macOS"
    } else if ua.contains("Linux") {
        "Linux"
    } else {
        "Ismeretlen"
    };
    let browser = if ua.contains("Edg/") {
        "Edge"
    } else if ua.contains("OPR/") || ua.contains("Opera") {
        "Opera"
    } else if ua.contains("Chrome/") {
        "Chrome"
    } else if ua.contains("Firefox/") {
        "Firefox"
    } else if ua.contains("Safari/") {
        "Safari"
    } else {
        "?"
    };
    let kind = if ua.contains("Mobile") { "📱 mobil" } else { "🖥️ asztali" };
    format!("{kind} — {os} / {browser}")
}

/// IP → ország/város/szolgáltató (ip-api.com, ingyenes, kulcs nélkül).
pub async fn geo_lookup(http: &reqwest::Client, ip: &str) -> String {
    if ip == "unknown"
        || ip.starts_with("127.")
        || ip == "::1"
        || ip.starts_with("192.168.")
        || ip.starts_with("10.")
    {
        return "helyi hálózat".into();
    }
    match http
        .get(format!(
            "http://ip-api.com/json/{ip}?fields=status,country,city,isp&lang=hu"
        ))
        .send()
        .await
    {
        Ok(r) => match r.json::<serde_json::Value>().await {
            Ok(v) if v["status"] == "success" => format!(
                "{}, {} ({})",
                v["country"].as_str().unwrap_or("?"),
                v["city"].as_str().unwrap_or("?"),
                v["isp"].as_str().unwrap_or("?")
            ),
            _ => "ismeretlen hely".into(),
        },
        Err(_) => "ismeretlen hely".into(),
    }
}

fn send(http: reqwest::Client, webhook: String, content: String) {
    if webhook.is_empty() {
        return;
    }
    tokio::spawn(async move {
        if let Err(e) = http.post(&webhook).json(&json!({ "content": content })).send().await {
            tracing::warn!("Discord webhook hiba: {e}");
        }
    });
}

/// Új regisztráció értesítés (email / google / telegram).
pub fn notify_signup(
    http: reqwest::Client,
    webhook: String,
    email: String,
    name: Option<String>,
    method: &'static str,
    ip: String,
    ua: String,
) {
    if webhook.is_empty() {
        return;
    }
    tokio::spawn(async move {
        let geo = geo_lookup(&http, &ip).await;
        let content = format!(
            "🆕 **Új regisztráció** ({method})\n📧 Email: `{email}`\n👤 Név: {}\n🌍 IP: `{ip}` — {geo}\n💻 Eszköz: {}",
            name.unwrap_or_else(|| "—".into()),
            device_from_ua(&ua),
        );
        send(http, webhook, content);
    });
}

/// Oldal megtekintés értesítés — fiók adatokkal, ha be van jelentkezve.
pub fn notify_visit(
    http: reqwest::Client,
    webhook: String,
    path: String,
    ip: String,
    ua: String,
    account: Option<(String, Option<String>, Option<String>)>, // (email, név, telegram username)
) {
    if webhook.is_empty() {
        return;
    }
    tokio::spawn(async move {
        let geo = geo_lookup(&http, &ip).await;
        let account_line = match account {
            Some((email, name, tg)) => {
                let mut s = format!("✅ van fiókja — `{email}`");
                if let Some(n) = name {
                    s.push_str(&format!(" ({n})"));
                }
                if let Some(t) = tg {
                    s.push_str(&format!(" — TG: @{t}"));
                }
                s
            }
            None => "❌ nincs fiókja".into(),
        };
        let content = format!(
            "👀 **Látogatás** — `{path}`\n🌍 IP: `{ip}` — {geo}\n💻 Eszköz: {}\n👤 Fiók: {account_line}",
            device_from_ua(&ua),
        );
        send(http, webhook, content);
    });
}
