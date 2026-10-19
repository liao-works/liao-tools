use crate::commands::tracking;
use crate::commands::tracking::excel;
use crate::models::tracking::{TrackingBatchResult, TrackingQueryRequest, TrackingRow};
use tauri::Emitter;

/// 批量轨迹查询（17TRACK 开放接口，用户自备 API Key）
#[tauri::command]
pub async fn tracking_batch_query(
    request: TrackingQueryRequest,
    window: tauri::Window,
) -> Result<TrackingBatchResult, String> {
    let api_key = request.api_key.trim().to_string();
    tracking::run_batch(&request.numbers, &api_key, |current, total| {
        let _ = window.emit(
            "tracking-progress",
            serde_json::json!({
                "current": current.min(total),
                "total": total
            }),
        );
    })
    .await
}

/// 导出轨迹查询结果到 Excel
#[tauri::command]
pub async fn tracking_export_results(
    rows: Vec<TrackingRow>,
    output_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || excel::export_results(&rows, &output_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
