use axum::{
    extract::{Path, State},
    Json,
};
use diesel::{ExpressionMethods, QueryDsl, SelectableHelper};
use diesel_async::RunQueryDsl;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    auth::AuthUser,
    error::{ApiResult, AppError},
    models::{
        drop::{Drop, NewDrop},
        sync_event::NewSyncEvent,
    },
    schema::{drops, sync_events},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct CreateDropRequest {
    pub title: Option<String>,
    pub items: Value,
}

#[derive(Debug, Serialize)]
pub struct DropResponse {
    pub drop: Drop,
}

pub async fn create_drop(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(input): Json<CreateDropRequest>,
) -> ApiResult<Json<DropResponse>> {
    let mut conn = state.db.get().await?;
    let drop_id = state.next_id();

    let new_drop = NewDrop {
        id: drop_id,
        user_id: user.id,
        title: input.title.as_deref(),
        items: &input.items,
    };

    let drop = diesel::insert_into(drops::table)
        .values(&new_drop)
        .returning(Drop::as_returning())
        .get_result(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "drops.create.insert"))?;

    let event_id = state.next_id();
    let event = NewSyncEvent {
        id: event_id,
        user_id: user.id,
        object_type: "drop".to_owned(),
        object_id: drop_id,
        op: "upsert".to_owned(),
        data_json: Some(json!(drop)),
    };

    diesel::insert_into(sync_events::table)
        .values(&event)
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "drops.create.sync_event"))?;

    state.realtime.notify_sync(user.id, event_id);

    Ok(Json(DropResponse { drop }))
}

pub async fn delete_drop(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<i64>,
) -> ApiResult<Json<Value>> {
    let mut conn = state.db.get().await?;

    let deleted = diesel::delete(
        drops::table
            .filter(drops::id.eq(id))
            .filter(drops::user_id.eq(user.id)),
    )
    .execute(&mut conn)
    .await
    .map_err(|err| AppError::db(err, "drops.delete.delete"))?;

    if deleted == 0 {
        return Err(AppError::NotFound);
    }

    let event_id = state.next_id();
    let event = NewSyncEvent {
        id: event_id,
        user_id: user.id,
        object_type: "drop".to_owned(),
        object_id: id,
        op: "delete".to_owned(),
        data_json: None,
    };

    diesel::insert_into(sync_events::table)
        .values(&event)
        .execute(&mut conn)
        .await
        .map_err(|err| AppError::db(err, "drops.delete.sync_event"))?;

    state.realtime.notify_sync(user.id, event_id);

    Ok(Json(json!({ "ok": true })))
}
