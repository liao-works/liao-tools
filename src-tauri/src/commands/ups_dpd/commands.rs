use crate::commands::error::CommandError;
use crate::commands::ups_dpd::{dpd_processor_v2, excel_utils, template_manager, ups_processor_v2};
use crate::models::ups_dpd::{ProcessRequest, ProcessResponse, TemplateConfig, TemplateType};
use chrono::Local;
use std::path::PathBuf;

/// 处理 UPS/DPD 文件
#[tauri::command]
pub async fn process_ups_dpd_file(
    request: ProcessRequest,
) -> Result<ProcessResponse, CommandError> {
    // 生成输出文件路径（保存到桌面）
    let desktop = dirs::desktop_dir()
        .ok_or_else(|| CommandError::new("无法获取桌面路径", "ERROR"))?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let template_type_str = request.template_type.to_string().to_uppercase();
    let output_filename = format!("{}总结单-{}.xlsx", template_type_str, timestamp);
    let output_path = desktop.join(output_filename);

    // 获取模板路径
    let template_path = template_manager::get_template_path(&request.template_type)?;

    // 读取主数据文件
    let main_data = excel_utils::read_excel_file(&PathBuf::from(&request.main_file_path), 0)?;

    // 读取明细表文件（如果有）
    let detail_data = if let Some(detail_file_path) = &request.detail_file_path {
        Some(excel_utils::read_excel_file(
            &PathBuf::from(detail_file_path),
            0,
        )?)
    } else {
        None
    };

    // 根据模板类型选择处理器 (使用 V2 版本保留模板)
    let logs: Vec<String>;

    match request.template_type {
        TemplateType::Ups => {
            let mut processor = ups_processor_v2::UpsProcessorV2::new();
            processor.process_ups_data(
                &main_data,
                detail_data.as_ref(),
                &template_path,
                &output_path,
            )?;
            logs = processor.get_logs();
        }
        TemplateType::Dpd => {
            let mut processor = dpd_processor_v2::DpdProcessorV2::new();
            processor.process_dpd_data(
                &main_data,
                detail_data.as_ref(),
                &template_path,
                &output_path,
            )?;
            logs = processor.get_logs();
        }
    }

    Ok(ProcessResponse {
        success: true,
        output_path: output_path.to_string_lossy().to_string(),
        message: "处理完成".to_string(),
        logs,
    })
}

/// 获取模板配置
#[tauri::command]
pub async fn get_template_config(
    template_type: String,
) -> Result<TemplateConfig, CommandError> {
    let template_type = TemplateType::from_string(&template_type)
        .ok_or_else(|| CommandError::new(format!("无效的模板类型: {}", template_type), "ERROR"))?;

    template_manager::get_config_for_type(&template_type)
}

/// 保存模板配置
#[tauri::command]
pub async fn save_template_config(config: TemplateConfig) -> Result<(), CommandError> {
    template_manager::save_config_for_type(&config)
}

// 注意：文件选择功能已在前端使用 @tauri-apps/plugin-dialog 实现
// 前端选择文件后直接调用 save_template_config 保存配置

/// 验证模板文件
#[tauri::command]
pub async fn validate_template_file(file_path: String) -> Result<bool, CommandError> {
    let path = PathBuf::from(&file_path);
    template_manager::validate_template_file(&path)
}

/// 重置为默认模板
#[tauri::command]
pub async fn reset_to_default_template(
    template_type: String,
) -> Result<(), CommandError> {
    let template_type = TemplateType::from_string(&template_type)
        .ok_or_else(|| CommandError::new(format!("无效的模板类型: {}", template_type), "ERROR"))?;

    let config = TemplateConfig {
        template_type,
        template_path: None,
        use_default: true,
    };

    template_manager::save_config_for_type(&config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_get_template_config() {
        let result = get_template_config("ups".to_string()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_validate_template_file() {
        let result = validate_template_file("invalid_path.xlsx".to_string()).await;
        assert!(result.is_ok());
    }
}
