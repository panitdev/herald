use diesel::Connection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod auth;
mod config;
mod db;
mod error;
mod ids;
mod mail;
mod models;
mod routes;
mod schema;
mod state;
mod worker_client;

use mail::process_inbound_mail;
use state::AppState;
use worker_client::{HttpWorkerClient, InboundWorkerClient};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "herald_server=debug,tower_http=debug".parse().unwrap()),
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

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("failed to build HTTP client");

    let worker: Arc<dyn InboundWorkerClient> = Arc::new(HttpWorkerClient::new(
        http.clone(),
        config.worker_url.clone(),
        config.internal_secret.clone(),
    ));

    let state = AppState {
        db,
        config: config.clone(),
        ids,
        http,
        worker,
    };

    // Run recovery pipeline on startup
    tokio::spawn(recover_from_r2(state.clone()));

    let app = routes::router()
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.api_port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind");
    tracing::info!("listening on {addr}");
    axum::serve(listener, app).await.unwrap();
}

/// On startup: fetch all R2 objects that Axum may have missed during downtime and replay them.
async fn recover_from_r2(state: AppState) {
    tracing::info!("starting R2 recovery scan");

    let items = match state.worker.list_unprocessed().await {
        Ok(items) => items,
        Err(e) => {
            tracing::warn!(error = %e, "recovery: failed to list R2 items");
            return;
        }
    };

    tracing::info!(count = items.len(), "recovery: found R2 items");

    for item in items {
        let exists = exists_by_r2_key(&state, &item.key).await;

        if exists {
            // Already persisted (POST to Axum succeeded) but R2 object was never deleted.
            // This is the "processed_at set, r2_key still non-null" case — retry the delete.
            if let Err(e) = state.worker.delete_unprocessed(&item.key).await {
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
        let raw = match state.worker.get_unprocessed(&item.key).await {
            Ok(raw) => raw,
            Err(e) => {
                tracing::warn!(key = %item.key, error = %e, "recovery: failed to fetch R2 object");
                continue;
            }
        };

        let mail_id = match insert_recovered(&state, &raw, &item.key).await {
            Ok(id) => id,
            Err(e) => {
                tracing::error!(key = %item.key, error = %e, "recovery: failed to insert mail");
                continue;
            }
        };

        tracing::info!(mail_id, key = %item.key, "recovery: replaying missed mail");
        tokio::spawn(process_inbound_mail(state.clone(), mail_id));
    }

    tracing::info!("R2 recovery scan complete");
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
) -> Result<i64, error::AppError> {
    use diesel_async::RunQueryDsl;

    let mut conn = state.db.get().await?;
    let new_mail = models::raw_inbound_mail::NewRawInboundMail {
        id: state.next_id(),
        raw_mime: raw,
        r2_key: Some(r2_key),
    };
    let id = diesel::insert_into(schema::raw_inbound_mails::table)
        .values(&new_mail)
        .returning(schema::raw_inbound_mails::id)
        .get_result::<i64>(&mut conn)
        .await?;
    Ok(id)
}
