use axum::extract::ws::{Message, WebSocket};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio::sync::broadcast;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RealtimeEvent {
    Sync { cursor: String },
}

#[derive(Debug, Clone, Default)]
pub struct RealtimeHub {
    channels: Arc<Mutex<HashMap<i64, broadcast::Sender<RealtimeEvent>>>>,
}

impl RealtimeHub {
    pub fn subscribe(&self, user_id: i64) -> broadcast::Receiver<RealtimeEvent> {
        self.sender(user_id).subscribe()
    }

    pub fn notify_sync(&self, user_id: i64, cursor: i64) {
        let _ = self.sender(user_id).send(RealtimeEvent::Sync {
            cursor: cursor.to_string(),
        });
    }

    fn sender(&self, user_id: i64) -> broadcast::Sender<RealtimeEvent> {
        let mut channels = self.channels.lock().unwrap();
        channels
            .entry(user_id)
            .or_insert_with(|| {
                let (tx, _) = broadcast::channel(128);
                tx
            })
            .clone()
    }
}

pub async fn serve_socket(mut socket: WebSocket, mut rx: broadcast::Receiver<RealtimeEvent>) {
    loop {
        tokio::select! {
            event = rx.recv() => {
                let Ok(event) = event else {
                    continue;
                };
                let Ok(payload) = serde_json::to_string(&event) else {
                    continue;
                };
                if socket.send(Message::Text(payload.into())).await.is_err() {
                    break;
                }
            }
            message = socket.recv() => {
                match message {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(payload))) => {
                        if socket.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }
}
