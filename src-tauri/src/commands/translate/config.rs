use anyhow::{Context, Result};
use tauri::Manager;

use crate::models::translate::{ProviderConfig, ProviderKind, ProviderStatus, ProviderStatusEntry};

pub const CONFIG_FILE: &str = "translate_provider.json";

pub const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com/v1";
pub const GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/openai";

/// 请求配置（不存在或损坏时返回默认并告警，不报错——配置损坏不应锁死功能）
pub fn load_provider_config(app_handle: &tauri::AppHandle) -> ProviderConfig {
    load_provider_config_at(&config_path(app_handle))
}

/// 指定路径版本（测试与工具直接复用核心逻辑）
pub fn load_provider_config_at(path: &std::path::Path) -> ProviderConfig {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return ProviderConfig::default();
    };
    match serde_json::from_str(&raw) {
        Ok(config) => config,
        Err(error) => {
            log::warn!("供应商配置损坏，使用默认配置: {error}");
            ProviderConfig::default()
        }
    }
}

pub fn save_provider_config(app_handle: &tauri::AppHandle, config: &ProviderConfig) -> Result<()> {
    save_provider_config_at(&config_path(app_handle), config)
}

/// 指定路径版本（测试与工具直接复用核心逻辑）
/// 先写临时文件再原子替换，避免写入中途崩溃留下半截配置。
pub fn save_provider_config_at(path: &std::path::Path, config: &ProviderConfig) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("创建配置目录失败")?;
    }
    let payload = serde_json::to_string_pretty(config)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, payload).with_context(|| format!("写入临时配置失败: {}", tmp.display()))?;
    std::fs::rename(&tmp, path).with_context(|| format!("替换配置失败: {}", path.display()))?;
    Ok(())
}

fn config_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join(CONFIG_FILE)
}

/// 供应商请求 base_url；custom 用用户自填值（去除首尾空白与末尾斜杠，避免拼接时出现双斜杠）
pub fn resolve_base_url(kind: ProviderKind, config: &ProviderConfig) -> Option<String> {
    match kind {
        ProviderKind::DeepSeek => Some(DEEPSEEK_BASE_URL.to_string()),
        ProviderKind::Gemini => Some(GEMINI_BASE_URL.to_string()),
        ProviderKind::Custom => config
            .custom
            .base_url
            .as_deref()
            .map(str::trim)
            .filter(|u| !u.is_empty())
            .map(|u| u.trim_end_matches('/'))
            .filter(|u| !u.is_empty())
            .map(str::to_string),
    }
}

pub fn provider_models(kind: ProviderKind) -> &'static [&'static str] {
    match kind {
        ProviderKind::DeepSeek => &["deepseek-chat", "deepseek-reasoner"],
        ProviderKind::Gemini => &["gemini-2.5-flash", "gemini-2.5-pro"],
        ProviderKind::Custom => &[],
    }
}

pub fn default_model(kind: ProviderKind) -> &'static str {
    match kind {
        ProviderKind::DeepSeek => "deepseek-chat",
        ProviderKind::Gemini => "gemini-2.5-flash",
        ProviderKind::Custom => "",
    }
}

/// Key 脱敏：保留末 4 位（被隐藏字符较多时最多显示 3 个星号）
pub fn mask_key(key: &str) -> String {
    let key = key.trim();
    if key.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 4 {
        return "*".repeat(chars.len());
    }
    let hidden = "*".repeat((chars.len() - 4).min(3));
    let suffix: String = chars[chars.len() - 4..].iter().collect();
    format!("{hidden}{suffix}")
}

pub fn build_status(config: &ProviderConfig) -> ProviderStatus {
    let entry = |kind: ProviderKind| {
        let cred = config.credentials(kind);
        ProviderStatusEntry {
            model: if cred.model.trim().is_empty() { default_model(kind).to_string() } else { cred.model.clone() },
            base_url: resolve_base_url(kind, config),
            api_key_mask: mask_key(&cred.api_key),
            configured: cred.is_configured(kind),
        }
    };
    ProviderStatus {
        active_provider: config.active_provider,
        deepseek: entry(ProviderKind::DeepSeek),
        gemini: entry(ProviderKind::Gemini),
        custom: entry(ProviderKind::Custom),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::translate::ProviderCredentials;

    #[test]
    fn mask_key_keeps_last_four() {
        assert_eq!(mask_key("sk-12345678abcd"), "***abcd");
        assert_eq!(mask_key("  sk-12345678abcd  "), "***abcd");
        assert_eq!(mask_key(""), "");
        assert_eq!(mask_key("abc"), "***");
        assert_eq!(mask_key("abcde"), "*bcde");
    }

    #[test]
    fn config_roundtrip_preserves_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CONFIG_FILE);
        let mut config = ProviderConfig::default();
        config.deepseek.api_key = "sk-test-1234".into();
        config.active_provider = ProviderKind::Gemini;
        save_provider_config_at(&path, &config).unwrap();

        let loaded = load_provider_config_at(&path);
        assert_eq!(loaded.active_provider, ProviderKind::Gemini);
        assert_eq!(loaded.deepseek.api_key, "sk-test-1234");
        assert_eq!(loaded.gemini.model, "gemini-2.5-flash");
    }

    #[test]
    fn corrupted_config_falls_back_to_default() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(CONFIG_FILE), "{not json").unwrap();
        let loaded = load_provider_config_at(&dir.path().join(CONFIG_FILE));
        assert_eq!(loaded.active_provider, ProviderKind::DeepSeek);
    }

    #[test]
    fn resolve_base_url_for_all_kinds() {
        let mut config = ProviderConfig::default();
        assert_eq!(resolve_base_url(ProviderKind::DeepSeek, &config).as_deref(), Some(DEEPSEEK_BASE_URL));
        assert_eq!(resolve_base_url(ProviderKind::Gemini, &config).as_deref(), Some(GEMINI_BASE_URL));
        assert_eq!(resolve_base_url(ProviderKind::Custom, &config), None);
        config.custom.base_url = Some("https://relay.example.com/v1/".into());
        assert_eq!(resolve_base_url(ProviderKind::Custom, &config).as_deref(), Some("https://relay.example.com/v1"));
    }

    #[test]
    fn is_configured_requires_base_url_for_custom() {
        let cred = ProviderCredentials { api_key: "k".into(), model: "m".into(), base_url: None };
        assert!(!cred.is_configured(ProviderKind::Custom));
        assert!(cred.is_configured(ProviderKind::DeepSeek));
        let cred = ProviderCredentials { api_key: "k".into(), model: "m".into(), base_url: Some("https://x/v1".into()) };
        assert!(cred.is_configured(ProviderKind::Custom));
    }
}
