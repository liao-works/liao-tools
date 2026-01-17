use crate::commands::error::CommandError;
use crate::models::excel::{ProcessConfig, ProcessRequest, ProcessResponse};
use super::config;
use super::processor;

/// 处理 Excel 文件
#[tauri::command]
pub async fn process_excel_file(
    request: ProcessRequest,
) -> Result<ProcessResponse, CommandError> {
    processor::process_excel_file(&request.file_path, &request.config)
}

/// 获取指定类型的配置
#[tauri::command]
pub async fn get_excel_config(process_type: String) -> Result<ProcessConfig, CommandError> {
    config::load_config_for_type(&process_type)
}

/// 保存配置
#[tauri::command]
pub async fn save_excel_config(config: ProcessConfig) -> Result<(), CommandError> {
    config::save_config_for_type(&config)
}
