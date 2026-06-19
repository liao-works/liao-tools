use super::database::HistoryDatabase;
use crate::models::update_history::{ChangeDetail, SessionSummary};

/// 查询更新历史列表
#[tauri::command]
pub async fn get_update_sessions(
    module: Option<String>,
    limit: Option<i64>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<SessionSummary>, String> {
    let db = HistoryDatabase::new(&app_handle).map_err(|e| e.to_string())?;
    db.list_sessions(module.as_deref(), limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

/// 查询某次更新的明细
#[tauri::command]
pub async fn get_update_details(
    session_id: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<ChangeDetail>, String> {
    let db = HistoryDatabase::new(&app_handle).map_err(|e| e.to_string())?;
    db.get_details(&session_id).map_err(|e| e.to_string())
}

/// 清理历史（before 为 ISO 时间字符串则清理更早的，None 清空全部）
#[tauri::command]
pub async fn clear_update_history(
    before: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<usize, String> {
    let db = HistoryDatabase::new(&app_handle).map_err(|e| e.to_string())?;
    db.clear(before.as_deref()).map_err(|e| e.to_string())
}
