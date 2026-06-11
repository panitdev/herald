use axum::extract::FromRef;
use std::sync::Arc;

use crate::{config::Config, db::DbPool, ids::IdGen, worker_client::InboundWorkerClient};

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub config: Config,
    pub ids: IdGen,
    pub http: reqwest::Client,
    pub worker: Arc<dyn InboundWorkerClient>,
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
