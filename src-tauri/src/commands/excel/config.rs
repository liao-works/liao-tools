use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use crate::commands::error::CommandError;
use crate::models::excel::{ProcessConfig, ProcessType};

/// 获取配置文件路径
pub fn get_config_path() -> Result<PathBuf, CommandError> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| CommandError::new("无法获取配置目录", "CONFIG_ERROR"))?;
    
    let app_config_dir = config_dir.join("liao-tools");
    
    // 确保目录存在
    if !app_config_dir.exists() {
        fs::create_dir_all(&app_config_dir)
            .map_err(|e| CommandError::new(format!("创建配置目录失败: {}", e), "CONFIG_ERROR"))?;
    }
    
    Ok(app_config_dir.join("excel_configs.json"))
}

/// 加载所有配置
pub fn load_all_configs() -> Result<HashMap<String, ProcessConfig>, CommandError> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        // 如果配置文件不存在，返回默认配置
        return Ok(get_default_configs());
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| CommandError::new(format!("读取配置文件失败: {}", e), "CONFIG_ERROR"))?;
    
    let configs: HashMap<String, ProcessConfig> = serde_json::from_str(&content)
        .map_err(|e| CommandError::new(format!("解析配置文件失败: {}", e), "CONFIG_ERROR"))?;
    
    Ok(configs)
}

/// 保存所有配置
pub fn save_all_configs(configs: &HashMap<String, ProcessConfig>) -> Result<(), CommandError> {
    let config_path = get_config_path()?;
    
    let content = serde_json::to_string_pretty(configs)
        .map_err(|e| CommandError::new(format!("序列化配置失败: {}", e), "CONFIG_ERROR"))?;
    
    fs::write(&config_path, content)
        .map_err(|e| CommandError::new(format!("写入配置文件失败: {}", e), "CONFIG_ERROR"))?;
    
    Ok(())
}

/// 加载指定类型的配置
pub fn load_config_for_type(process_type: &str) -> Result<ProcessConfig, CommandError> {
    let configs = load_all_configs()?;
    
    if let Some(config) = configs.get(process_type) {
        Ok(config.clone())
    } else {
        // 如果没有找到配置，返回默认配置
        ProcessType::from_string(process_type)
            .map(ProcessConfig::default_for_type)
            .ok_or_else(|| CommandError::new(format!("未知的处理类型: {}", process_type), "CONFIG_ERROR"))
    }
}

/// 保存指定类型的配置
pub fn save_config_for_type(config: &ProcessConfig) -> Result<(), CommandError> {
    let mut configs = load_all_configs()?;
    let type_key = config.process_type.to_string();
    configs.insert(type_key, config.clone());
    save_all_configs(&configs)?;
    Ok(())
}

/// 获取默认配置
fn get_default_configs() -> HashMap<String, ProcessConfig> {
    let mut configs = HashMap::new();
    
    configs.insert(
        "sea-rail-with-image".to_string(),
        ProcessConfig::default_for_type(ProcessType::SeaRailWithImage),
    );
    
    configs.insert(
        "sea-rail-no-image".to_string(),
        ProcessConfig::default_for_type(ProcessType::SeaRailNoImage),
    );
    
    configs.insert(
        "air-freight".to_string(),
        ProcessConfig::default_for_type(ProcessType::AirFreight),
    );
    
    configs
}
