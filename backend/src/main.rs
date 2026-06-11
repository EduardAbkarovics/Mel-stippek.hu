mod config;
mod error;
mod middleware;
mod models;
mod routes;
mod services;
mod state;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{routing::get, Router};
use tower_http::{compression::CompressionLayer, cors::CorsLayer, trace::TraceLayer};

pub use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "melostippek=info,tower_http=warn".into()),
        )
        .init();

    let config = config::Config::from_env()?;
    tracing::info!("MongoDB kapcsolódás…");
    let mongo = services::mongo::MongoDb::connect(&config.mongodb_url).await?;
    tracing::info!("MongoDB OK (melostippek adatbázis)");

    let port = config.port;
    let cors = CorsLayer::new()
        .allow_origin(config.allowed_origins())
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PATCH,
            axum::http::Method::DELETE,
        ])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
        ]);

    let state = Arc::new(AppState {
        config,
        mongo,
        http: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()?,
        odds_cache: std::sync::Mutex::new(std::collections::HashMap::new()),
        rate_limits: std::sync::Mutex::new(std::collections::HashMap::new()),
    });

    // SimplePay havi automatikus megújítás ütemezője (12 óránként ellenőriz).
    {
        let state = state.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            loop {
                routes::payments::process_recurring_renewals(state.as_ref()).await;
                tokio::time::sleep(std::time::Duration::from_secs(12 * 3600)).await;
            }
        });
    }

    let app = Router::new()
        .route("/api/health", get(|| async { "ok" }))
        .merge(routes::auth::router())
        .merge(routes::payments::router())
        .merge(routes::tips::router())
        .merge(routes::track::router())
        .merge(routes::admin::router())
        .merge(routes::ai::router())
        .layer(cors)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Melóstippek.hu backend fut: http://localhost:{port}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}
