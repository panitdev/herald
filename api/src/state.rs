use axum::extract::FromRef;

use crate::{config::Config, db::DbPool, ids::IdGen};

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub http: reqwest::Client,
    pub config: Config,
    pub ids: IdGen,
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

impl FromRef<AppState> for reqwest::Client {
    fn from_ref(s: &AppState) -> Self {
        s.http.clone()
    }
}
