use axum::{extract::State, Json};

use crate::{
    auth::kratos::KratosIdentity,
    error::ApiResult,
    models::user::UserResponse,
    state::AppState,
};

pub async fn get_me(
    identity: KratosIdentity,
    State(state): State<AppState>,
) -> ApiResult<Json<UserResponse>> {
    let user = identity.resolve_user(&state).await?;
    Ok(Json(UserResponse::from(user)))
}
