use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use crate::state::AppState;

/// Foci ligák az odds-api.io-n (slug, megjelenített név), amiket az admin naptár mutat.
/// Szezonon kívüli liga üres listát ad vissza — ez nem hiba.
const SOCCER_LEAGUES: [(&str, &str); 9] = [
    ("international-fifa-world-cup", "VB 2026"),
    ("england-premier-league", "Premier League"),
    ("germany-bundesliga", "Bundesliga"),
    ("spain-laliga", "La Liga"),
    ("italy-serie-a", "Serie A"),
    ("france-ligue-1", "Ligue 1"),
    ("international-clubs-uefa-champions-league", "Bajnokok Ligája"),
    ("international-clubs-uefa-europa-league", "Európa-liga"),
    ("england-championship", "Championship"),
];

const ODDS_API_BASE: &str = "https://api.odds-api.io/v3";

/// Free csomagban max 2 bookmaker választható — ezek a fiókhoz vannak rögzítve
/// (PUT /bookmakers/selected/select, 12 óránként egyszer módosítható).
const ODDS_BOOKMAKERS: &str = "Bet365,TippmixPRO";

/// Frissítésenként ennyi legközelebbi meccshez kérünk oddsot (10-esével batchelve).
/// Kvótakeret: 9 liga + 6 odds batch = 15 kérés / frissítés, óránként max 100 fér bele.
const MAX_ODDS_EVENTS: usize = 60;

/// E-sport videojátékok a PandaScore-on.
const ESPORT_GAMES: [&str; 3] = ["csgo", "lol", "dota2"];

const CACHE_SECS: u64 = 600; // 10 perc — kíméli az ingyenes kvótát

/// Meccsek lekérése csomag szerint, egységes formára hozva:
/// { id, sport_key, league, home, away, commence_time, live, odds: { home, draw, away, over, under, total_point } }
pub async fn matches_for_package(state: &AppState, package: &str) -> Result<Value> {
    match package {
        "foci" => soccer_matches(state, false).await,
        "elo" => soccer_matches(state, true).await,
        "esport" => esport_matches(state).await,
        _ => Err(anyhow!("Ismeretlen csomag: {package}")),
    }
}

async fn soccer_matches(state: &AppState, live_only: bool) -> Result<Value> {
    let key = &state.config.odds_api_key;
    if key.is_empty() {
        return Ok(json!({
            "matches": [],
            "error": "ODDS_API_KEY nincs beállítva — szerezz ingyenes kulcsot: https://odds-api.io"
        }));
    }

    let cache_key = "soccer_all".to_string();
    let all = if let Some(cached) = state.cache_get(&cache_key, CACHE_SECS) {
        cached
    } else {
        // 1) meccslista liga szerint (közelgő + élő, alapból 14 napos horizont)
        let mut events: Vec<(Value, &str)> = vec![];
        for (slug, label) in SOCCER_LEAGUES {
            let url = format!(
                "{ODDS_API_BASE}/events?apiKey={key}&sport=football&league={slug}&status=pending,live&limit=40"
            );
            match state.http.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(Value::Array(list)) = resp.json::<Value>().await {
                        events.extend(list.into_iter().map(|e| (e, label)));
                    }
                }
                Ok(resp) => tracing::warn!("Odds API {slug}: {}", resp.status()),
                Err(e) => tracing::warn!("Odds API {slug}: {e}"),
            }
        }
        events.sort_by(|a, b| {
            a.0["date"]
                .as_str()
                .unwrap_or("")
                .cmp(b.0["date"].as_str().unwrap_or(""))
        });

        // 2) odds a legközelebbi meccsekhez, 10-esével (1 multi hívás = 1 kérés a kvótából)
        let mut odds_by_event: std::collections::HashMap<String, Value> =
            std::collections::HashMap::new();
        let ids: Vec<String> = events
            .iter()
            .take(MAX_ODDS_EVENTS)
            .filter_map(|(e, _)| e["id"].as_i64().map(|i| i.to_string()))
            .collect();
        for chunk in ids.chunks(10) {
            let url = format!(
                "{ODDS_API_BASE}/odds/multi?apiKey={key}&eventIds={}&bookmakers={ODDS_BOOKMAKERS}",
                chunk.join(",")
            );
            match state.http.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(Value::Array(list)) = resp.json::<Value>().await {
                        for ev in list {
                            if let Some(id) = ev["id"].as_i64() {
                                odds_by_event.insert(id.to_string(), extract_odds(&ev));
                            }
                        }
                    }
                }
                Ok(resp) => tracing::warn!("Odds API odds/multi: {}", resp.status()),
                Err(e) => tracing::warn!("Odds API odds/multi: {e}"),
            }
        }

        let matches: Vec<Value> = events
            .iter()
            .map(|(ev, label)| {
                let id = ev["id"].as_i64().map(|i| i.to_string()).unwrap_or_default();
                let no_odds = json!({
                    "home": null, "draw": null, "away": null,
                    "over": null, "under": null, "total_point": null
                });
                json!({
                    "id": ev["id"],
                    "sport_key": "foci",
                    "league": label,
                    "home": ev["home"],
                    "away": ev["away"],
                    "commence_time": ev["date"],
                    "live": ev["status"].as_str() == Some("live"),
                    "odds": odds_by_event.get(&id).cloned().unwrap_or(no_odds),
                })
            })
            .collect();
        let val = Value::Array(matches);
        state.cache_put(cache_key, val.clone());
        val
    };

    let mut matches: Vec<Value> = vec![];
    if let Value::Array(list) = &all {
        for m in list {
            if m["live"].as_bool().unwrap_or(false) == live_only {
                matches.push(m.clone());
            }
        }
    }
    Ok(json!({ "matches": matches }))
}

/// Odds kinyerése egy /odds/multi eseményből: preferált bookmaker ML (1X2) +
/// Totals piaca, a 2,5-höz legközelebbi gólvonallal.
fn extract_odds(ev: &Value) -> Value {
    let mut h2h_home = Value::Null;
    let mut h2h_draw = Value::Null;
    let mut h2h_away = Value::Null;
    let mut over = Value::Null;
    let mut under = Value::Null;
    let mut total_point = Value::Null;

    let bookmakers = ev["bookmakers"].as_object();
    let preferred: Vec<&str> = ODDS_BOOKMAKERS.split(',').collect();
    let mut names: Vec<&String> = bookmakers.map(|b| b.keys().collect()).unwrap_or_default();
    names.sort_by_key(|n| preferred.iter().position(|p| p == n).unwrap_or(usize::MAX));

    for name in names {
        let Some(markets) = bookmakers.and_then(|b| b[name.as_str()].as_array()) else {
            continue;
        };
        for m in markets {
            match m["name"].as_str() {
                Some("ML") if h2h_home.is_null() => {
                    if let Some(o) = m["odds"].as_array().and_then(|a| a.first()) {
                        h2h_home = parse_odd(&o["home"]);
                        h2h_draw = parse_odd(&o["draw"]);
                        h2h_away = parse_odd(&o["away"]);
                    }
                }
                Some("Totals") if over.is_null() => {
                    // a fő (2,5-höz legközelebbi) gólvonalat mutatjuk
                    let best = m["odds"].as_array().and_then(|lines| {
                        lines.iter().min_by(|a, b| {
                            let da = (a["hdp"].as_f64().unwrap_or(99.0) - 2.5).abs();
                            let db = (b["hdp"].as_f64().unwrap_or(99.0) - 2.5).abs();
                            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                        })
                    });
                    if let Some(o) = best {
                        over = parse_odd(&o["over"]);
                        under = parse_odd(&o["under"]);
                        total_point = o["hdp"].clone();
                    }
                }
                _ => {}
            }
        }
        if !h2h_home.is_null() && !over.is_null() {
            break;
        }
    }

    json!({
        "home": h2h_home,
        "draw": h2h_draw,
        "away": h2h_away,
        "over": over,
        "under": under,
        "total_point": total_point,
    })
}

/// Az odds-api.io stringként adja az oddsokat ("1.400") — a frontend számot vár.
fn parse_odd(v: &Value) -> Value {
    match v {
        Value::Number(_) => v.clone(),
        Value::String(s) => s.parse::<f64>().map(|f| json!(f)).unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

async fn esport_matches(state: &AppState) -> Result<Value> {
    let key = &state.config.pandascore_api_key;
    if key.is_empty() {
        return Ok(json!({
            "matches": [],
            "error": "PANDASCORE_API_KEY nincs beállítva — szerezz ingyenes kulcsot: https://pandascore.co"
        }));
    }

    let cache_key = "esport_all".to_string();
    if let Some(cached) = state.cache_get(&cache_key, CACHE_SECS) {
        return Ok(cached);
    }

    let mut matches: Vec<Value> = vec![];
    for game in ESPORT_GAMES {
        // running = épp zajló (élőként jelölve), upcoming = közelgő meccsek
        for (endpoint, live) in [("running", true), ("upcoming", false)] {
            let per_page = if live { 10 } else { 25 };
            let url = format!(
                "https://api.pandascore.co/{game}/matches/{endpoint}?per_page={per_page}&token={key}"
            );
            match state.http.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(Value::Array(list)) = resp.json::<Value>().await {
                        for m in &list {
                            let opponents = m["opponents"].as_array();
                            let team = |i: usize| -> String {
                                opponents
                                    .and_then(|o| o.get(i))
                                    .and_then(|o| o["opponent"]["name"].as_str())
                                    .unwrap_or("TBD")
                                    .to_string()
                            };
                            let game_label = match game {
                                "csgo" => "CS2",
                                "lol" => "League of Legends",
                                "dota2" => "Dota 2",
                                _ => game,
                            };
                            matches.push(json!({
                                "id": m["id"],
                                "sport_key": game,
                                "league": format!("{} — {}", game_label, m["league"]["name"].as_str().unwrap_or("")),
                                "home": team(0),
                                "away": team(1),
                                "commence_time": m["begin_at"],
                                "live": live,
                                // PandaScore ingyenes csomagban nincs odds — az admin kézzel írja be a popupban
                                "odds": { "home": null, "draw": null, "away": null, "over": null, "under": null, "total_point": null }
                            }));
                        }
                    }
                }
                Ok(resp) => tracing::warn!("PandaScore {game} {endpoint}: {}", resp.status()),
                Err(e) => tracing::warn!("PandaScore {game} {endpoint}: {e}"),
            }
        }
    }
    // élő meccsek előre, utána kezdési idő szerint
    matches.sort_by(|a, b| {
        let live_a = a["live"].as_bool().unwrap_or(false);
        let live_b = b["live"].as_bool().unwrap_or(false);
        live_b.cmp(&live_a).then(
            a["commence_time"]
                .as_str()
                .unwrap_or("")
                .cmp(b["commence_time"].as_str().unwrap_or("")),
        )
    });
    let result = json!({ "matches": matches });
    state.cache_put(cache_key, result.clone());
    Ok(result)
}
