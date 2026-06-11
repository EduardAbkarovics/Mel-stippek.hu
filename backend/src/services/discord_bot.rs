//! Discord rang-szinkron a bot REST API-ján át (gateway/külön folyamat nélkül).
//! A rangokat az aktív előfizetések (foci/esport/elo) vezérlik.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use mongodb::bson::{doc, oid::ObjectId};
use serde_json::{json, Value};

use crate::services::mongo as db;
use crate::state::DiscordIds;
use crate::AppState;

const API: &str = "https://discord.com/api/v10";

/// csomag id → Discord rang név (létrehozzuk, ha nincs a szerveren)
pub const PACKAGE_ROLES: [(&str, &str); 3] =
    [("foci", "Foci"), ("esport", "E-sport"), ("elo", "Élő")];

/// Bot-tokenes kérés; 429-nél a retry_after-t kivárva egyszer újrapróbálja.
async fn bot_request(
    state: &AppState,
    method: reqwest::Method,
    url: &str,
    body: Option<&Value>,
) -> Result<reqwest::Response> {
    for attempt in 0..2 {
        let mut req = state.http.request(method.clone(), url).header(
            "Authorization",
            format!("Bot {}", state.config.discord_bot_token),
        );
        if let Some(b) = body {
            req = req.json(b);
        }
        let resp = req.send().await?;
        if resp.status().as_u16() == 429 && attempt == 0 {
            let retry = resp
                .json::<Value>()
                .await
                .ok()
                .and_then(|v| v["retry_after"].as_f64())
                .unwrap_or(1.0);
            tokio::time::sleep(std::time::Duration::from_secs_f64(retry.min(10.0))).await;
            continue;
        }
        if resp.status().as_u16() == 403 {
            tracing::warn!(
                "Discord 403 ({url}) — ellenőrizd: a botnak van-e Manage Roles joga, \
                 és a saját rangja a Foci/E-sport/Élő rangok FELETT van-e"
            );
        }
        return Ok(resp);
    }
    unreachable!("a ciklus legfeljebb kétszer fut")
}

/// Guild + rang id-k felderítése (egyszer, cache-elve; hibánál később újrapróbálja).
/// A guild a configból jön, vagy a bot egyetlen szervere; a hiányzó rangokat létrehozza.
pub async fn ensure_ids(state: &AppState) -> Result<&DiscordIds> {
    state
        .discord_ids
        .get_or_try_init(|| async {
            let guild_id = if !state.config.discord_guild_id.is_empty() {
                state.config.discord_guild_id.clone()
            } else {
                let resp = bot_request(
                    state,
                    reqwest::Method::GET,
                    &format!("{API}/users/@me/guilds"),
                    None,
                )
                .await?;
                if !resp.status().is_success() {
                    return Err(anyhow!("Discord guild lista hiba: {}", resp.status()));
                }
                let guilds: Value = resp.json().await?;
                let arr = guilds.as_array().cloned().unwrap_or_default();
                match arr.len() {
                    0 => return Err(anyhow!("A Discord bot nincs meghívva egyetlen szerverre sem")),
                    1 => {}
                    n => tracing::warn!(
                        "A bot {n} szerveren van — az elsőt használjuk (DISCORD_GUILD_ID env-vel pontosítható)"
                    ),
                }
                arr[0]["id"].as_str().unwrap_or_default().to_string()
            };
            if guild_id.is_empty() {
                return Err(anyhow!("Discord guild id nem állapítható meg"));
            }

            let resp = bot_request(
                state,
                reqwest::Method::GET,
                &format!("{API}/guilds/{guild_id}/roles"),
                None,
            )
            .await?;
            if !resp.status().is_success() {
                return Err(anyhow!("Discord rangok lekérése hiba: {}", resp.status()));
            }
            let existing: Vec<Value> = resp.json().await?;

            let mut roles = HashMap::new();
            for (package, role_name) in PACKAGE_ROLES {
                let found = existing.iter().find(|r| {
                    r["name"]
                        .as_str()
                        .map(|n| n.to_lowercase() == role_name.to_lowercase())
                        .unwrap_or(false)
                });
                let id = match found {
                    Some(r) => r["id"].as_str().unwrap_or_default().to_string(),
                    None => {
                        let resp = bot_request(
                            state,
                            reqwest::Method::POST,
                            &format!("{API}/guilds/{guild_id}/roles"),
                            Some(&json!({ "name": role_name, "hoist": true })),
                        )
                        .await?;
                        if !resp.status().is_success() {
                            return Err(anyhow!(
                                "Discord rang létrehozás ({role_name}) hiba: {}",
                                resp.status()
                            ));
                        }
                        let r: Value = resp.json().await?;
                        tracing::info!("Discord rang létrehozva: {role_name}");
                        r["id"].as_str().unwrap_or_default().to_string()
                    }
                };
                roles.insert(package.to_string(), id);
            }
            tracing::info!("Discord azonosítók kész: guild={guild_id}, {} rang", roles.len());
            Ok(DiscordIds { guild_id, roles })
        })
        .await
}

/// User beléptetése a szerverre OAuth access tokennel (scope: guilds.join).
/// 201 = belépett (a rangokat is megkapta) → false; 204 = már tag → true (külön sync kell).
pub async fn join_guild(
    state: &AppState,
    ids: &DiscordIds,
    discord_user_id: &str,
    access_token: &str,
    role_ids: &[String],
) -> Result<bool> {
    let url = format!("{API}/guilds/{}/members/{}", ids.guild_id, discord_user_id);
    let body = json!({ "access_token": access_token, "roles": role_ids });
    let resp = bot_request(state, reqwest::Method::PUT, &url, Some(&body)).await?;
    match resp.status().as_u16() {
        201 => Ok(false),
        204 => Ok(true),
        s => Err(anyhow!(
            "Discord guild join hiba: {s} {}",
            resp.text().await.unwrap_or_default()
        )),
    }
}

/// Idempotens rang-szinkron egy userre: aktív csomagok ↔ kezelt rangok diffje.
/// Csak a 3 kezelt rangot piszkálja, a user egyéb rangjaihoz nem nyúl.
pub async fn sync_user_roles(state: &AppState, user_id: ObjectId) -> Result<()> {
    if !state.config.discord_enabled() {
        return Ok(());
    }
    let Some(user) = db::find_user_by_id(&state.mongo.users, user_id).await? else {
        return Ok(());
    };
    let Some(discord_id) = user.discord_id else {
        return Ok(());
    };
    let ids = ensure_ids(state).await?;
    let packages = db::active_packages(&state.mongo.subscriptions, user_id).await?;

    let resp = bot_request(
        state,
        reqwest::Method::GET,
        &format!("{API}/guilds/{}/members/{discord_id}", ids.guild_id),
        None,
    )
    .await?;
    if resp.status().as_u16() == 404 {
        // kilépett a szerverről / még nem lépett be — a link marad, az óránkénti sweep újrapróbálja
        tracing::info!("Discord: {} nincs a szerveren, rang-sync kihagyva", user.email);
        return Ok(());
    }
    if !resp.status().is_success() {
        return Err(anyhow!("Discord member lekérés hiba: {}", resp.status()));
    }
    let member: Value = resp.json().await?;
    let current: Vec<String> = member["roles"]
        .as_array()
        .map(|a| a.iter().filter_map(|r| r.as_str().map(String::from)).collect())
        .unwrap_or_default();

    for (package, _) in PACKAGE_ROLES {
        let Some(role_id) = ids.roles.get(package) else {
            continue;
        };
        let has = current.iter().any(|r| r == role_id);
        let want = packages.iter().any(|p| p == package);
        if want == has {
            continue;
        }
        let url = format!(
            "{API}/guilds/{}/members/{discord_id}/roles/{role_id}",
            ids.guild_id
        );
        let method = if want { reqwest::Method::PUT } else { reqwest::Method::DELETE };
        let resp = bot_request(state, method, &url, None).await?;
        if !resp.status().is_success() && resp.status().as_u16() != 404 {
            tracing::warn!(
                "Discord rang {} ({package}) hiba {}: {}",
                if want { "hozzáadás" } else { "elvétel" },
                user.email,
                resp.status()
            );
        }
    }
    Ok(())
}

/// Fire-and-forget rang-sync — fizetés/admin handler sosem blokkol a Discordon.
pub fn spawn_sync(state: Arc<AppState>, user_id: ObjectId) {
    if !state.config.discord_enabled() {
        return;
    }
    tokio::spawn(async move {
        if let Err(e) = sync_user_roles(state.as_ref(), user_id).await {
            tracing::warn!("Discord rang-sync hiba: {e:#}");
        }
    });
}

/// Óránkénti teljes szinkron minden összekapcsolt userre (lejáratok lekezelése).
pub async fn sync_all(state: &AppState) {
    use futures::stream::TryStreamExt;
    let mut cursor = match state
        .mongo
        .users
        .find(doc! { "discord_id": { "$exists": true, "$ne": null } }, None)
        .await
    {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Discord sync_all user lista hiba: {e}");
            return;
        }
    };
    let mut count = 0u32;
    while let Ok(Some(user)) = cursor.try_next().await {
        if let Some(oid) = user.id {
            if let Err(e) = sync_user_roles(state, oid).await {
                tracing::warn!("Discord sync {}: {e:#}", user.email);
            }
            count += 1;
            // jóval a Discord globális limitje alatt maradunk
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        }
    }
    if count > 0 {
        tracing::info!("Discord rang-szinkron kész ({count} user)");
    }
}

/// Unlinkkor a kezelt rangok levétele (a user a szerveren maradhat).
pub fn spawn_remove_all_roles(state: Arc<AppState>, discord_id: String) {
    if !state.config.discord_enabled() {
        return;
    }
    tokio::spawn(async move {
        let ids = match ensure_ids(state.as_ref()).await {
            Ok(i) => i.clone(),
            Err(e) => {
                tracing::warn!("Discord rang levétel — ID felderítés hiba: {e:#}");
                return;
            }
        };
        for (package, _) in PACKAGE_ROLES {
            if let Some(role_id) = ids.roles.get(package) {
                let url = format!(
                    "{API}/guilds/{}/members/{discord_id}/roles/{role_id}",
                    ids.guild_id
                );
                let _ = bot_request(state.as_ref(), reqwest::Method::DELETE, &url, None).await;
            }
        }
    });
}
