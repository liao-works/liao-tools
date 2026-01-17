use crate::commands::error::CommandError;
use crate::models::ups_dpd::{TemplateConfig, TemplateType};
use serde_json;
use std::fs;
use std::path::{Path, PathBuf};

/// 获取配置文件路径
fn get_config_path() -> Result<PathBuf, CommandError> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| CommandError::new("无法获取配置目录", "ERROR"))?;

    let app_config_dir = config_dir.join("liao-tools");

    // 确保目录存在
    if !app_config_dir.exists() {
        fs::create_dir_all(&app_config_dir)
            .map_err(|e| CommandError::new(format!("创建配置目录失败: {}", e), "ERROR"))?;
    }

    Ok(app_config_dir.join("ups-dpd-config.json"))
}

/// 获取默认模板路径
pub fn get_default_template_path(template_type: &TemplateType) -> Result<PathBuf, CommandError> {
    // 在开发环境中，模板在 resources/templates/ 目录
    // 在打包后，模板会被打包到应用的 resources 目录

    let template_name = match template_type {
        TemplateType::Ups => "UPS总结单模板.xlsx",
        TemplateType::Dpd => "DPD数据预报模板.xlsx",
    };

    // 尝试多个可能的位置
    let possible_paths: Vec<Option<PathBuf>> = vec![
        // 开发环境
        Some(PathBuf::from("resources").join("templates").join(template_name)),
        Some(PathBuf::from("src-tauri").join("resources").join("templates").join(template_name)),
        // 打包后的环境（相对于可执行文件）
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("resources").join("templates").join(template_name)),
    ];

    for path_opt in possible_paths.iter().flatten() {
        if path_opt.exists() {
            return Ok(path_opt.clone());
        }
    }

    Err(CommandError::new(
        format!(
            "找不到默认模板文件: {}\n\n请执行以下操作之一：\n\
            1. 将模板文件放置到: src-tauri/resources/templates/{}\n\
            2. 在「模板设置」页面选择自定义模板文件\n\
            3. 如需创建模板，参考: src-tauri/resources/templates/README.md",
            template_name, template_name
        ),
        "TEMPLATE_NOT_FOUND"
    ))
}

/// 加载配置
pub fn load_config() -> Result<Vec<TemplateConfig>, CommandError> {
    let config_path = get_config_path()?;

    if !config_path.exists() {
        // 如果配置文件不存在，返回默认配置
        return Ok(vec![
            TemplateConfig::default_for_type(TemplateType::Ups),
            TemplateConfig::default_for_type(TemplateType::Dpd),
        ]);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| CommandError::new(format!("读取配置文件失败: {}", e), "ERROR"))?;

    let configs: Vec<TemplateConfig> = serde_json::from_str(&content)
        .map_err(|e| CommandError::new(format!("解析配置文件失败: {}", e), "ERROR"))?;

    Ok(configs)
}

/// 保存配置
pub fn save_config(configs: &[TemplateConfig]) -> Result<(), CommandError> {
    let config_path = get_config_path()?;

    let content = serde_json::to_string_pretty(configs)
        .map_err(|e| CommandError::new(format!("序列化配置失败: {}", e), "ERROR"))?;

    fs::write(&config_path, content)
        .map_err(|e| CommandError::new(format!("保存配置文件失败: {}", e), "ERROR"))?;

    Ok(())
}

/// 获取指定类型的配置
pub fn get_config_for_type(template_type: &TemplateType) -> Result<TemplateConfig, CommandError> {
    let configs = load_config()?;

    configs
        .into_iter()
        .find(|c| &c.template_type == template_type)
        .ok_or_else(|| {
            CommandError::new(
                format!("找不到 {} 模板的配置", template_type.to_string()),
                "ERROR"
            )
        })
}

/// 保存指定类型的配置
pub fn save_config_for_type(config: &TemplateConfig) -> Result<(), CommandError> {
    let mut configs = load_config()?;

    // 查找并更新现有配置，或添加新配置
    if let Some(existing) = configs
        .iter_mut()
        .find(|c| c.template_type == config.template_type)
    {
        *existing = config.clone();
    } else {
        configs.push(config.clone());
    }

    save_config(&configs)
}

/// 获取模板文件路径（根据配置）
pub fn get_template_path(template_type: &TemplateType) -> Result<PathBuf, CommandError> {
    let config = get_config_for_type(template_type)?;

    if config.use_default {
        // 使用默认模板
        get_default_template_path(template_type)
    } else if let Some(custom_path) = config.template_path {
        // 使用自定义模板
        let path = PathBuf::from(&custom_path);
        if path.exists() {
            Ok(path)
        } else {
            Err(CommandError::new(
                format!("自定义模板文件不存在: {}", custom_path),
                "ERROR"
            ))
        }
    } else {
        // 配置有误，使用默认模板
        get_default_template_path(template_type)
    }
}

/// 验证模板文件是否有效
pub fn validate_template_file(path: &Path) -> Result<bool, CommandError> {
    // 检查文件是否存在
    if !path.exists() {
        return Ok(false);
    }

    // 检查文件扩展名
    if let Some(ext) = path.extension() {
        if ext != "xlsx" {
            return Ok(false);
        }
    } else {
        return Ok(false);
    }

    // 尝试打开文件以验证其为有效的 Excel 文件
    match calamine::open_workbook_auto(path) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_path() {
        let path = get_config_path();
        assert!(path.is_ok());
    }

    #[test]
    fn test_default_config() {
        let configs = vec![
            TemplateConfig::default_for_type(TemplateType::Ups),
            TemplateConfig::default_for_type(TemplateType::Dpd),
        ];

        assert_eq!(configs.len(), 2);
        assert!(configs[0].use_default);
        assert!(configs[1].use_default);
    }
}
