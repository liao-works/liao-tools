use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::commands::error::CommandError;

// GitHub 仓库配置
const GITHUB_REPO: &str = "liao-works/liao-tools";
const GITHUB_API_URL: &str = "https://api.github.com/repos/liao-works/liao-tools/releases/latest";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_CHECK_INTERVAL_HOURS: u64 = 24;

// 可选的 GitHub Token（用于访问私有仓库）
// 可以通过环境变量 GITHUB_TOKEN 设置
fn get_github_token() -> Option<String> {
    std::env::var("GITHUB_TOKEN").ok()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub download_url: String,
    pub release_notes: String,
    pub published_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSettings {
    pub auto_check: bool,
    pub last_check_time: u64,
    #[serde(default = "default_check_interval")]
    pub check_interval_hours: u64,
}

fn default_check_interval() -> u64 {
    DEFAULT_CHECK_INTERVAL_HOURS
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self {
            auto_check: true,
            last_check_time: 0,
            check_interval_hours: DEFAULT_CHECK_INTERVAL_HOURS,
        }
    }
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: String,
}

/// 从 GitHub 检查更新
#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, CommandError> {
    let client = reqwest::Client::builder()
        .user_agent("liao-tools")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| CommandError::new(format!("创建 HTTP 客户端失败: {}", e), "NETWORK_ERROR"))?;

    println!("正在从 GitHub 检查新版本...");
    println!("仓库: {}", GITHUB_REPO);
    println!("API 地址: {}", GITHUB_API_URL);

    // 构建请求，如果有 Token 则添加认证头
    let mut request = client.get(GITHUB_API_URL);
    if let Some(token) = get_github_token() {
        println!("使用 GitHub Token 进行认证");
        request = request.header("Authorization", format!("Bearer {}", token));
    }

    let response = request
        .send()
        .await
        .map_err(|e| CommandError::new(format!("获取版本信息失败: {}", e), "NETWORK_ERROR"))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_else(|_| "无法读取错误信息".to_string());

        if status.as_u16() == 404 {
            return Err(CommandError::new(
                format!("仓库 {} 未找到 Release，请确保已发布至少一个版本", GITHUB_REPO),
                "NOT_FOUND"
            ));
        } else if status.as_u16() == 403 || status.as_u16() == 401 {
            return Err(CommandError::new(
                format!("访问私有仓库失败，请设置 GITHUB_TOKEN 环境变量。错误: {}", error_body),
                "AUTH_ERROR"
            ));
        } else {
            return Err(CommandError::new(
                format!("GitHub API 返回错误状态: {} - {}", status, error_body),
                "API_ERROR"
            ));
        }
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| CommandError::new(format!("解析版本信息失败: {}", e), "PARSE_ERROR"))?;

    // 移除版本号前的 'v' 前缀
    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let current_version = CURRENT_VERSION.to_string();

    let has_update = compare_versions(&latest_version, &current_version);

    if has_update {
        println!("发现新版本: {} (当前版本: {})", latest_version, current_version);
    } else {
        println!("已是最新版本: {}", current_version);
    }

    Ok(UpdateInfo {
        current_version,
        latest_version,
        has_update,
        download_url: release.html_url,
        release_notes: release.body.unwrap_or("暂无更新说明".to_string()),
        published_at: release.published_at,
    })
}

/// 比较两个语义化版本 (例如 "1.2.3" vs "1.2.2")
fn compare_versions(latest: &str, current: &str) -> bool {
    let parse_version = |v: &str| -> Vec<u32> {
        v.split('.')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect()
    };

    let latest_parts = parse_version(latest);
    let current_parts = parse_version(current);

    for i in 0..latest_parts.len().max(current_parts.len()) {
        let latest_part = latest_parts.get(i).unwrap_or(&0);
        let current_part = current_parts.get(i).unwrap_or(&0);

        if latest_part > current_part {
            return true;
        } else if latest_part < current_part {
            return false;
        }
    }

    false
}

/// 检查是否应该自动检查更新
pub fn should_check_for_updates(settings: &UpdateSettings) -> bool {
    if !settings.auto_check {
        return false;
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let elapsed_hours = (now - settings.last_check_time) / 3600;
    let interval = if settings.check_interval_hours > 0 {
        settings.check_interval_hours
    } else {
        DEFAULT_CHECK_INTERVAL_HOURS
    };
    elapsed_hours >= interval
}

/// 从配置文件加载更新设置
#[tauri::command]
pub fn load_update_settings() -> Result<UpdateSettings, CommandError> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| CommandError::new("无法获取数据目录", "DIR_ERROR"))?
        .join("liao-tools");

    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| CommandError::new(format!("创建数据目录失败: {}", e), "IO_ERROR"))?;
    }

    let settings_path = data_dir.join("update_settings.json");

    if !settings_path.exists() {
        return Ok(UpdateSettings::default());
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| CommandError::new(format!("读取设置文件失败: {}", e), "IO_ERROR"))?;

    serde_json::from_str(&content)
        .map_err(|e| CommandError::new(format!("解析设置失败: {}", e), "PARSE_ERROR"))
}

/// 保存更新设置到配置文件
#[tauri::command]
pub fn save_update_settings(settings: UpdateSettings) -> Result<(), CommandError> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| CommandError::new("无法获取数据目录", "DIR_ERROR"))?
        .join("liao-tools");

    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| CommandError::new(format!("创建数据目录失败: {}", e), "IO_ERROR"))?;
    }

    let settings_path = data_dir.join("update_settings.json");

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| CommandError::new(format!("序列化设置失败: {}", e), "SERIALIZE_ERROR"))?;

    std::fs::write(&settings_path, content)
        .map_err(|e| CommandError::new(format!("写入设置文件失败: {}", e), "IO_ERROR"))
}

/// 更新最后检查时间
#[tauri::command]
pub fn update_last_check_time() -> Result<(), CommandError> {
    let mut settings = load_update_settings()?;
    settings.last_check_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    save_update_settings(settings)
}

/// 获取当前版本
#[tauri::command]
pub fn get_current_version() -> String {
    CURRENT_VERSION.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_versions() {
        assert!(compare_versions("1.2.3", "1.2.2"));
        assert!(compare_versions("1.3.0", "1.2.9"));
        assert!(compare_versions("2.0.0", "1.9.9"));
        assert!(!compare_versions("1.2.2", "1.2.3"));
        assert!(!compare_versions("1.2.3", "1.2.3"));
    }

    #[test]
    fn test_should_check_for_updates() {
        let mut settings = UpdateSettings::default();
        assert!(should_check_for_updates(&settings));

        settings.last_check_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert!(!should_check_for_updates(&settings));

        settings.auto_check = false;
        assert!(!should_check_for_updates(&settings));
    }
}
