use anyhow::Context;
use tower_http::cors::AllowOrigin;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub frontend_url: String,
    pub backend_url: String,
    pub mongodb_url: String,
    // Google OAuth
    pub google_client_id: String,
    pub google_client_secret: String,
    /// Admin emailek env-ből (ADMIN_EMAILS, vesszővel elválasztva) — nem hardcode-olt.
    pub admin_emails: Vec<String>,
    // Stripe (kártyás, havi megújuló fizetés)
    pub stripe_secret_key: String,
    /// Webhook aláírás titok (whsec_…) — a Stripe dashboardban a webhook endpointnál.
    pub stripe_webhook_secret: String,
    // Odds API-k (proxy-zva, kulcs nem kerül ki a frontendre)
    pub odds_api_key: String,
    pub pandascore_api_key: String,
    // DeepSeek (Ask AI chat — proxy-zva, kulcs nem kerül ki a frontendre)
    pub deepseek_api_key: String,
    // Email
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    pub smtp_pass: String,
    pub smtp_from: String,
    // Telegram
    pub telegram_bot_token: String,
    pub telegram_bot_username: String,
    pub telegram_group_url: String,
    // Discord webhookok (értesítések)
    pub discord_webhook_signup: String,
    pub discord_webhook_visit: String,
    /// Fizetési értesítések (számlázáshoz: ki, mit, mikor, mennyiért).
    pub discord_webhook_payment: String,
    // Discord fiók-összekapcsolás + rang-szinkron (bot REST API-n át)
    pub discord_client_id: String,
    pub discord_client_secret: String,
    pub discord_bot_token: String,
    /// Üresen hagyva a bot egyetlen szerverét használjuk (auto-felderítés).
    pub discord_guild_id: String,
    pub discord_invite_url: String,
    /// Teszt fizetés engedélyezése (éles üzemben legyen false!)
    pub allow_test_payment: bool,
    pub test_payment_allowed_emails: Vec<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "8080".into())
                .parse()
                .context("PORT must be a number")?,
            frontend_url: std::env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "http://localhost:3000".into()),
            backend_url: std::env::var("BACKEND_URL")
                .unwrap_or_else(|_| "http://localhost:8080".into()),
            mongodb_url: std::env::var("MONGODB_URL").context("MONGODB_URL is required")?,
            google_client_id: std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default(),
            google_client_secret: std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default(),
            admin_emails: std::env::var("ADMIN_EMAILS")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_lowercase())
                .filter(|s| !s.is_empty())
                .collect(),
            stripe_secret_key: std::env::var("STRIPE_SECRET_KEY").unwrap_or_default(),
            stripe_webhook_secret: std::env::var("STRIPE_WEBHOOK_SECRET").unwrap_or_default(),
            odds_api_key: std::env::var("ODDS_API_KEY").unwrap_or_default(),
            pandascore_api_key: std::env::var("PANDASCORE_API_KEY").unwrap_or_default(),
            deepseek_api_key: std::env::var("DEEPSEEK_API_KEY").unwrap_or_default(),
            smtp_host: std::env::var("SMTP_HOST").unwrap_or_else(|_| "smtp.gmail.com".into()),
            smtp_port: std::env::var("SMTP_PORT").unwrap_or_else(|_| "587".into()).parse().unwrap_or(587),
            smtp_user: std::env::var("SMTP_USER").unwrap_or_default(),
            smtp_pass: std::env::var("SMTP_PASS").unwrap_or_default(),
            smtp_from: std::env::var("SMTP_FROM").unwrap_or_else(|_| "no-reply@melostippek.hu".into()),
            telegram_bot_token: std::env::var("TELEGRAM_BOT_TOKEN").unwrap_or_default(),
            telegram_bot_username: std::env::var("TELEGRAM_BOT_USERNAME").unwrap_or_default(),
            telegram_group_url: std::env::var("TELEGRAM_GROUP_URL")
                .unwrap_or_else(|_| "https://t.me/+ilO15-pADJ8xNDZk".into()),
            discord_webhook_signup: std::env::var("DISCORD_WEBHOOK_SIGNUP").unwrap_or_default(),
            discord_webhook_visit: std::env::var("DISCORD_WEBHOOK_VISIT").unwrap_or_default(),
            discord_webhook_payment: std::env::var("DISCORD_WEBHOOK_PAYMENT").unwrap_or_default(),
            discord_client_id: std::env::var("DISCORD_CLIENT_ID").unwrap_or_default(),
            discord_client_secret: std::env::var("DISCORD_CLIENT_SECRET").unwrap_or_default(),
            discord_bot_token: std::env::var("DISCORD_BOT_TOKEN").unwrap_or_default(),
            discord_guild_id: std::env::var("DISCORD_GUILD_ID").unwrap_or_default(),
            discord_invite_url: std::env::var("DISCORD_INVITE_URL")
                .unwrap_or_else(|_| "https://discord.gg/5UtrVq6EHy".into()),
            allow_test_payment: std::env::var("ALLOW_TEST_PAYMENT")
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false),
            test_payment_allowed_emails: std::env::var("TEST_PAYMENT_ALLOWED_EMAILS")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_lowercase())
                .filter(|s| !s.is_empty())
                .collect(),
        })
    }

    /// Discord összekapcsolás + rang-szinkron csak akkor él, ha minden kulcs megvan.
    pub fn discord_enabled(&self) -> bool {
        !self.discord_client_id.is_empty()
            && !self.discord_client_secret.is_empty()
            && !self.discord_bot_token.is_empty()
    }

    pub fn is_admin(&self, email: &str) -> bool {
        let e = email.trim().to_lowercase();
        self.admin_emails.iter().any(|a| a == &e)
    }

    pub fn can_use_test_payment(&self, email: &str) -> bool {
        let e = email.trim().to_lowercase();
        self.test_payment_allowed_emails.iter().any(|a| a == &e)
    }

    pub fn allowed_origins(&self) -> AllowOrigin {
        let frontend = self.frontend_url.clone();
        AllowOrigin::predicate(move |origin, _| {
            let o = origin.to_str().unwrap_or("");
            o == frontend
                || o.starts_with("http://localhost:")
                || o.starts_with("http://127.0.0.1:")
        })
    }
}
