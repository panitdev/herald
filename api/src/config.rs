use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub internal_secret: String,
    pub worker_url: String,
    pub api_port: u16,
    pub snowflake_machine_id: i32,
    pub snowflake_node_id: i32,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            internal_secret: env::var("HERALD_INTERNAL_SECRET")
                .expect("HERALD_INTERNAL_SECRET must be set"),
            worker_url: env::var("HERALD_WORKER_URL").expect("HERALD_WORKER_URL must be set"),
            api_port: env::var("API_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3001),
            snowflake_machine_id: env::var("SNOWFLAKE_MACHINE_ID")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1),
            snowflake_node_id: env::var("SNOWFLAKE_NODE_ID")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1),
        }
    }
}
