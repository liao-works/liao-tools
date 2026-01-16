use crate::commands::tax::database::TaxDatabase;
use crate::commands::tax::downloader::TaxDataDownloader;
use crate::commands::tax::excel::TaxExcelProcessor;
use crate::commands::tax::query::TaxQuery;
use crate::models::tax::{BatchResult, TaxTariff, TaxVersionInfo};
use tauri::Emitter;
use tauri_plugin_opener::OpenerExt;

/// 精确查询税率
#[tauri::command]
pub async fn tax_exact_search(
    code: String,
    app_handle: tauri::AppHandle,
) -> Result<Option<TaxTariff>, String> {
    let db = TaxDatabase::new(&app_handle).map_err(|e| e.to_string())?;
    
    // 检查数据库是否有数据
    db.ensure_has_data().map_err(|e| e.to_string())?;
    
    TaxQuery::exact_search(&db, &code).map_err(|e| e.to_string())
}

/// 模糊查询税率
#[tauri::command]
pub async fn tax_fuzzy_search(
    query: String,
    limit: Option<usize>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<TaxTariff>, String> {
    let db = TaxDatabase::new(&app_handle).map_err(|e| e.to_string())?;
    
    // 检查数据库是否有数据
    db.ensure_has_data().map_err(|e| e.to_string())?;
    
    let limit = limit.unwrap_or(10);
    TaxQuery::fuzzy_search(&db, &query, limit).map_err(|e| e.to_string())
}

/// 批量查询（Excel文件）
#[tauri::command]
pub async fn tax_batch_query(
    input_path: String,
    app_handle: tauri::AppHandle,
    window: tauri::Window,
) -> Result<BatchResult, String> {
    let db = TaxDatabase::new(&app_handle).map_err(|e| e.to_string())?;
    
    // 检查数据库是否有数据
    db.ensure_has_data().map_err(|e| e.to_string())?;
    
    // 生成输出文件路径
    let input_path_obj = std::path::Path::new(&input_path);
    let output_filename = format!(
        "{}_查询结果.xlsx",
        input_path_obj
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("tax_query")
    );
    let output_path = input_path_obj
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join(&output_filename);
    
    let output_path_str = output_path.to_string_lossy().to_string();
    
    // 处理批量查询
    let result = TaxExcelProcessor::process_batch(&db, &input_path, &output_path_str, |current, total| {
        // 发送进度事件
        let _ = window.emit(
            "batch-progress",
            serde_json::json!({
                "current": current,
                "total": total
            }),
        );
    })
    .map_err(|e| e.to_string())?;
    
    Ok(result)
}

/// 下载Excel模板
#[tauri::command]
pub async fn tax_download_template(output_path: String) -> Result<(), String> {
    TaxExcelProcessor::generate_template(&output_path).map_err(|e| e.to_string())
}

/// 检查更新
#[tauri::command]
pub async fn tax_check_update(app_handle: tauri::AppHandle) -> Result<TaxVersionInfo, String> {
    TaxDataDownloader::check_update(&app_handle)
        .await
        .map_err(|e| e.to_string())
}

/// 下载并安装更新
#[tauri::command]
pub async fn tax_download_update(
    app_handle: tauri::AppHandle,
    window: tauri::Window,
) -> Result<bool, String> {
    TaxDataDownloader::download_and_install(&app_handle, |downloaded, total| {
        // 发送进度事件
        let _ = window.emit(
            "download-progress",
            serde_json::json!({
                "downloaded": downloaded,
                "total": total
            }),
        );
    })
    .await
    .map_err(|e| e.to_string())
}

/// 打开URL（使用系统默认浏览器）
#[tauri::command]
pub async fn tax_open_url(
    url: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    app_handle
        .opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}
