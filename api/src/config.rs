use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub kratos_public_url: String,
    pub kratos_browser_url: String,
    pub api_port: u16,
    pub frontend_origin: String,
    pub snowflake_machine_id: i32,
    pub snowflake_node_id: i32,
}

impl Config {
    pub fn from_env() -> Self {
        let kratos_public_url =
            env::var("KRATOS_PUBLIC_URL").unwrap_or_else(|_| "http://localhost:4433".into());
        let frontend_origin =
            env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into());

        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            kratos_browser_url: env::var("KRATOS_BROWSER_URL")
                .unwrap_or_else(|_| kratos_public_url.clone()),
            kratos_public_url,
            api_port: env::var("API_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(8080),
            frontend_origin,
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
