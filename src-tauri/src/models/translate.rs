use serde::{Deserialize, Serialize};

/// 功能模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TranslateMode {
    /// 翻译
    Translate,
    /// 润色（不换语言）
    Polish,
    /// 解释（读邮件）
    Explain,
}

/// 语气预设
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TonePreset {
    /// 自然商务（默认）
    Natural,
    /// 轻松随和
    Casual,
    /// 严谨正式
    Formal,
}

/// 供应商标识
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    #[default]
    DeepSeek,
    Gemini,
    Custom,
}

/// 翻译请求（前端 camelCase）
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateRequest {
    pub mode: TranslateMode,
    /// auto/zh/en/ja/ko/de/fr/es/ru
    #[serde(default = "default_auto")]
    pub source_lang: String,
    #[serde(default = "default_auto")]
    pub target_lang: String,
    #[serde(default)]
    pub tone: Option<TonePreset>,
    #[serde(default)]
    pub custom_note: Option<String>,
    pub text: String,
}

fn default_auto() -> String {
    "auto".to_string()
}

/// 单个供应商凭据
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCredentials {
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    /// 仅 custom 使用；以 /v1 之类版本段结尾
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

impl ProviderCredentials {
    /// 是否达到可发起请求的最低配置
    pub fn is_configured(&self, kind: ProviderKind) -> bool {
        if self.api_key.trim().is_empty() || self.model.trim().is_empty() {
            return false;
        }
        match kind {
            ProviderKind::Custom => self.base_url.as_deref().map_or(false, |u| !u.trim().is_empty()),
            _ => true,
        }
    }
}

/// 供应商配置文件（app_data_dir/translate_provider.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    #[serde(default)]
    pub active_provider: ProviderKind,
    #[serde(default)]
    pub deepseek: ProviderCredentials,
    #[serde(default)]
    pub gemini: ProviderCredentials,
    #[serde(default)]
    pub custom: ProviderCredentials,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            active_provider: ProviderKind::DeepSeek,
            deepseek: ProviderCredentials { model: "deepseek-chat".into(), ..Default::default() },
            gemini: ProviderCredentials { model: "gemini-2.5-flash".into(), ..Default::default() },
            custom: ProviderCredentials::default(),
        }
    }
}

impl ProviderConfig {
    pub fn active_credentials(&self) -> &ProviderCredentials {
        self.credentials(self.active_provider)
    }

    pub fn credentials(&self, kind: ProviderKind) -> &ProviderCredentials {
        match kind {
            ProviderKind::DeepSeek => &self.deepseek,
            ProviderKind::Gemini => &self.gemini,
            ProviderKind::Custom => &self.custom,
        }
    }

    pub fn credentials_mut(&mut self, kind: ProviderKind) -> &mut ProviderCredentials {
        match kind {
            ProviderKind::DeepSeek => &mut self.deepseek,
            ProviderKind::Gemini => &mut self.gemini,
            ProviderKind::Custom => &mut self.custom,
        }
    }
}

/// 单个供应商的脱敏状态（前端可见）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatusEntry {
    pub model: String,
    pub base_url: Option<String>,
    pub api_key_mask: String,
    pub configured: bool,
}

/// 全部供应商的脱敏状态
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub active_provider: ProviderKind,
    pub deepseek: ProviderStatusEntry,
    pub gemini: ProviderStatusEntry,
    pub custom: ProviderStatusEntry,
}

/// 保存请求：字段为 None 表示不修改；api_key 传空字符串表示清除
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProviderRequest {
    pub provider: ProviderKind,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default = "default_true")]
    pub set_active: bool,
}

fn default_true() -> bool {
    true
}

/// 流式事件（tag = type，前端判别联合）
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TranslateEvent {
    #[serde(rename_all = "camelCase")]
    Delta { text: String },
    #[serde(rename_all = "camelCase")]
    Done { history_id: i64 },
    #[serde(rename_all = "camelCase")]
    Error { message: String },
}

/// 历史条目（列表查询返回）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: i64,
    pub created_at: String,
    pub mode: String,
    pub source_lang: Option<String>,
    pub target_lang: Option<String>,
    pub tone: Option<String>,
    pub provider: String,
    pub model: String,
    pub source_text: String,
    pub result_text: String,
}

/// 历史写入记录
#[derive(Debug, Clone)]
pub struct HistoryRecord {
    pub mode: String,
    pub source_lang: Option<String>,
    pub target_lang: Option<String>,
    pub tone: Option<String>,
    pub provider: String,
    pub model: String,
    pub source_text: String,
    pub result_text: String,
}
