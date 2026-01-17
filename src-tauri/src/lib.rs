mod commands;
mod core;
mod models;

use commands::alta::*;
use commands::alta::database::DatabaseManager;
use commands::alta::matcher::HSCodeMatcher;
use commands::excel::*;
use commands::tax::*;
use log::info;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;

/// 应用状态
pub struct AppState {
    pub db: Arc<Mutex<DatabaseManager>>,
    pub matcher: Arc<Mutex<HSCodeMatcher>>,
    pub db_path: Arc<Mutex<PathBuf>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            info!("初始化应用...");

            // 获取应用数据目录
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            // 确保目录存在
            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");

            // 数据库路径
            let db_path = app_data_dir.join("alta_cache.db");
            info!("数据库路径: {:?}", db_path);

            // 初始化数据库
            let db_manager = DatabaseManager::new(&db_path)
                .expect("Failed to initialize database");
            let db = Arc::new(Mutex::new(db_manager));

            // 初始化匹配器
            let matcher = Arc::new(Mutex::new(HSCodeMatcher::new(db.clone())));

            // 创建应用状态
            let state = AppState {
                db,
                matcher,
                db_path: Arc::new(Mutex::new(db_path)),
            };

            // 设置状态
            app.manage(state);

            info!("应用初始化完成");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            query_hs_code,
            update_alta_database,
            batch_process_excel,
            get_database_info,
            download_template,
            test_database_connection,
            test_alta_connection,
            // Tax commands
            tax_exact_search,
            tax_fuzzy_search,
            tax_batch_query,
            tax_download_template,
            tax_check_update,
            tax_download_update,
            tax_open_url,
            tax_update_single_row,
            // Excel commands
            process_excel_file,
            get_excel_config,
            save_excel_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
