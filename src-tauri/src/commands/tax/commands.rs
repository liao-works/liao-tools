use crate::commands::tax::database::TaxDatabase;
use crate::commands::tax::downloader::TaxDataDownloader;
use crate::commands::tax::excel::TaxExcelProcessor;
use crate::commands::tax::query::TaxQuery;
use crate::commands::tax::scraper::TaxScraper;
use crate::commands::tax::preview::{self, PreviewSummary, PreviewRate};
use crate::commands::tax::signed::{self, SignedReviewResult};
use crate::commands::tax::ni_review::{self, NiReviewReport};
use crate::models::tax::{BatchResult, TaxTariff, TaxVersionInfo, UpdateResult};
use tauri::Emitter;
use tauri_plugin_opener::OpenerExt;
use log::{info, warn};
use chrono;

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
    
    // 生成输出文件路径（加上年月日时分）
    let input_path_obj = std::path::Path::new(&input_path);
    let now = chrono::Local::now();
    let timestamp = now.format("%Y%m%d_%H%M").to_string();
    let output_filename = format!(
        "{}_查询结果_{}.xlsx",
        input_path_obj
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("tax_query"),
        timestamp
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

/// Read-only local database check. Does not require internet.
#[tauri::command]
pub async fn tax_has_local_data(app_handle: tauri::AppHandle) -> Result<bool, String> {
    TaxDataDownloader::local_has_data(&app_handle).map_err(|e| e.to_string())
}

/// Current local snapshot metadata even when completely offline.
#[tauri::command]
pub async fn tax_get_local_version(app_handle: tauri::AppHandle)
    -> Result<crate::models::tax::VersionDetail, String> {
    TaxDataDownloader::get_local_version(&app_handle).map_err(|e| e.to_string())
}

/// Explicit import of an unsigned shadow-only preview archive.
#[tauri::command]
pub async fn tax_import_preview(
    app_handle: tauri::AppHandle, archive_path: String,
) -> Result<PreviewSummary, String> {
    tauri::async_runtime::spawn_blocking(move ||
        preview::import_archive(&app_handle, &archive_path))
        .await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
}

/// Read only from an isolated shadow preview. Does not touch production SQLite.
#[tauri::command]
pub async fn tax_preview_lookup(
    app_handle: tauri::AppHandle, digest: String, code: String,
) -> Result<Option<PreviewRate>, String> {
    preview::lookup(&app_handle, &digest, &code).map_err(|e| e.to_string())
}

/// Verify a review-only signed bundle using the public key pinned into the binary.
#[tauri::command]
pub async fn tax_verify_signed_review(archive_path: String)
    -> Result<SignedReviewResult, String> {
    tauri::async_runtime::spawn_blocking(move || signed::verify_signed_review(&archive_path))
        .await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tax_has_signed_review_trust_key() -> bool {
    signed::trusted_key_available()
}

/// Read-only review of a generated NI Other evidence report. Not duty data.
#[tauri::command]
pub async fn tax_read_ni_review(path: String) -> Result<NiReviewReport, String> {
    tauri::async_runtime::spawn_blocking(move || ni_review::load_ni_review(&path))
        .await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
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

/// 更新单行税率数据
///
/// 默认只做网页比对、不修改本地库；`apply_to_db = true` 时用户已明确
/// 选择把抓取到的差异写入本地数据库。HTML 不是权威数据源，写入永远是
/// 用户的显式决定，且会在下次官方数据快照更新时被覆盖。
#[tauri::command]
pub async fn tax_update_single_row(
    code: String,
    apply_to_db: Option<bool>,
    app_handle: tauri::AppHandle,
    window: tauri::Window,
) -> Result<UpdateResult, String> {
    let apply_to_db = apply_to_db.unwrap_or(false);
    info!("开始更新单行数据: {} (apply_to_db={})", code, apply_to_db);
    
    // 发送日志事件
    let _ = window.emit("update-log", serde_json::json!({
        "code": code,
        "message": format!("开始更新商品 {}", code),
        "level": "info"
    }));
    
    // 发送进度事件 (0%)
    let _ = window.emit("update-progress", serde_json::json!({
        "code": code,
        "progress": 0,
        "stage": "初始化"
    }));
    
    // 1. 获取数据库实例
    let db = TaxDatabase::new(&app_handle).map_err(|e| e.to_string())?;
    
    // 2. 查询当前记录
    let old_data = db.get_tariff(&code).map_err(|e| e.to_string())?;
    
    let old_tariff = match old_data {
        Some(t) => t,
        None => {
            let _ = window.emit("update-log", serde_json::json!({
                "code": code,
                "message": format!("未找到商品编码 {} 的记录", code),
                "level": "error"
            }));
            return Ok(UpdateResult {
                success: false,
                message: format!("未找到商品编码 {} 的记录", code),
                uk_updated: false,
                ni_updated: false,
                old_uk_rate: None,
                new_uk_rate: None,
                old_ni_rate: None,
                new_ni_rate: None,
                new_description: None,
                applied_to_db: false,
            });
        }
    };
    
    // 进度 20%
    let _ = window.emit("update-progress", serde_json::json!({
        "code": code,
        "progress": 20,
        "stage": "准备爬取"
    }));
    
    // 3. 创建爬虫实例
    let scraper = TaxScraper::new().map_err(|e| e.to_string())?;
    
    // 4. 获取URL
    let uk_url = old_tariff.url.clone();
    let ni_url = old_tariff
        .north_ireland_url
        .clone()
        .unwrap_or_else(|| format!("https://www.trade-tariff.service.gov.uk/xi/commodities/{}", code));
    
    info!("UK URL: {}, NI URL: {}", uk_url, ni_url);
    
    let _ = window.emit("update-log", serde_json::json!({
        "code": code,
        "message": "开始并行抓取英国和北爱尔兰数据",
        "level": "info"
    }));
    
    // 进度 40%
    let _ = window.emit("update-progress", serde_json::json!({
        "code": code,
        "progress": 40,
        "stage": "抓取数据"
    }));
    
    // 5. 并行抓取英国和北爱尔兰数据
    let (uk_result, ni_result) = scraper.fetch_both_regions(&uk_url, &ni_url).await;
    
    // 进度 70%
    let _ = window.emit("update-progress", serde_json::json!({
        "code": code,
        "progress": 70,
        "stage": "解析数据"
    }));
    
    // 6. 处理抓取结果
    let mut uk_updated = false;
    let mut ni_updated = false;
    let mut new_uk_rate: Option<String> = None;
    let mut new_ni_rate: Option<String> = None;
    let mut new_description: Option<String> = None;
    let mut status_messages = Vec::new();
    
    // 记录成功状态（在移动所有权前）
    let uk_success = uk_result.is_ok();
    let ni_success = ni_result.is_ok();
    
    // 处理英国数据
    match uk_result {
        Ok(uk_data) => {
            let _ = window.emit("update-log", serde_json::json!({
                "code": code,
                "message": "英国数据抓取成功",
                "level": "success"
            }));
            
            if let Some(rate) = uk_data.rate {
                let old_rate = old_tariff.rate.trim().to_lowercase();
                let new_rate = rate.trim().to_lowercase();
                
                if old_rate != new_rate {
                    new_uk_rate = Some(rate.clone());
                    uk_updated = true;
                    status_messages.push(format!("英国税率: {} → {}", old_tariff.rate, rate));
                    let _ = window.emit("update-log", serde_json::json!({
                        "code": code,
                        "message": format!("英国税率变化: {} → {}", old_tariff.rate, rate),
                        "level": "info"
                    }));
                } else {
                    status_messages.push(format!("英国税率: {} (无变化)", old_tariff.rate));
                    let _ = window.emit("update-log", serde_json::json!({
                        "code": code,
                        "message": format!("英国税率: {} (无变化)", old_tariff.rate),
                        "level": "info"
                    }));
                }
            }
            
            if let Some(desc) = uk_data.description {
                if let Some(old_desc) = &old_tariff.description {
                    if old_desc != &desc {
                        new_description = Some(desc);
                        uk_updated = true;
                        // 描述可能很长，只提示已更新
                        status_messages.push("描述已更新".to_string());
                    }
                } else {
                    new_description = Some(desc);
                    uk_updated = true;
                    status_messages.push("描述已添加".to_string());
                }
            }
        }
        Err(e) => {
            warn!("英国数据获取失败: {}", e);
            status_messages.push(format!("英国数据获取失败: {}", e));
            let _ = window.emit("update-log", serde_json::json!({
                "code": code,
                "message": format!("英国数据获取失败: {}", e),
                "level": "error"
            }));
        }
    }
    
    // 处理北爱尔兰数据
    match ni_result {
        Ok(ni_data) => {
            let _ = window.emit("update-log", serde_json::json!({
                "code": code,
                "message": "北爱尔兰数据抓取成功",
                "level": "success"
            }));
            
            if let Some(rate) = ni_data.rate {
                let old_rate = old_tariff
                    .north_ireland_rate
                    .as_ref()
                    .map(|r| r.trim().to_lowercase())
                    .unwrap_or_default();
                let new_rate = rate.trim().to_lowercase();
                
                if old_rate != new_rate {
                    new_ni_rate = Some(rate.clone());
                    ni_updated = true;
                    let old_display = old_tariff.north_ireland_rate.as_deref().unwrap_or("无");
                    status_messages.push(format!("北爱尔兰税率: {} → {}", old_display, rate));
                    let _ = window.emit("update-log", serde_json::json!({
                        "code": code,
                        "message": format!("北爱尔兰税率变化: {} → {}", old_display, rate),
                        "level": "info"
                    }));
                } else {
                    let old_display = old_tariff.north_ireland_rate.as_deref().unwrap_or("无");
                    status_messages.push(format!("北爱尔兰税率: {} (无变化)", old_display));
                    let _ = window.emit("update-log", serde_json::json!({
                        "code": code,
                        "message": format!("北爱尔兰税率: {} (无变化)", old_display),
                        "level": "info"
                    }));
                }
            }
        }
        Err(e) => {
            warn!("北爱尔兰数据获取失败: {}", e);
            status_messages.push(format!("北爱尔兰数据获取失败: {}", e));
            let _ = window.emit("update-log", serde_json::json!({
                "code": code,
                "message": format!("北爱尔兰数据获取失败: {}", e),
                "level": "error"
            }));
        }
    }
    
    // 7. 默认只读比对：HTML 解析结果不自动覆盖经过校验的离线快照。
    // 用户勾选"写入本地数据库"时，才把上面识别出的差异显式落库。
    let any_updated = uk_updated || ni_updated;
    let mut applied_to_db = false;
    let mut write_error: Option<String> = None;
    if apply_to_db && any_updated {
        let _ = window.emit("update-progress", serde_json::json!({
            "code": code,
            "progress": 85,
            "stage": "写入本地数据库"
        }));
        match db.update_tariff_fields(
            &code,
            new_uk_rate.as_deref(),
            new_ni_rate.as_deref(),
            new_description.as_deref(),
        ) {
            Ok(()) => {
                applied_to_db = true;
                let _ = window.emit("update-log", serde_json::json!({
                    "code": code,
                    "message": "差异已写入本地数据库（按你的选择；下次官方快照更新会覆盖手动修改）",
                    "level": "success"
                }));
            }
            Err(e) => {
                write_error = Some(e.to_string());
                let _ = window.emit("update-log", serde_json::json!({
                    "code": code,
                    "message": format!("写入本地数据库失败: {}", e),
                    "level": "error"
                }));
            }
        }
    } else if any_updated {
        let _ = window.emit("update-log", serde_json::json!({
            "code": code,
            "message": "发现网页差异；未修改本地数据。请核对官方页面。",
            "level": "info"
        }));
    }

    // 8. 构建返回结果
    let success = (uk_success || ni_success) && write_error.is_none();

    // 进度 100%
    let _ = window.emit("update-progress", serde_json::json!({
        "code": code,
        "progress": 100,
        "stage": "完成"
    }));
    let message = if let Some(error) = write_error.as_deref() {
        format!("❌ 网页差异已发现，但写入本地数据库失败: {} | {}", error, status_messages.join(" | "))
    } else if applied_to_db {
        format!("已写入本地数据库: {}", status_messages.join(" | "))
    } else if any_updated {
        format!("仅网页比对，未更新本地库: {}", status_messages.join(" | "))
    } else if success {
        format!("网页比对未发现差异: {}", status_messages.join(" | "))
    } else {
        format!("❌ {}", status_messages.join(" | "))
    };

    // 发送最终完成日志
    let _ = window.emit("update-log", serde_json::json!({
        "code": code,
        "message": if applied_to_db { "差异已写入本地数据库" }
            else if write_error.is_some() { "写入本地数据库失败" }
            else if any_updated { "网页比对有差异，未覆盖本地数据" }
            else { "网页比对完成，未修改本地数据" },
        "level": if applied_to_db || any_updated { "success" } else { "info" }
    }));

    Ok(UpdateResult {
        success,
        message,
        uk_updated,
        ni_updated,
        old_uk_rate: Some(old_tariff.rate),
        new_uk_rate,
        old_ni_rate: old_tariff.north_ireland_rate,
        new_ni_rate,
        new_description,
        applied_to_db,
    })
}
