use anyhow::Result;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use crate::config::Config;

pub async fn send_email(config: &Config, to: &str, subject: &str, body: &str) -> Result<()> {
    if config.smtp_user.is_empty() || config.smtp_pass.is_empty() {
        tracing::warn!("Email kihagyva (SMTP nincs beállítva): to={to} subject={subject}");
        return Ok(());
    }

    let email = Message::builder()
        .from(config.smtp_from.parse()?)
        .to(to.parse()?)
        .subject(subject)
        .body(body.to_string())?;

    let creds = Credentials::new(config.smtp_user.clone(), config.smtp_pass.clone());
    let mailer: AsyncSmtpTransport<Tokio1Executor> =
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)?
            .credentials(creds)
            .port(config.smtp_port)
            .build();

    mailer.send(email).await?;
    Ok(())
}

pub async fn send_password_reset(config: &Config, to: &str, token: &str) -> Result<()> {
    let link = format!("{}/jelszo-visszaallitas?token={}", config.frontend_url, token);
    let body = format!(
        "Szia!\n\nJelszó visszaállítást kértél a Melóstippek.hu oldalon.\n\nKattints az alábbi linkre az új jelszó megadásához (1 óráig érvényes):\n{link}\n\nHa nem te kérted, hagyd figyelmen kívül ezt az emailt.\n\nÜdv,\nMelóstippek.hu csapat"
    );
    send_email(config, to, "Melóstippek.hu — Jelszó visszaállítás", &body).await
}
