use axum::extract::FromRef;
use std::sync::Arc;

use crate::{
    blob_store::BlobStore, config::Config, db::DbPool, email::DynEmailSender, ids::IdGen,
    realtime::RealtimeHub, worker_client::InboundWorkerClient,
};

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub config: Config,
    pub ids: IdGen,
    pub http: reqwest::Client,
    pub blob_store: Arc<dyn BlobStore>,
    pub worker: Arc<dyn InboundWorkerClient>,
    pub realtime: RealtimeHub,
    /// Shared email sender built from the environment, if configured. Used as a
    /// fallback when a user has no sender of their own.
    pub system_email: Option<DynEmailSender>,
}

impl AppState {
    pub fn next_id(&self) -> i64 {
        self.ids.next()
    }
}

impl FromRef<AppState> for DbPool {
    fn from_ref(s: &AppState) -> Self {
        s.db.clone()
    }
}

impl FromRef<AppState> for Config {
    fn from_ref(s: &AppState) -> Self {
        s.config.clone()
    }
}
