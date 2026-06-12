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
    // Discord üzenet limit: 2000 karakter
    let content: String = content.chars().take(1900).collect();
    tokio::spawn(async move {
        if let Err(e) = http.post(&webhook).json(&json!({ "content": content })).send().await {
            tracing::warn!("Discord webhook hiba: {e}");
        }
    });
}

/// Csomag címke emojival a Discord üzenetekhez.
pub fn package_pretty(pkg: &str) -> String {
    match pkg {
        "foci" => "⚽ Foci".into(),
        "esport" => "🎮 E-sport".into(),
        "elo" => "🔴 Élő".into(),
        other => other.to_string(),
    }
}

/// Másodpercek emberi formában: "37 mp", "4 perc 12 mp", "1 óra 3 perc".
pub fn fmt_duration(secs: u64) -> String {
    if secs < 60 {
        return format!("{secs} mp");
    }
    let (h, m, s) = (secs / 3600, (secs % 3600) / 60, secs % 60);
    if h > 0 {
        format!("{h} óra {m} perc")
    } else {
        format!("{m} perc {s} mp")
    }
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

/// Bejelentkezett látogató adatai a látogatás-értesítőkhöz.
pub struct VisitAccount {
    pub email: String,
    pub name: Option<String>,
    pub telegram: Option<String>,
    /// Előre formázott aktív előfizetés sorok, pl. "⚽ Foci — 2026-07-01-ig 🔁".
    pub subs: Vec<String>,
}

/// Fiók + előfizetés sorok az értesítőkbe.
fn account_lines(account: &Option<VisitAccount>) -> String {
    match account {
        Some(a) => {
            let mut s = format!("👤 Fiók: ✅ bejelentkezve — `{}`", a.email);
            if let Some(n) = &a.name {
                s.push_str(&format!(" ({n})"));
            }
            if let Some(t) = &a.telegram {
                s.push_str(&format!(" — TG: @{t}"));
            }
            if a.subs.is_empty() {
                s.push_str("\n⭐ Előfizetés: ❌ nincs aktív csomagja");
            } else {
                s.push_str(&format!("\n⭐ Előfizetés: {}", a.subs.join(" · ")));
            }
            s
        }
        None => "👤 Fiók: ❌ nincs bejelentkezve".into(),
    }
}

/// Oldal megtekintés értesítés — érkezéskor, fiók adatokkal, ha be van jelentkezve.
pub fn notify_visit(
    http: reqwest::Client,
    webhook: String,
    path: String,
    ip: String,
    ua: String,
    account: Option<VisitAccount>,
) {
    if webhook.is_empty() {
        return;
    }
    tokio::spawn(async move {
        let geo = geo_lookup(&http, &ip).await;
        let content = format!(
            "👀 **Új látogató az oldalon!** — `{path}`\n\
             🕐 Időpont: **{}**\n\
             🌍 IP: `{ip}` — {geo}\n\
             💻 Platform: {}\n\
             {}",
            budapest_time(chrono::Utc::now()),
            device_from_ua(&ua),
            account_lines(&account),
        );
        send(http, webhook, content);
    });
}

/// A látogatás végi összegzés adatai.
pub struct VisitSummary {
    pub ip: String,
    pub ua: String,
    pub account: Option<VisitAccount>,
    pub started_at_utc: chrono::DateTime<chrono::Utc>,
    pub duration_secs: u64,
    /// Megnézett oldalak, sorrendben.
    pub pages: Vec<String>,
    /// (gomb/link felirat, hányszor kattintott rá) — az első kattintás sorrendjében.
    pub clicks: Vec<(String, u32)>,
}

/// Látogatás összegzés — távozáskor küldi a frontend: meddig volt itt, mit nézett, mire kattintott.
pub fn notify_visit_summary(http: reqwest::Client, webhook: String, s: VisitSummary) {
    if webhook.is_empty() {
        return;
    }
    tokio::spawn(async move {
        let geo = geo_lookup(&http, &s.ip).await;
        let pages = if s.pages.is_empty() {
            "`/`".to_string()
        } else {
            s.pages.iter().map(|p| format!("`{p}`")).collect::<Vec<_>>().join(" → ")
        };
        let clicks = if s.clicks.is_empty() {
            "— nem kattintott semmire".to_string()
        } else {
            let total: u32 = s.clicks.iter().map(|(_, c)| c).sum();
            let list = s
                .clicks
                .iter()
                .map(|(l, c)| if *c > 1 { format!("„{l}” ×{c}") } else { format!("„{l}”") })
                .collect::<Vec<_>>()
                .join(" · ");
            format!("{total} db — {list}")
        };
        let content = format!(
            "📋 **Látogatás összegzés**\n\
             🕐 Érkezett: **{arrived}**\n\
             ⏱️ Tartózkodás: **{dur}**\n\
             🌍 IP: `{ip}` — {geo}\n\
             💻 Platform: {dev}\n\
             {account}\n\
             📄 Megnézett oldalak: {pages}\n\
             🖱️ Kattintások: {clicks}",
            arrived = budapest_time(s.started_at_utc),
            dur = fmt_duration(s.duration_secs),
            ip = s.ip,
            dev = device_from_ua(&s.ua),
            account = account_lines(&s.account),
        );
        send(http, webhook, content);
    });
}
