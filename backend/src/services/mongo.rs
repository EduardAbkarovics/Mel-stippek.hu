use anyhow::Result;
use futures::stream::TryStreamExt;
use mongodb::{
    bson::{doc, oid::ObjectId, DateTime as BsonDateTime},
    options::{ClientOptions, FindOneAndUpdateOptions, FindOptions, IndexOptions, ReturnDocument},
    Client, Collection, IndexModel,
};

use crate::models::{Session, Subscription, Tip, User};

pub struct MongoDb {
    pub users: Collection<User>,
    pub sessions: Collection<Session>,
    pub subscriptions: Collection<Subscription>,
    pub tips: Collection<Tip>,
}

impl MongoDb {
    pub async fn connect(url: &str) -> Result<Self> {
        let mut options = ClientOptions::parse(url).await?;
        options.server_selection_timeout = Some(std::time::Duration::from_secs(8));
        options.connect_timeout = Some(std::time::Duration::from_secs(8));
        let client = Client::with_options(options)?;
        let db = client.database("melostippek");
        db.run_command(doc! { "ping": 1 }, None)
            .await
            .map_err(|e| anyhow::anyhow!("MongoDB ping failed: {e}. Ellenőrizd az Atlas IP whitelist-et: cloud.mongodb.com → Network Access → 0.0.0.0/0"))?;

        let users: Collection<User> = db.collection("users");
        let sessions: Collection<Session> = db.collection("sessions");
        let subscriptions: Collection<Subscription> = db.collection("subscriptions");
        let tips: Collection<Tip> = db.collection("tips");

        ensure_indexes(&users, &sessions, &subscriptions, &tips).await?;

        Ok(Self { users, sessions, subscriptions, tips })
    }
}

async fn ensure_indexes(
    users: &Collection<User>,
    sessions: &Collection<Session>,
    subscriptions: &Collection<Subscription>,
    tips: &Collection<Tip>,
) -> Result<()> {
    let idx = IndexModel::builder()
        .keys(doc! { "email": 1 })
        .options(IndexOptions::builder().unique(true).name(Some("user_email_unique".into())).build())
        .build();
    let _ = users.create_index(idx, None).await;

    let idx = IndexModel::builder()
        .keys(doc! { "token_hash": 1 })
        .options(IndexOptions::builder().unique(true).name(Some("session_token_unique".into())).build())
        .build();
    let _ = sessions.create_index(idx, None).await;

    // TTL index: a lejárt sessionöket a Mongo magától törli
    let idx = IndexModel::builder()
        .keys(doc! { "expires_at": 1 })
        .options(
            IndexOptions::builder()
                .expire_after(Some(std::time::Duration::from_secs(0)))
                .name(Some("session_ttl".into()))
                .build(),
        )
        .build();
    let _ = sessions.create_index(idx, None).await;

    let idx = IndexModel::builder()
        .keys(doc! { "user_id": 1, "package": 1 })
        .options(IndexOptions::builder().name(Some("sub_user_package".into())).build())
        .build();
    let _ = subscriptions.create_index(idx, None).await;

    let idx = IndexModel::builder()
        .keys(doc! { "package": 1, "starts_at": -1 })
        .options(IndexOptions::builder().name(Some("tip_package_starts".into())).build())
        .build();
    let _ = tips.create_index(idx, None).await;

    Ok(())
}

// ── Users ──────────────────────────────────────────────────────────────────────

pub async fn find_user_by_email(col: &Collection<User>, email: &str) -> Result<Option<User>> {
    Ok(col.find_one(doc! { "email": email.trim().to_lowercase() }, None).await?)
}

pub async fn find_user_by_id(col: &Collection<User>, id: ObjectId) -> Result<Option<User>> {
    Ok(col.find_one(doc! { "_id": id }, None).await?)
}

pub async fn find_user_by_google_id(col: &Collection<User>, google_id: &str) -> Result<Option<User>> {
    Ok(col.find_one(doc! { "google_id": google_id }, None).await?)
}

pub async fn find_user_by_telegram_id(col: &Collection<User>, telegram_id: i64) -> Result<Option<User>> {
    Ok(col.find_one(doc! { "telegram_id": telegram_id }, None).await?)
}

pub async fn create_user(col: &Collection<User>, user: User) -> Result<User> {
    let result = col.insert_one(&user, None).await?;
    let mut created = user;
    created.id = result.inserted_id.as_object_id();
    Ok(created)
}

pub async fn upsert_google_user(
    col: &Collection<User>,
    google_id: String,
    email: String,
    name: Option<String>,
    avatar_url: Option<String>,
) -> Result<User> {
    let now = BsonDateTime::now();
    let email = email.trim().to_lowercase();

    // Ha már létezik a user ezzel az emaillel (pl. jelszavas regisztráció), kapcsoljuk hozzá a Google fiókot.
    let filter = doc! { "$or": [ { "google_id": &google_id }, { "email": &email } ] };
    let update = doc! {
        "$set": {
            "google_id": &google_id,
            "name": &name,
            "avatar_url": &avatar_url,
            "updated_at": now,
        },
        "$setOnInsert": {
            "email": &email,
            "created_at": now,
        }
    };
    let opts = FindOneAndUpdateOptions::builder()
        .upsert(true)
        .return_document(ReturnDocument::After)
        .build();
    let user = col
        .find_one_and_update(filter, update, opts)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Failed to upsert Google user"))?;
    Ok(user)
}

/// Jelszó felülírása (teszt fiókok frissítéséhez).
pub async fn set_password_hash(col: &Collection<User>, user_id: ObjectId, hash: &str) -> Result<()> {
    col.update_one(
        doc! { "_id": user_id },
        doc! { "$set": { "password_hash": hash, "updated_at": BsonDateTime::now() } },
        None,
    )
    .await?;
    Ok(())
}

pub async fn list_users(col: &Collection<User>) -> Result<Vec<User>> {
    let opts = FindOptions::builder().sort(doc! { "created_at": -1 }).build();
    let cursor = col.find(None, opts).await?;
    Ok(cursor.try_collect().await?)
}

// ── Sessions ───────────────────────────────────────────────────────────────────

pub async fn create_session(col: &Collection<Session>, session: Session) -> Result<()> {
    col.insert_one(session, None).await?;
    Ok(())
}

pub async fn find_session(col: &Collection<Session>, token_hash: &str) -> Result<Option<Session>> {
    Ok(col
        .find_one(
            doc! {
                "token_hash": token_hash,
                "expires_at": { "$gt": BsonDateTime::now() }
            },
            None,
        )
        .await?)
}

pub async fn delete_session(col: &Collection<Session>, token_hash: &str) -> Result<()> {
    col.delete_one(doc! { "token_hash": token_hash }, None).await?;
    Ok(())
}

pub async fn delete_user_sessions(col: &Collection<Session>, user_id: ObjectId) -> Result<()> {
    col.delete_many(doc! { "user_id": user_id }, None).await?;
    Ok(())
}

// ── Subscriptions ──────────────────────────────────────────────────────────────

/// A user aktív (nem lejárt) előfizetéseinek csomagjai.
pub async fn active_packages(col: &Collection<Subscription>, user_id: ObjectId) -> Result<Vec<String>> {
    let cursor = col
        .find(
            doc! {
                "user_id": user_id,
                "status": "active",
                "expires_at": { "$gt": BsonDateTime::now() }
            },
            None,
        )
        .await?;
    let subs: Vec<Subscription> = cursor.try_collect().await?;
    let mut packages: Vec<String> = subs.into_iter().map(|s| s.package).collect();
    packages.sort();
    packages.dedup();
    Ok(packages)
}

pub async fn user_subscriptions(col: &Collection<Subscription>, user_id: ObjectId) -> Result<Vec<Subscription>> {
    let opts = FindOptions::builder().sort(doc! { "created_at": -1 }).build();
    let cursor = col.find(doc! { "user_id": user_id }, opts).await?;
    Ok(cursor.try_collect().await?)
}

/// Recurring tokenek + orderRef eltárolása a SimplePay /start után (még fizetés előtt).
/// Meglévő előfizetésnél csak frissíti a tokeneket; újnál "pending" státuszú lesz.
pub async fn store_recurring_tokens(
    col: &Collection<Subscription>,
    user_id: ObjectId,
    package: &str,
    order_ref: &str,
    tokens: &[String],
    token_until: BsonDateTime,
) -> Result<()> {
    let now = BsonDateTime::now();
    let filter = doc! { "user_id": user_id, "package": package };
    let update = doc! {
        "$set": {
            "simplepay_order_ref": order_ref,
            "simplepay_tokens": tokens.to_vec(),
            "token_until": token_until,
            "auto_renew": true,
            "updated_at": now,
        },
        "$setOnInsert": {
            "status": "pending",
            "expires_at": now,
            "started_at": now,
            "created_at": now,
        }
    };
    let opts = mongodb::options::UpdateOptions::builder().upsert(true).build();
    col.update_one(filter, update, opts).await?;
    Ok(())
}

/// Előfizetés aktiválása sikeres fizetés után (IPN / back-confirm). Idempotens.
pub async fn activate_subscription(
    col: &Collection<Subscription>,
    user_id: ObjectId,
    package: &str,
    order_ref: &str,
    expires_at: BsonDateTime,
) -> Result<()> {
    let now = BsonDateTime::now();
    let filter = doc! { "user_id": user_id, "package": package };
    let update = doc! {
        "$set": {
            "status": "active",
            "simplepay_order_ref": order_ref,
            "expires_at": expires_at,
            "updated_at": now,
        },
        "$setOnInsert": {
            "auto_renew": true,
            "simplepay_tokens": Vec::<String>::new(),
            "started_at": now,
            "created_at": now,
        }
    };
    let opts = mongodb::options::UpdateOptions::builder().upsert(true).build();
    col.update_one(filter, update, opts).await?;
    Ok(())
}

/// Hamarosan lejáró, automatikusan megújítható előfizetések (van még tokenjük, a token érvényes).
pub async fn find_renewable_subscriptions(
    col: &Collection<Subscription>,
    expiring_before: BsonDateTime,
) -> Result<Vec<Subscription>> {
    let now = BsonDateTime::now();
    let filter = doc! {
        "status": "active",
        "auto_renew": true,
        "expires_at": { "$lte": expiring_before },
        "token_until": { "$gt": now },
        "simplepay_tokens.0": { "$exists": true },
    };
    let cursor = col.find(filter, None).await?;
    Ok(cursor.try_collect().await?)
}

/// Sikeres havi terhelés után: a felhasznált token eltávolítása + lejárat meghosszabbítása.
pub async fn renew_with_token(
    col: &Collection<Subscription>,
    sub_id: ObjectId,
    used_token: &str,
    order_ref: &str,
    expires_at: BsonDateTime,
) -> Result<()> {
    col.update_one(
        doc! { "_id": sub_id },
        doc! {
            "$set": {
                "status": "active",
                "expires_at": expires_at,
                "simplepay_order_ref": order_ref,
                "updated_at": BsonDateTime::now(),
            },
            "$pull": { "simplepay_tokens": used_token },
        },
        None,
    )
    .await?;
    Ok(())
}

/// Automatikus megújítás be/ki (lemondás: a meglévő hozzáférés a lejáratig megmarad).
pub async fn set_auto_renew(
    col: &Collection<Subscription>,
    user_id: ObjectId,
    package: &str,
    enabled: bool,
) -> Result<bool> {
    let res = col
        .update_one(
            doc! { "user_id": user_id, "package": package },
            doc! { "$set": { "auto_renew": enabled, "updated_at": BsonDateTime::now() } },
            None,
        )
        .await?;
    Ok(res.matched_count > 0)
}

/// Előfizetés lejáratása user + csomag alapján (teszt fizetéshez).
pub async fn expire_subscription(
    col: &Collection<Subscription>,
    user_id: ObjectId,
    package: &str,
) -> Result<bool> {
    let res = col
        .update_one(
            doc! { "user_id": user_id, "package": package },
            doc! { "$set": {
                "status": "expired",
                "expires_at": BsonDateTime::now(),
                "auto_renew": false,
                "updated_at": BsonDateTime::now(),
            }},
            None,
        )
        .await?;
    Ok(res.matched_count > 0)
}

pub async fn list_subscriptions(col: &Collection<Subscription>) -> Result<Vec<Subscription>> {
    let opts = FindOptions::builder().sort(doc! { "created_at": -1 }).build();
    let cursor = col.find(None, opts).await?;
    Ok(cursor.try_collect().await?)
}

// ── Tips ───────────────────────────────────────────────────────────────────────

pub async fn create_tip(col: &Collection<Tip>, tip: Tip) -> Result<Tip> {
    let result = col.insert_one(&tip, None).await?;
    let mut created = tip;
    created.id = result.inserted_id.as_object_id();
    Ok(created)
}

/// Tippek a megadott csomagokhoz (user a saját előfizetései szerint látja).
pub async fn tips_for_packages(col: &Collection<Tip>, packages: &[String], limit: i64) -> Result<Vec<Tip>> {
    if packages.is_empty() {
        return Ok(vec![]);
    }
    let opts = FindOptions::builder()
        .sort(doc! { "starts_at": -1 })
        .limit(limit)
        .build();
    let cursor = col
        .find(doc! { "package": { "$in": packages } }, opts)
        .await?;
    Ok(cursor.try_collect().await?)
}

pub async fn list_all_tips(col: &Collection<Tip>) -> Result<Vec<Tip>> {
    let opts = FindOptions::builder().sort(doc! { "starts_at": -1 }).limit(500).build();
    let cursor = col.find(None, opts).await?;
    Ok(cursor.try_collect().await?)
}

pub async fn delete_tip(col: &Collection<Tip>, id: ObjectId) -> Result<bool> {
    let res = col.delete_one(doc! { "_id": id }, None).await?;
    Ok(res.deleted_count > 0)
}

pub async fn set_tip_result(col: &Collection<Tip>, id: ObjectId, result: &str) -> Result<bool> {
    let res = col
        .update_one(
            doc! { "_id": id },
            doc! { "$set": { "result": result, "updated_at": BsonDateTime::now() } },
            None,
        )
        .await?;
    Ok(res.matched_count > 0)
}
