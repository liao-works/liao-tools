use crate::commands::error::CommandError;
use super::excel::ExcelProcessor;
use super::scraper::AltaScraper;
use crate::models::alta::{AltaQueryResult, DatabaseInfo, ExcelStats, UpdateResult};
use crate::AppState;
use log::{error, info};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

/// 查询单个HS编码
#[tauri::command]
pub async fn query_hs_code(
    hs_code: String,
    match_length: Option<u8>,
    state: State<'_, AppState>,
) -> Result<AltaQueryResult, CommandError> {
    info!("查询HS编码: {}, 匹配位数: {:?}", hs_code, match_length);

    // 先检查数据库是否有数据
    let db = state.db.lock().map_err(|e| {
        error!("Failed to lock database: {}", e);
        CommandError::new("系统错误", "LOCK_ERROR")
    })?;

    let total_count = db.get_total_count().map_err(|e| {
        error!("获取数据库记录数失败: {}", e);
        CommandError::from(e)
    })?;

    if total_count == 0 {
        return Err(CommandError::new(
            "数据库为空，请先在\"数据管理\"标签中更新禁运数据",
            "DATABASE_EMPTY"
        ));
    }

    drop(db); // 释放数据库锁

    let matcher = state.matcher.lock().map_err(|e| {
        error!("Failed to lock matcher: {}", e);
        CommandError::new("系统错误", "LOCK_ERROR")
    })?;

    let match_result = matcher
        .match_code(&hs_code, match_length)
        .map_err(|e| {
            error!("匹配失败: {}", e);
            CommandError::from(e)
        })?;

    let query_result = matcher.to_query_result(&hs_code, &match_result);

    Ok(query_result)
}

/// 更新Alta数据库
#[tauri::command]
pub async fn update_alta_database(
    state: State<'_, AppState>,
) -> Result<UpdateResult, CommandError> {
    info!("开始更新Alta数据库");

    // 创建爬虫
    let scraper = AltaScraper::new();

    // 获取数据（异步）
    let items = scraper.fetch_all_data().await.map_err(|e| {
        error!("爬取数据失败: {}", e);
        CommandError::new(format!("爬取数据失败: {}", e), "SCRAPER_ERROR")
    })?;

    if items.is_empty() {
        return Err(CommandError::new(
            "未获取到任何数据，请检查网络连接或网站是否可访问",
            "NO_DATA",
        ));
    }

    // 更新数据库
    let db = state.db.lock().map_err(|e| {
        error!("Failed to lock database: {}", e);
        CommandError::new("系统错误", "LOCK_ERROR")
    })?;

    let count = db.update_forbidden_items(items).map_err(|e| {
        error!("更新数据库失败: {}", e);
        CommandError::from(e)
    })?;

    info!("数据库更新成功，共 {} 条记录", count);

    Ok(UpdateResult {
        success: true,
        items_count: count,
        message: format!("成功更新 {} 条禁运数据", count),
    })
}

/// 批量处理Excel文件
#[tauri::command]
pub async fn batch_process_excel(
    input_path: String,
    match_length: Option<u8>,
    state: State<'_, AppState>,
) -> Result<ExcelStats, CommandError> {
    info!("开始批量处理Excel: {}", input_path);

    // 先检查数据库是否有数据
    let db = state.db.lock().map_err(|e| {
        error!("Failed to lock database: {}", e);
        CommandError::new("系统错误", "LOCK_ERROR")
    })?;

    let total_count = db.get_total_count().map_err(|e| {
        error!("获取数据库记录数失败: {}", e);
        CommandError::from(e)
    })?;

    if total_count == 0 {
        return Err(CommandError::new(
            "数据库为空，请先在\"数据管理\"标签中更新禁运数据",
            "DATABASE_EMPTY"
        ));
    }

    drop(db); // 释放数据库锁

    let input = PathBuf::from(&input_path);

    // 生成输出文件路径
    let output = if let Some(parent) = input.parent() {
        let stem = input
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");
        parent.join(format!("{}_禁运标记.xlsx", stem))
    } else {
        PathBuf::from(format!("{}_禁运标记.xlsx", input_path))
    };

    // 创建Excel处理器
    let matcher_arc = {
        let _guard = state.matcher.lock().map_err(|e| {
            error!("Failed to lock matcher: {}", e);
            CommandError::new("系统错误", "LOCK_ERROR")
        })?;
        // 克隆 Arc，不是 MutexGuard
        Arc::clone(&state.matcher)
    };

    let processor = ExcelProcessor::new(matcher_arc);

    // 验证文件
    processor.validate_excel_file(&input).map_err(|e| {
        error!("文件验证失败: {}", e);
        CommandError::new(format!("文件验证失败: {}", e), "VALIDATION_ERROR")
    })?;

    // 处理Excel
    let stats = processor
        .process_excel(&input, &output, match_length)
        .map_err(|e| {
            error!("处理Excel失败: {}", e);
            CommandError::new(format!("处理失败: {}", e), "PROCESS_ERROR")
        })?;

    info!("Excel处理完成: {:?}", stats);

    Ok(stats)
}

/// 获取数据库信息
#[tauri::command]
pub async fn get_database_info(
    state: State<'_, AppState>,
) -> Result<DatabaseInfo, CommandError> {
    let db = state.db.lock().map_err(|e| {
        error!("Failed to lock database: {}", e);
        CommandError::new("系统错误", "LOCK_ERROR")
    })?;

    let db_path = state.db_path.lock().map_err(|e| {
        error!("Failed to lock db_path: {}", e);
        CommandError::new("系统错误", "LOCK_ERROR")
    })?;

    let info = db.get_database_info(&db_path).map_err(|e| {
        error!("获取数据库信息失败: {}", e);
        CommandError::from(e)
    })?;

    Ok(info)
}

/// 下载Excel模板
#[tauri::command]
pub async fn download_template(app_handle: tauri::AppHandle) -> Result<String, CommandError> {
    use tauri::Manager;

    info!("生成Excel模板");

    // 获取下载目录
    let downloads_dir = app_handle
        .path()
        .download_dir()
        .map_err(|e| {
            error!("无法获取下载目录: {}", e);
            CommandError::new("无法获取下载目录", "PATH_ERROR")
        })?;

    let template_path = downloads_dir.join("Alta查询模板.xlsx");

    // 生成模板
    ExcelProcessor::generate_template(&template_path).map_err(|e| {
        error!("生成模板失败: {}", e);
        CommandError::from(e)
    })?;

    Ok(template_path.to_string_lossy().to_string())
}

/// 测试数据库连接
#[tauri::command]
pub async fn test_database_connection(
    state: State<'_, AppState>,
) -> Result<bool, CommandError> {
    let db = state.db.lock().map_err(|e| {
        error!("Failed to lock database: {}", e);
        CommandError::new("系统错误", "LOCK_ERROR")
    })?;

    // 尝试获取总数来测试连接
    match db.get_total_count() {
        Ok(_) => Ok(true),
        Err(e) => {
            error!("数据库连接测试失败: {}", e);
            Ok(false)
        }
    }
}

/// 测试Alta网站连接
#[tauri::command]
pub async fn test_alta_connection() -> Result<bool, CommandError> {
    let scraper = AltaScraper::new();
    Ok(scraper.test_connection().await)
}
