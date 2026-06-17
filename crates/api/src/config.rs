use std::env;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub internal_secret: String,
    pub worker_url: String,
    pub kratos_public_url: String,
    pub mail_domain: String,
    pub blob_store_root: PathBuf,
    pub api_port: u16,
    pub cors_origins: Vec<String>,
    pub snowflake_machine_id: i32,
    pub snowflake_node_id: i32,
    /// Optional shared outbound email provider, configured from the environment.
    /// When unset, herald-api ships with no provider key and relies entirely on
    /// senders that end users register themselves.
    pub system_email: Option<SystemEmailConfig>,
}

/// Environment-provided system email sender. Resend takes precedence when both
/// a Resend key and SES credentials are present.
#[derive(Clone, Debug)]
pub enum SystemEmailConfig {
    Resend {
        api_key: String,
    },
    Ses {
        region: String,
        access_key_id: String,
        secret_access_key: String,
    },
}

impl SystemEmailConfig {
    fn from_env() -> Option<Self> {
        if let Ok(api_key) = env::var("RESEND_API_KEY") {
            if !api_key.trim().is_empty() {
                return Some(Self::Resend { api_key });
            }
        }

        let region = env::var("AWS_SES_REGION")
            .or_else(|_| env::var("AWS_REGION"))
            .ok();
        let access_key_id = env::var("AWS_ACCESS_KEY_ID").ok();
        let secret_access_key = env::var("AWS_SECRET_ACCESS_KEY").ok();
        if let (Some(region), Some(access_key_id), Some(secret_access_key)) =
            (region, access_key_id, secret_access_key)
        {
            if ![&region, &access_key_id, &secret_access_key]
                .iter()
                .any(|value| value.trim().is_empty())
            {
                return Some(Self::Ses {
                    region,
                    access_key_id,
                    secret_access_key,
                });
            }
        }

        None
    }
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            internal_secret: env::var("HERALD_INTERNAL_SECRET")
                .expect("HERALD_INTERNAL_SECRET must be set"),
            worker_url: env::var("HERALD_WORKER_URL").expect("HERALD_WORKER_URL must be set"),
            kratos_public_url: env::var("KRATOS_PUBLIC_URL")
                .unwrap_or_else(|_| "http://localhost:4433".to_owned()),
            mail_domain: env::var("MAIL_DOMAIN").unwrap_or_else(|_| "panit.dev".to_owned()),
            blob_store_root: env::var("BLOB_STORE_ROOT")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("./data/blobs")),
            api_port: env::var("API_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3001),
            cors_origins: env::var("CORS_ORIGIN")
                .ok()
                .map(|value| {
                    value
                        .split(',')
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),
            snowflake_machine_id: env::var("SNOWFLAKE_MACHINE_ID")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1),
            snowflake_node_id: env::var("SNOWFLAKE_NODE_ID")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1),
            system_email: SystemEmailConfig::from_env(),
        }
    }
}
