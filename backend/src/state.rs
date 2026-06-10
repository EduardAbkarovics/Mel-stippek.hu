use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use crate::config::Config;
use crate::services::mongo::MongoDb;

pub struct AppState {
    pub config: Config,
    pub mongo: MongoDb,
    pub http: reqwest::Client,
    /// Odds API válaszok cache-e (kulcs → (lekérés ideje, JSON)), hogy spóroljunk a kvótával.
    pub odds_cache: Mutex<HashMap<String, (Instant, serde_json::Value)>>,
    /// Egyszerű per-IP rate limit az auth végpontokra: ip → kérés időbélyegek.
    pub rate_limits: Mutex<HashMap<String, Vec<Instant>>>,
}

impl AppState {
    /// Max `max` kérés `window_secs` másodpercenként IP-nként.
    pub fn check_rate_limit(&self, ip: &str, max: usize, window_secs: u64) -> bool {
        let mut map = self.rate_limits.lock().unwrap();
        let now = Instant::now();
        let entry = map.entry(ip.to_string()).or_default();
        entry.retain(|t| now.duration_since(*t).as_secs() < window_secs);
        if entry.len() >= max {
            return false;
        }
        entry.push(now);
        // ne nőjön a végtelenbe
        if map.len() > 10_000 {
            map.clear();
        }
        true
    }

    pub fn cache_get(&self, key: &str, max_age_secs: u64) -> Option<serde_json::Value> {
        let cache = self.odds_cache.lock().unwrap();
        cache.get(key).and_then(|(at, val)| {
            if at.elapsed().as_secs() < max_age_secs {
                Some(val.clone())
            } else {
                None
            }
        })
    }

    pub fn cache_put(&self, key: String, value: serde_json::Value) {
        let mut cache = self.odds_cache.lock().unwrap();
        if cache.len() > 500 {
            cache.clear();
        }
        cache.insert(key, (Instant::now(), value));
    }
}
