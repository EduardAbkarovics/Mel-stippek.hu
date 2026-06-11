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

/// UTC → budapesti idő (EU-s nyári időszámítás: március utolsó vasárnap 01:00 UTC
/// és október utolsó vasárnap 01:00 UTC között UTC+2, egyébként UTC+1).
pub fn budapest_time(utc: chrono::DateTime<chrono::Utc>) -> String {
    use chrono::{Datelike, Duration, TimeZone, Utc, Weekday};

    fn last_sunday_1am_utc(year: i32, month: u32) -> chrono::DateTime<chrono::Utc> {
        // a hónap utolsó napjától visszafelé az első vasárnap
        let last_day = if month == 12 {
            Utc.with_ymd_and_hms(year + 1, 1, 1, 1, 0, 0).unwrap() - Duration::days(1)
        } else {
            Utc.with_ymd_and_hms(year, month + 1, 1, 1, 0, 0).unwrap() - Duration::days(1)
        };
        let mut d = last_day;
        while d.weekday() != Weekday::Sun {
            d = d - Duration::days(1);
        }
        Utc.with_ymd_and_hms(d.year(), d.month(), d.day(), 1, 0, 0).unwrap()
    }

    let dst_start = last_sunday_1am_utc(utc.year(), 3);
    let dst_end = last_sunday_1am_utc(utc.year(), 10);
    let offset_hours = if utc >= dst_start && utc < dst_end { 2 } else { 1 };
    let local = utc + chrono::Duration::hours(offset_hours);
    format!("{} (Budapest)", local.format("%Y-%m-%d %H:%M"))
}

/// Fizetési értesítés adatai — minden, ami a számla kiállításához kell.
pub struct PaymentNotice {
    /// "first" (új előfizetés) | "renewal" (havi megújítás) | "cancelled" (megszűnt)
    pub kind: &'static str,
    pub email: String,
    /// A vevő neve a Stripe-tól (kártyán/számlázásnál megadott név).
    pub name: Option<String>,
    /// Számlázási cím (irsz., város, utca, ország) a Stripe-tól.
    pub address: Option<String>,
    /// Csomag megjelenített neve, pl. "Foci csomag".
    pub package_label: String,
    /// Bruttó összeg forintban.
    pub amount_huf: u64,
    /// Teljesítés időpontja (a sikeres fizetés pillanata, UTC).
    pub paid_at_utc: chrono::DateTime<chrono::Utc>,
    /// Stripe azonosító (session / invoice / subscription id) a visszakereséshez.
    pub stripe_id: String,
}

/// Sikeres fizetés / megújítás / megszűnés értesítő — a számlázáshoz szükséges
/// összes adattal (ki, mit, mikor, hogyan, mennyiért).
pub fn notify_payment(http: reqwest::Client, webhook: String, n: PaymentNotice) {
    if webhook.is_empty() {
        return;
    }
    let (title, emoji) = match n.kind {
        "first" => ("Új előfizetés", "💸"),
        "renewal" => ("Havi megújítás", "🔁"),
        _ => ("Előfizetés megszűnt", "❌"),
    };
    let mut content = format!(
        "{emoji} **{title}** — {package}\n\
         👤 Vevő: {name}\n\
         📧 Email: `{email}`",
        package = n.package_label,
        name = n.name.clone().unwrap_or_else(|| "—".into()),
        email = n.email,
    );
    if let Some(addr) = &n.address {
        content.push_str(&format!("\n🏠 Számlázási cím: {addr}"));
    }
    if n.kind != "cancelled" {
        content.push_str(&format!(
            "\n💰 Összeg: **{} Ft** (havi előfizetés)\n\
             🕐 Teljesítés időpontja: **{}**\n\
             💳 Fizetési mód: bankkártya (Stripe)",
            n.amount_huf, // HUF-ban nincs tizedes
            budapest_time(n.paid_at_utc),
        ));
    } else {
        content.push_str(&format!("\n🕐 Időpont: {}", budapest_time(n.paid_at_utc)));
    }
    content.push_str(&format!("\n🧾 Stripe azonosító: `{}`", n.stripe_id));
    send(http, webhook, content);
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
