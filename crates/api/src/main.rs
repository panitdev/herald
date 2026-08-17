use diesel::Connection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::sync::Arc;
use surge::AuthProvider;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod addresses;
mod auth;
mod blob_store;
mod config;
mod db;
mod email;
mod error;
mod ids;
mod mail;
mod mail_parser;
mod mailboxes;
mod models;
mod realtime;
mod receivers;
mod routes;
mod schema;
mod state;
mod worker_client;
mod workspaces;

use blob_store::{DynBlobStore, FsBlobStore};
use config::{Config, SystemEmailConfig};
use email::{build_sender, DynEmailSender, EmailProvider};
use mail::{ingest_raw_mail, process_inbound_mail, requeue_pending_inbound_mail};
use serde_json::json;
use state::AppState;
use worker_client::{HttpWorkerFactory, InboundWorkerFactory};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "herald_api=debug,tower_http=debug".parse().unwrap()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = config::Config::from_env();

    {
        let mut sync_conn = diesel::PgConnection::establish(&config.database_url)
            .expect("failed to connect to Postgres for migrations");
        sync_conn
            .run_pending_migrations(MIGRATIONS)
            .expect("failed to run database migrations");
        tracing::info!("migrations applied");
    }

    let db = db::init_pool(&config.database_url).await;
    let ids = ids::IdGen::new(config.snowflake_machine_id, config.snowflake_node_id);
    let blob_store: DynBlobStore = Arc::new(FsBlobStore::new(config.blob_store_root.clone()));

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("failed to build HTTP client");

    let workers: Arc<dyn InboundWorkerFactory> = Arc::new(HttpWorkerFactory::new(http.clone()));

    let system_email = build_system_email_sender(&config, &http);

    let auth_setup = build_auth(&config).await;

    let state = AppState {
        db,
        config: config.clone(),
        ids,
        http,
        blob_store,
        workers,
        realtime: realtime::RealtimeHub::default(),
        system_email,
        auth: auth_setup.provider,
    };

    // The system workspace owns the deployment receiver and is what makes every
    // user a member of it, so it has to exist before the receiver does.
    let system_workspace = workspaces::ensure_system_workspace(&state)
        .await
        .expect("failed to provision the system workspace");
    tracing::info!(
        workspace_id = system_workspace.id,
        "system workspace ready"
    );

    // The deployment-wide receiver must exist before anything replays mail:
    // legacy raw rows and the bundled Cloudflare worker both resolve to it.
    // Fatal like migrations: without it, legacy mail and the bundled worker have
    // no receiver to resolve to and inbound delivery silently stops.
    let system_receiver = receivers::ensure_system_receiver(&state)
        .await
        .expect("failed to provision the system email receiver");
    tracing::info!(
        receiver_id = system_receiver.id,
        mail_domain = ?system_receiver.mail_domain,
        "system email receiver ready"
    );

    tokio::spawn(requeue_pending_inbound_mail(state.clone()));

    // Run recovery pipeline on startup
    tokio::spawn(recover_from_r2(state.clone()));

    let cors_origins = config
        .cors_origins
        .iter()
        .map(|origin| origin.parse().expect("invalid CORS origin"))
        .collect::<Vec<_>>();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(cors_origins))
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PATCH,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            // BrowserRouter's CSRF-guarded mutations (logout, factor management)
            // send this header; the outer CORS layer must allow it in preflights.
            axum::http::HeaderName::from_static("x-surge-csrf"),
        ])
        .allow_credentials(true);

    let app = routes::router()
        .with_state(state)
        .merge(auth_setup.surge_router)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let addr = format!("0.0.0.0:{}", config.api_port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind");
    tracing::info!("listening on {addr}");
    // Surge's browser router keys rate limits on the peer address, and in
    // remote mode forwards it upstream as `X-Surge-Client-Ip`; neither works
    // without ConnectInfo in the request extensions.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .unwrap();
}

struct AuthSetup {
    provider: Arc<dyn surge::AuthProvider>,
    /// Browser-facing `/v1` perimeter. Every provider builds one now: embedded
    /// runs the handlers locally, remote reverse-proxies them to the upstream
    /// surge-server, and the test provider falls back to Surge's 501 stub.
    surge_router: axum::Router,
}

async fn build_auth(config: &Config) -> AuthSetup {
    let session_ttl = std::time::Duration::from_secs(config.surge_session_ttl_hours * 3600);

    match &config.surge_mode {
        #[cfg(feature = "test-provider")]
        config::SurgeMode::Test => {
            let provider = surge::test(surge::TestConfig::default())
                .expect("failed to build test auth provider");
            let surge_router =
                Arc::clone(&provider).browser_router(browser_config(config, session_ttl));

            AuthSetup { provider, surge_router }
        }
        config::SurgeMode::Remote { url, service_token } => {
            let provider = surge::remote(surge::RemoteConfig {
                base_url: url.parse().expect("invalid SURGE_URL"),
                service_token: secrecy::SecretString::from(service_token.clone()),
                cache_ttl: std::time::Duration::from_secs(30),
                cache_max_entries: 10_000,
                timeout: std::time::Duration::from_secs(3),
            })
            .await
            .expect("failed to build surge remote provider");

            // Reverse proxy onto upstream's perimeter. Requires the service
            // token to carry the `browser_proxy` grant alongside `introspect`,
            // otherwise upstream rejects the `X-Surge-Client-Ip` this states
            // and rate-limits our whole user base under herald's own address.
            let surge_router =
                Arc::clone(&provider).browser_router(browser_config(config, session_ttl));

            tracing::info!("surge remote provider with proxied browser router mounted");

            AuthSetup { provider, surge_router }
        }
        config::SurgeMode::Embedded { pepper } => {
            let embedded = surge::EmbeddedProvider::new(surge::EmbeddedConfig {
                database_url: secrecy::SecretString::from(config.database_url.clone()),
                pepper: secrecy::SecretString::from(pepper.clone()),
                session_ttl,
            })
            .await
            .expect("failed to build surge embedded provider");

            let engine = embedded.engine();
            let embedded = Arc::new(embedded);

            let rate_limiter = Arc::new(surge::router::PostgresRateLimiter::new(
                engine,
                surge::router::RateLimitConfig::default(),
            ));

            // Mounting this also starts Surge's 15-minute maintenance sweep.
            let surge_router = Arc::clone(&embedded).browser_router(
                surge::router::BrowserRouterConfig {
                    rate_limiter: Some(rate_limiter),
                    return_origins: Some(config.cors_origins.clone()),
                    registration: Some(surge::router::RegistrationMode::Open),
                    factor_policy: Some(surge::router::FactorPolicy::None),
                    allow_inline: Some(true),
                    ..browser_config(config, session_ttl)
                },
            );

            tracing::info!("surge embedded provider with browser router mounted");

            AuthSetup { provider: embedded, surge_router }
        }
    }
}

/// The fields every mode shares. Embedded-only knobs are left `None` here and
/// filled in by the embedded branch; `RemoteProvider` ignores them entirely.
fn browser_config(
    config: &Config,
    session_ttl: std::time::Duration,
) -> surge::router::BrowserRouterConfig {
    let auth_ui_origin = config
        .cors_origins
        .first()
        .cloned()
        .expect("CORS_ORIGIN must be set to mount the surge browser router");

    surge::router::BrowserRouterConfig {
        cookie_domain: config.surge_cookie_domain.clone(),
        session_ttl,
        auth_ui_origin,
        session_cors_origins: config.cors_origins.clone(),
        rate_limiter: None,
        return_origins: None,
        registration: None,
        factor_policy: None,
        allow_inline: None,
        oauth_bridge: None,
        maintenance_interval: None,
    }
}

/// Build the optional shared email sender from environment configuration.
fn build_system_email_sender(config: &Config, http: &reqwest::Client) -> Option<DynEmailSender> {
    let system = config.system_email.as_ref()?;
    let (provider, sender_config, secret) = match system {
        SystemEmailConfig::Resend { api_key } => (
            EmailProvider::Resend,
            json!({}),
            json!({ "api_key": api_key }),
        ),
        SystemEmailConfig::Ses {
            region,
            access_key_id,
            secret_access_key,
        } => (
            EmailProvider::Ses,
            json!({ "region": region }),
            json!({
                "access_key_id": access_key_id,
                "secret_access_key": secret_access_key,
            }),
        ),
    };

    match build_sender(http.clone(), provider, &sender_config, Some(&secret)) {
        Ok(sender) => {
            tracing::info!(provider = provider.as_str(), "system email sender configured");
            Some(sender)
        }
        Err(error) => {
            tracing::warn!(error = %error, "failed to build system email sender");
            None
        }
    }
}

/// On startup: fetch any fallback-staged R2 objects that Axum may have missed
/// during downtime and replay them. Every registered receiver stages into its
/// own bucket, so the scan runs once per receiver that exposes an endpoint.
async fn recover_from_r2(state: AppState) {
    use diesel::{ExpressionMethods, QueryDsl, SelectableHelper};
    use diesel_async::RunQueryDsl;

    let receivers_to_scan = {
        let Ok(mut conn) = state.db.get().await else {
            tracing::warn!("recovery: no database connection; skipping scan");
            return;
        };
        match schema::email_receivers::table
            .filter(schema::email_receivers::is_active.eq(true))
            .select(models::email_receiver::EmailReceiverRecord::as_select())
            .load(&mut conn)
            .await
        {
            Ok(rows) => rows,
            Err(error) => {
                tracing::warn!(error = %error, "recovery: failed to list receivers");
                return;
            }
        }
    };

    for receiver in receivers_to_scan {
        let Some(worker) = receivers::worker_client(&state, &receiver) else {
            continue;
        };
        recover_receiver_from_r2(&state, &receiver, worker.as_ref()).await;
    }
}

async fn recover_receiver_from_r2(
    state: &AppState,
    receiver: &models::email_receiver::EmailReceiverRecord,
    worker: &dyn worker_client::InboundWorkerClient,
) {
    tracing::info!(receiver_id = receiver.id, "starting R2 recovery scan");

    let items = match worker.list_unprocessed().await {
        Ok(items) => items,
        Err(e) => {
            tracing::warn!(receiver_id = receiver.id, error = %e, "recovery: failed to list R2 items");
            return;
        }
    };

    tracing::info!(receiver_id = receiver.id, count = items.len(), "recovery: found R2 items");

    for item in items {
        let exists = exists_by_r2_key(state, &item.key).await;

        if exists {
            // Mail is already persisted locally, so the fallback R2 object can be removed.
            // This covers both delete retries and restart races after recovery inserted the row.
            if let Err(e) = worker.delete_unprocessed(&item.key).await {
                tracing::warn!(
                    key = %item.key,
                    error = %e,
                    "recovery: failed to delete orphaned R2 object"
                );
            } else {
                tracing::debug!(key = %item.key, "recovery: cleaned up orphaned R2 object");
            }
            continue;
        }

        // POST to Axum failed during original delivery — fetch and replay.
        let raw = match worker.get_unprocessed(&item.key).await {
            Ok(raw) => raw,
            Err(e) => {
                tracing::warn!(key = %item.key, error = %e, "recovery: failed to fetch R2 object");
                continue;
            }
        };

        let mail_id = match insert_recovered(state, &raw, &item.key, receiver.id).await {
            Ok(id) => id,
            Err(e) => {
                tracing::error!(key = %item.key, error = %e, "recovery: failed to insert mail");
                continue;
            }
        };

        tracing::info!(mail_id, key = %item.key, "recovery: replaying missed mail");
        tokio::spawn(process_inbound_mail(state.clone(), mail_id));
    }

    tracing::info!(receiver_id = receiver.id, "R2 recovery scan complete");
}

async fn exists_by_r2_key(state: &AppState, key: &str) -> bool {
    use diesel::ExpressionMethods;
    use diesel::QueryDsl;
    use diesel_async::RunQueryDsl;

    let Ok(mut conn) = state.db.get().await else {
        return false;
    };
    let result: Result<i64, _> = schema::raw_inbound_mails::table
        .filter(schema::raw_inbound_mails::r2_key.eq(key))
        .select(schema::raw_inbound_mails::id)
        .first(&mut conn)
        .await;
    result.is_ok()
}

async fn insert_recovered(
    state: &AppState,
    raw: &[u8],
    r2_key: &str,
    receiver_id: i64,
) -> Result<i64, error::AppError> {
    ingest_raw_mail(
        state,
        bytes::Bytes::copy_from_slice(raw),
        Some(r2_key),
        Some(receiver_id),
    )
    .await
}
