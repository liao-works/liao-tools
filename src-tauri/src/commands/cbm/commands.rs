use crate::commands::cbm::{self, excel::CbmExcelProcessor};
use crate::models::cbm::{
    CbmBatchParams, CbmBatchResult, CbmLoadingRequest, CbmLoadingResult, CbmRequest, CbmResult,
};
use tauri::Emitter;

/// 体积 / 计费重试算（纯本地计算）
#[tauri::command]
pub async fn cbm_calculate(request: CbmRequest) -> Result<CbmResult, String> {
    tauri::async_runtime::spawn_blocking(move || cbm::calculate(&request))
        .await
        .map_err(|e| e.to_string())?
}

/// 单规格装柜试算（纯本地简化估算）
#[tauri::command]
pub async fn cbm_loading_estimate(request: CbmLoadingRequest) -> Result<CbmLoadingResult, String> {
    tauri::async_runtime::spawn_blocking(move || cbm::calc_loading(&request))
        .await
        .map_err(|e| e.to_string())?
}

/// 下载批量试算 Excel 模板
#[tauri::command]
pub async fn cbm_template(output_path: String) -> Result<(), String> {
    CbmExcelProcessor::generate_template(&output_path).map_err(|e| e.to_string())
}

/// 批量体积 / 计费重试算（Excel 文件）
#[tauri::command]
pub async fn cbm_batch(
    input_path: String,
    params: CbmBatchParams,
    window: tauri::Window,
) -> Result<CbmBatchResult, String> {
    let input_path_obj = std::path::Path::new(&input_path);
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M").to_string();
    let output_filename = format!(
        "{}_计费重试算_{}.xlsx",
        input_path_obj
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("cbm"),
        timestamp
    );
    let output_path = input_path_obj
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join(&output_filename);
    let output_path_str = output_path.to_string_lossy().to_string();

    tauri::async_runtime::spawn_blocking(move || {
        CbmExcelProcessor::process_batch(&input_path, &output_path_str, &params, |current, total| {
            let _ = window.emit(
                "cbm-batch-progress",
                serde_json::json!({
                    "current": current,
                    "total": total
                }),
            );
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
