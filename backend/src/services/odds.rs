use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use crate::state::AppState;

/// Foci ligák a The Odds API-n, amiket az admin naptár mutat.
const SOCCER_KEYS: [&str; 8] = [
    "soccer_epl",
    "soccer_germany_bundesliga",
    "soccer_spain_la_liga",
    "soccer_italy_serie_a",
    "soccer_france_ligue_one",
    "soccer_uefa_champs_league",
    "soccer_uefa_europa_league",
    "soccer_efl_champ",
];

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
            "error": "ODDS_API_KEY nincs beállítva — szerezz ingyenes kulcsot: https://the-odds-api.com"
        }));
    }

    let cache_key = "soccer_all".to_string();
    let all = if let Some(cached) = state.cache_get(&cache_key, CACHE_SECS) {
        cached
    } else {
        let mut events: Vec<Value> = vec![];
        for sport in SOCCER_KEYS {
            let url = format!(
                "https://api.the-odds-api.com/v4/sports/{sport}/odds/?apiKey={key}&regions=eu&markets=h2h,totals&oddsFormat=decimal"
            );
            match state.http.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(Value::Array(list)) = resp.json::<Value>().await {
                        events.extend(list);
                    }
                }
                Ok(resp) => {
                    tracing::warn!("Odds API {sport}: {}", resp.status());
                }
                Err(e) => tracing::warn!("Odds API {sport}: {e}"),
            }
        }
        let val = Value::Array(events);
        state.cache_put(cache_key, val.clone());
        val
    };

    let now = chrono::Utc::now();
    let mut matches: Vec<Value> = vec![];
    if let Value::Array(events) = &all {
        for ev in events {
            let commence = ev["commence_time"].as_str().unwrap_or("");
            let start = chrono::DateTime::parse_from_rfc3339(commence)
                .map(|d| d.with_timezone(&chrono::Utc))
                .unwrap_or(now);
            let live = start <= now;
            if live_only != live {
                continue;
            }
            // élőben max 3 órás meccseket mutatunk
            if live && now.signed_duration_since(start).num_hours() > 3 {
                continue;
            }
            matches.push(normalize_odds_api_event(ev, live));
        }
    }
    matches.sort_by(|a, b| {
        a["commence_time"]
            .as_str()
            .unwrap_or("")
            .cmp(b["commence_time"].as_str().unwrap_or(""))
    });
    Ok(json!({ "matches": matches }))
}

fn normalize_odds_api_event(ev: &Value, live: bool) -> Value {
    let home = ev["home_team"].as_str().unwrap_or("?");
    let away = ev["away_team"].as_str().unwrap_or("?");

    // első elérhető bookmaker h2h + totals piacai
    let mut h2h_home = Value::Null;
    let mut h2h_draw = Value::Null;
    let mut h2h_away = Value::Null;
    let mut over = Value::Null;
    let mut under = Value::Null;
    let mut total_point = Value::Null;

    if let Some(bookmakers) = ev["bookmakers"].as_array() {
        for bm in bookmakers {
            if let Some(markets) = bm["markets"].as_array() {
                for m in markets {
                    match m["key"].as_str() {
                        Some("h2h") if h2h_home.is_null() => {
                            if let Some(outcomes) = m["outcomes"].as_array() {
                                for o in outcomes {
                                    let name = o["name"].as_str().unwrap_or("");
                                    if name == home {
                                        h2h_home = o["price"].clone();
                                    } else if name == away {
                                        h2h_away = o["price"].clone();
                                    } else {
                                        h2h_draw = o["price"].clone();
                                    }
                                }
                            }
                        }
                        Some("totals") if over.is_null() => {
                            if let Some(outcomes) = m["outcomes"].as_array() {
                                for o in outcomes {
                                    match o["name"].as_str() {
                                        Some("Over") => {
                                            over = o["price"].clone();
                                            total_point = o["point"].clone();
                                        }
                                        Some("Under") => under = o["price"].clone(),
                                        _ => {}
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            if !h2h_home.is_null() && !over.is_null() {
                break;
            }
        }
    }

    json!({
        "id": ev["id"],
        "sport_key": ev["sport_key"],
        "league": ev["sport_title"],
        "home": home,
        "away": away,
        "commence_time": ev["commence_time"],
        "live": live,
        "odds": {
            "home": h2h_home,
            "draw": h2h_draw,
            "away": h2h_away,
            "over": over,
            "under": under,
            "total_point": total_point,
        }
    })
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
        let url = format!(
            "https://api.pandascore.co/{game}/matches/upcoming?per_page=25&token={key}"
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
                            "live": false,
                            // PandaScore ingyenes csomagban nincs odds — az admin kézzel írja be a popupban
                            "odds": { "home": null, "draw": null, "away": null, "over": null, "under": null, "total_point": null }
                        }));
                    }
                }
            }
            Ok(resp) => tracing::warn!("PandaScore {game}: {}", resp.status()),
            Err(e) => tracing::warn!("PandaScore {game}: {e}"),
        }
    }
    matches.sort_by(|a, b| {
        a["commence_time"]
            .as_str()
            .unwrap_or("")
            .cmp(b["commence_time"].as_str().unwrap_or(""))
    });
    let result = json!({ "matches": matches });
    state.cache_put(cache_key, result.clone());
    Ok(result)
}
