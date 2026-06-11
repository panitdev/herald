use async_trait::async_trait;
use bytes::Bytes;
use serde::Deserialize;
#[cfg(test)]
use std::{collections::HashMap, sync::Mutex};

use crate::error::AppError;

#[derive(Debug, Clone, Deserialize)]
pub struct UnprocessedItem {
    pub key: String,
}

#[async_trait]
pub trait InboundWorkerClient: Send + Sync {
    async fn list_unprocessed(&self) -> Result<Vec<UnprocessedItem>, AppError>;
    async fn get_unprocessed(&self, key: &str) -> Result<Bytes, AppError>;
    async fn delete_unprocessed(&self, key: &str) -> Result<(), AppError>;
}

pub struct HttpWorkerClient {
    http: reqwest::Client,
    worker_url: String,
    internal_secret: String,
}

impl HttpWorkerClient {
    pub fn new(http: reqwest::Client, worker_url: String, internal_secret: String) -> Self {
        Self {
            http,
            worker_url,
            internal_secret,
        }
    }
}

#[async_trait]
impl InboundWorkerClient for HttpWorkerClient {
    async fn list_unprocessed(&self) -> Result<Vec<UnprocessedItem>, AppError> {
        let items = self
            .http
            .get(format!("{}/internal/unprocessed", self.worker_url))
            .bearer_auth(&self.internal_secret)
            .send()
            .await?
            .error_for_status()?
            .json::<Vec<UnprocessedItem>>()
            .await?;
        Ok(items)
    }

    async fn get_unprocessed(&self, key: &str) -> Result<Bytes, AppError> {
        let bytes = self
            .http
            .get(format!("{}/internal/unprocessed/{}", self.worker_url, key))
            .bearer_auth(&self.internal_secret)
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?;
        Ok(bytes)
    }

    async fn delete_unprocessed(&self, key: &str) -> Result<(), AppError> {
        self.http
            .delete(format!("{}/internal/unprocessed/{}", self.worker_url, key))
            .bearer_auth(&self.internal_secret)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
}

/// In-memory mock for use in tests.
#[cfg(test)]
pub struct MockWorkerClient {
    items: Mutex<HashMap<String, Bytes>>,
}

#[cfg(test)]
impl MockWorkerClient {
    pub fn new() -> Self {
        Self {
            items: Mutex::new(HashMap::new()),
        }
    }

    pub fn seed(&self, key: impl Into<String>, raw: impl Into<Bytes>) {
        self.items.lock().unwrap().insert(key.into(), raw.into());
    }
}

#[cfg(test)]
#[async_trait]
impl InboundWorkerClient for MockWorkerClient {
    async fn list_unprocessed(&self) -> Result<Vec<UnprocessedItem>, AppError> {
        let items = self
            .items
            .lock()
            .unwrap()
            .keys()
            .map(|k| UnprocessedItem { key: k.clone() })
            .collect();
        Ok(items)
    }

    async fn get_unprocessed(&self, key: &str) -> Result<Bytes, AppError> {
        self.items
            .lock()
            .unwrap()
            .get(key)
            .cloned()
            .ok_or(AppError::NotFound)
    }

    async fn delete_unprocessed(&self, key: &str) -> Result<(), AppError> {
        self.items.lock().unwrap().remove(key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn mock_client_lifecycle() {
        let client = MockWorkerClient::new();
        client.seed("inbound/test-1.eml", b"raw mime 1".as_ref());
        client.seed("inbound/test-2.eml", b"raw mime 2".as_ref());

        let listed = client.list_unprocessed().await.unwrap();
        assert_eq!(listed.len(), 2);

        let raw = client.get_unprocessed("inbound/test-1.eml").await.unwrap();
        assert_eq!(raw.as_ref(), b"raw mime 1");

        client
            .delete_unprocessed("inbound/test-1.eml")
            .await
            .unwrap();
        let listed = client.list_unprocessed().await.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].key, "inbound/test-2.eml");

        let missing = client.get_unprocessed("inbound/test-1.eml").await;
        assert!(matches!(missing, Err(AppError::NotFound)));
    }
}
