use crate::commands::revcal::api::RevCalClient;
use crate::commands::revcal::batch::{run_batch, BatchConfig};
use crate::commands::revcal::excel::{read_codes, write_results};
use crate::models::revcal::{RevCalBatchResult, RevCalProduct, RevCalQueryResult};
use std::time::Duration;
use tauri::Emitter;

/// 单码查询（支持 ASIN/UPC/EAN/ISBN/标题关键词）
#[tauri::command]
pub async fn revcal_search(
    keywords: String,
    country_code: String,
) -> Result<Vec<RevCalProduct>, String> {
    let keywords = keywords.trim().to_string();
    if keywords.is_empty() {
        return Err("查询内容不能为空".to_string());
    }
    let client = RevCalClient::new()?;
    client.search(&keywords, &country_code).await
}

/// 批量查询：逐码顺序请求（约 0.8s/次 + 抖动），进度通过 revcal-batch-progress 事件上报
#[tauri::command]
pub async fn revcal_batch_search(
    codes: Vec<String>,
    country_code: String,
    window: tauri::Window,
) -> Result<RevCalBatchResult, String> {
    let client = RevCalClient::new()?;
    let result = run_batch(
        codes,
        country_code,
        |code: String, cc: String| {
            let client = &client;
            async move { client.search(&code, &cc).await }
        },
        BatchConfig {
            request_delay: Duration::from_millis(800),
        },
        |current, total, code, status| {
            let _ = window.emit(
                "revcal-batch-progress",
                serde_json::json!({
                    "current": current,
                    "total": total,
                    "code": code,
                    "status": status
                }),
            );
        },
    )
    .await;
    Ok(result)
}

/// 从 Excel 第一列读取查询码（跳过表头，过滤空白行）
#[tauri::command]
pub async fn revcal_read_excel_codes(input_path: String) -> Result<Vec<String>, String> {
    read_codes(&input_path).map_err(|e| e.to_string())
}

/// 将查询结果导出为 Excel 文件（split_dimensions=true 时尺寸拆分为长/宽/高/重量数值列）
#[tauri::command]
pub async fn revcal_export_excel(
    results: Vec<RevCalQueryResult>,
    output_path: String,
    split_dimensions: bool,
) -> Result<String, String> {
    if results.is_empty() {
        return Err("没有可导出的查询结果".to_string());
    }
    write_results(&output_path, &results, split_dimensions).map_err(|e| e.to_string())?;
    Ok(output_path)
}
