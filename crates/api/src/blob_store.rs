use async_trait::async_trait;
use bytes::Bytes;
use std::{
    io::ErrorKind,
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use tokio::fs;

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct BlobObject {
    pub bytes: Bytes,
    pub content_type: String,
}

#[async_trait]
pub trait BlobStore: Send + Sync {
    async fn put(&self, key: &str, bytes: Bytes, content_type: &str) -> Result<(), AppError>;
    async fn get(&self, key: &str) -> Result<BlobObject, AppError>;
    async fn delete(&self, key: &str) -> Result<(), AppError>;
}

pub type DynBlobStore = Arc<dyn BlobStore>;

#[derive(Debug, Clone)]
pub struct FsBlobStore {
    root: PathBuf,
}

impl FsBlobStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    fn path_for_key(&self, key: &str) -> Result<PathBuf, AppError> {
        let mut path = self.root.clone();
        let key_path = Path::new(key);

        for component in key_path.components() {
            match component {
                Component::Normal(part) => path.push(part),
                _ => return Err(AppError::BadRequest("invalid blob key".into())),
            }
        }

        Ok(path)
    }

    fn meta_path_for_file(path: &Path) -> PathBuf {
        let mut meta = path.as_os_str().to_os_string();
        meta.push(".meta");
        PathBuf::from(meta)
    }
}

#[async_trait]
impl BlobStore for FsBlobStore {
    async fn put(&self, key: &str, bytes: Bytes, content_type: &str) -> Result<(), AppError> {
        let path = self.path_for_key(key)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        fs::write(&path, &bytes).await?;
        fs::write(Self::meta_path_for_file(&path), content_type.as_bytes()).await?;
        Ok(())
    }

    async fn get(&self, key: &str) -> Result<BlobObject, AppError> {
        let path = self.path_for_key(key)?;
        let bytes = fs::read(&path).await.map_err(|error| match error.kind() {
            ErrorKind::NotFound => AppError::NotFound,
            _ => AppError::Io(error),
        })?;

        let content_type = match fs::read_to_string(Self::meta_path_for_file(&path)).await {
            Ok(value) => value,
            Err(error) if error.kind() == ErrorKind::NotFound => {
                "application/octet-stream".to_owned()
            }
            Err(error) => return Err(AppError::Io(error)),
        };

        Ok(BlobObject {
            bytes: Bytes::from(bytes),
            content_type,
        })
    }

    async fn delete(&self, key: &str) -> Result<(), AppError> {
        let path = self.path_for_key(key)?;
        match fs::remove_file(&path).await {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(AppError::Io(error)),
        }
        match fs::remove_file(Self::meta_path_for_file(&path)).await {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(AppError::Io(error)),
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn round_trips_filesystem_blobs() {
        let root =
            std::env::temp_dir().join(format!("herald-api-blob-test-{}", std::process::id()));
        let store = FsBlobStore::new(&root);

        store
            .put(
                "raw/test.eml",
                Bytes::from_static(b"hello"),
                "message/rfc822",
            )
            .await
            .unwrap();

        let blob = store.get("raw/test.eml").await.unwrap();
        assert_eq!(blob.bytes.as_ref(), b"hello");
        assert_eq!(blob.content_type, "message/rfc822");

        store.delete("raw/test.eml").await.unwrap();
        assert!(matches!(
            store.get("raw/test.eml").await,
            Err(AppError::NotFound)
        ));

        let _ = fs::remove_dir_all(root).await;
    }
}
