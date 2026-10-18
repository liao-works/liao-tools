# 大模型翻译功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 liao-tools 新增大模型翻译子系统：翻译/润色/解释三模式、三档语气预设、DeepSeek/Gemini/自定义 OpenAI 兼容供应商、流式输出、SQLite 持久化历史。

**Architecture:** 通用 OpenAI 兼容层（供应商差异 = 模板数据而非代码）+ Rust 侧 Key 存储（前端只拿掩码）+ Tauri v2 `Channel` 流式事件 + 单工作台页面（历史/配置作为页内弹窗）。

**Tech Stack:** Tauri 2、reqwest 0.11（`core/http.rs` 系统代理）、futures-util、tokio（full）、rusqlite（bundled）、React 19、shadcn/ui、`@tauri-apps/api` Channel。

**Spec:** `docs/superpowers/specs/2026-10-18-llm-translate-design.md`（本计划从规格出发，执行时两份都要读）

## Global Constraints

- Rust 端测试/编译前必须导出本机构建环境（wreq→BoringSSL 需要）：
  ```bash
  export PATH="/c/Users/A/AppData/Local/nasm/nasm-2.16.03:$PATH"
  export LIBCLANG_PATH="C:\Users\A\AppData\Roaming\Python\Python311\site-packages\clang\native"
  ```
- cargo 构建可能把 `src-tauri/Cargo.toml` 行尾改成 CRLF；提交前若变脏执行 `git restore src-tauri/Cargo.toml`，不要带进提交。
- 新增 serde 结构体统一 `#[serde(rename_all = "camelCase")]`（照 `sticky_notes.rs` 惯例）；枚举值用 `rename_all = "lowercase"`。前端 TS 类型与之一一对应。
- 命令返回 `Result<T, String>`（照 `update_history/commands.rs` 惯例）。
- **API Key 不出现在任何错误消息、日志、前端状态里**（前端只有 `apiKeyMask`）。
- HTTP 走 `core/http.rs::HttpClientBuilder`（自动附加 Windows 系统代理）；连接超时 15s，总超时 180s；`temperature` 统一 `1.3`。
- 前端样式遵守 `pnpm lint:tokens`：禁止 Tailwind 调色板硬编码（`text-gray-500` 等）和 hex 颜色，用语义 token（如 `text-muted-foreground`）。
- 提交惯例：conventional commits、中文描述、小粒度；每个 Task 结束提交一次。
- 前端无单测设施，前端任务的验证 = `pnpm build`（tsc 类型检查）通过 + 手动冒烟；Rust 任务的验证 = `cargo test`。

---

### Task 1: 数据模型与供应商配置存储

**Files:**
- Create: `src-tauri/src/models/translate.rs`
- Create: `src-tauri/src/commands/translate/mod.rs`
- Create: `src-tauri/src/commands/translate/config.rs`
- Modify: `src-tauri/src/models/mod.rs`（追加 `pub mod translate;`）
- Modify: `src-tauri/src/commands/mod.rs`（追加 `pub mod translate;`）

**Interfaces:**
- Produces（后续任务依赖）:
  - `models::translate::{TranslateMode, TonePreset, ProviderKind, TranslateRequest, ProviderConfig, ProviderCredentials, ProviderStatus, ProviderStatusEntry, SaveProviderRequest, TranslateEvent, HistoryEntry}`
  - `commands::translate::config::{load_provider_config(app_handle) -> ProviderConfig, save_provider_config(app_handle, &ProviderConfig) -> anyhow::Result<()>, mask_key(&str) -> String, template_base_url(ProviderKind) -> Option<&'static str>, default_model(ProviderKind) -> &'static str, provider_models(ProviderKind) -> &'static [&'static str]}`

- [ ] **Step 1: 写模型与配置实现**

`src-tauri/src/models/translate.rs`：

```rust
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
```

`src-tauri/src/commands/translate/config.rs`：

```rust
use anyhow::{Context, Result};
use tauri::Manager;

use crate::models::translate::{ProviderConfig, ProviderKind, ProviderStatus, ProviderStatusEntry};

pub const CONFIG_FILE: &str = "translate_provider.json";

pub const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com/v1";
pub const GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/openai";

/// 请求配置（不存在或损坏时返回默认并告警，不报错——配置损坏不应锁死功能）
pub fn load_provider_config(app_handle: &tauri::AppHandle) -> ProviderConfig {
    let path = config_path(app_handle);
    let Ok(raw) = std::fs::read_to_string(&path) else {
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
    let path = config_path(app_handle);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("创建配置目录失败")?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(config)?).context("写入配置文件失败")?;
    Ok(())
}

fn config_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join(CONFIG_FILE)
}

/// 供应商请求 base_url；custom 用用户自填值
pub fn resolve_base_url(kind: ProviderKind, config: &ProviderConfig) -> Option<String> {
    match kind {
        ProviderKind::DeepSeek => Some(DEEPSEEK_BASE_URL.to_string()),
        ProviderKind::Gemini => Some(GEMINI_BASE_URL.to_string()),
        ProviderKind::Custom => config.custom.base_url.clone().filter(|u| !u.trim().is_empty()),
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

/// Key 脱敏：保留末 4 位
pub fn mask_key(key: &str) -> String {
    let key = key.trim();
    if key.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 4 {
        return "*".repeat(chars.len());
    }
    let suffix: String = chars[chars.len() - 4..].iter().collect();
    format!("***{suffix}")
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
```

`src-tauri/src/commands/translate/mod.rs`：

```rust
pub mod commands;
pub mod config;
pub mod history;
pub mod client;
pub mod prompt;
```

（Task 5 才建 `commands.rs`；本任务先建空占位文件 `commands.rs`、`history.rs`、`client.rs`、`prompt.rs`——各自只含一行注释 `// Task N 实现`，保证模块能编译。）

`src-tauri/src/models/mod.rs` 与 `src-tauri/src/commands/mod.rs` 各追加一行：

```rust
pub mod translate;
```

- [ ] **Step 2: 编译验证**

```bash
export PATH="/c/Users/A/AppData/Local/nasm/nasm-2.16.03:$PATH"
export LIBCLANG_PATH="C:\Users\A\AppData\Roaming\Python\Python311\site-packages\clang\native"
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: 编译通过（无未使用告警之外的新错误；占位文件如有 dead_code 告警可加 `#![allow(dead_code)]` 于各占位文件顶部，Task 2-5 实现时移除）。

- [ ] **Step 3: 写 config 单测（追加到 config.rs 底部）**

```rust
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
        let app = config_dir_handle(dir.path());
        let mut config = ProviderConfig::default();
        config.deepseek.api_key = "sk-test-1234".into();
        config.active_provider = ProviderKind::Gemini;
        save_provider_config(&app, &config).unwrap();

        let loaded = load_provider_config(&app);
        assert_eq!(loaded.active_provider, ProviderKind::Gemini);
        assert_eq!(loaded.deepseek.api_key, "sk-test-1234");
        assert_eq!(loaded.gemini.model, "gemini-2.5-flash");
    }

    #[test]
    fn corrupted_config_falls_back_to_default() {
        let dir = tempfile::tempdir().unwrap();
        let app = config_dir_handle(dir.path());
        std::fs::write(dir.path().join(CONFIG_FILE), "{not json").unwrap();
        let loaded = load_provider_config(&app);
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

    /// 构造一个 app_data_dir 指向指定目录的 AppHandle 替身：
    /// load/save 以 &AppHandle 为参数，测试里用 mockall 不现实，
    /// 改为把目录版本函数一并导出测试（见下方重构说明）。
    fn config_dir_handle(dir: &std::path::Path) -> tauri::AppHandle {
        unreachable!("见 Step 4 重构：config 路径函数需接受目录参数")
    }
}
```

**重构说明（Step 3 的前置）**：`tauri::AppHandle` 无法在单测里构造。把核心逻辑抽成接受 `&Path` 的自由函数，`AppHandle` 版本只做路径解析后委托：

```rust
pub fn load_provider_config(app_handle: &tauri::AppHandle) -> ProviderConfig {
    load_provider_config_at(&config_path(app_handle))
}

pub fn load_provider_config_at(path: &std::path::Path) -> ProviderConfig { /* 原 load 逻辑，读 path */ }

pub fn save_provider_config(app_handle: &tauri::AppHandle, config: &ProviderConfig) -> Result<()> {
    save_provider_config_at(&config_path(app_handle), config)
}

pub fn save_provider_config_at(path: &std::path::Path, config: &ProviderConfig) -> Result<()> { /* 原 save 逻辑 */ }
```

测试里删除 `config_dir_handle`，直接用 `load_provider_config_at(&dir.path().join(CONFIG_FILE))` / `save_provider_config_at(...)`。`build_status`、`resolve_base_url`、`mask_key` 本身不依赖 AppHandle，可直接测。

- [ ] **Step 4: 运行测试通过**

```bash
cd src-tauri && cargo test translate:: 2>&1 | tail -8
```

Expected: config 相关 5 个测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/models/translate.rs src-tauri/src/models/mod.rs src-tauri/src/commands/translate/ src-tauri/src/commands/mod.rs
git commit -m "feat(translate): 翻译数据模型与供应商配置存储"
```

---

### Task 2: 提示词构建（prompt.rs）

**Files:**
- Modify: `src-tauri/src/commands/translate/prompt.rs`（替换 Task 1 占位）

**Interfaces:**
- Consumes: `models::translate::{TranslateMode, TonePreset, TranslateRequest}`
- Produces: `commands::translate::prompt::{build_system_prompt(mode, tone, custom_note: Option<&str>) -> String, build_user_prompt(&TranslateRequest) -> String}`

- [ ] **Step 1: 写失败测试（prompt.rs 底部）**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::translate::{TranslateMode, TonePreset};

    #[test]
    fn translate_prompt_contains_tone_and_rules() {
        let p = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Natural), None);
        assert!(p.contains("翻译"));
        assert!(p.contains("自然商务"));
        assert!(p.contains("不是逐词对译"));
        assert!(p.contains("只输出"));
    }

    #[test]
    fn all_tones_render_distinct_sections() {
        let natural = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Natural), None);
        let casual = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Casual), None);
        let formal = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Formal), None);
        assert!(casual.contains("轻松随和"));
        assert!(formal.contains("严谨正式"));
        assert!(natural.contains("自然商务"));
        assert_ne!(natural, casual);
        assert_ne!(casual, formal);
    }

    #[test]
    fn custom_note_is_appended() {
        let p = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Natural), Some("对方是老客户"));
        assert!(p.contains("额外要求"));
        assert!(p.contains("对方是老客户"));
        // 空白注释不追加
        let p2 = build_system_prompt(TranslateMode::Translate, Some(TonePreset::Natural), Some("   "));
        assert!(!p2.contains("额外要求"));
    }

    #[test]
    fn polish_keeps_language_and_explain_is_structured() {
        let polish = build_system_prompt(TranslateMode::Polish, Some(TonePreset::Casual), None);
        assert!(polish.contains("保持原语言"));
        let explain = build_system_prompt(TranslateMode::Explain, None, None);
        assert!(explain.contains("整体语气与意图"));
        assert!(explain.contains("关键表达解析"));
        assert!(explain.contains("备选译法"));
        // explain 忽略语气
        assert!(!explain.contains("语气要求"));
    }

    #[test]
    fn user_prompt_carries_target_language() {
        let req = crate::models::translate::TranslateRequest {
            mode: TranslateMode::Translate,
            source_lang: "auto".into(),
            target_lang: "en".into(),
            tone: None,
            custom_note: None,
            text: "你好".into(),
        };
        let p = build_user_prompt(&req);
        assert!(p.contains("英语"));
        assert!(p.contains("你好"));
    }
}
```

- [ ] **Step 2: 运行确认失败**

```bash
cd src-tauri && cargo test translate::prompt 2>&1 | tail -5
```

Expected: 编译失败（函数未定义）。

- [ ] **Step 3: 实现 prompt.rs**

```rust
use crate::models::translate::{TranslateMode, TonePreset, TranslateRequest};

/// 通用输出规则（翻译/润色共用）
const BASE_RULES: &str = "输出要求：完整保留原文格式（称呼、换行、空行、列表、签名）。人名、公司名、产品名有通用译名则使用通用译名，否则保留原文。只输出结果本身，不要任何解释、前言或后缀。";

/// 目标语言的提示词名称（提示词用中文名，模型可稳定理解）
fn language_display(code: &str) -> &str {
    match code {
        "zh" => "简体中文",
        "en" => "英语",
        "ja" => "日语",
        "ko" => "韩语",
        "de" => "德语",
        "fr" => "法语",
        "es" => "西班牙语",
        "ru" => "俄语",
        other => other,
    }
}

fn tone_section(tone: TonePreset) -> &'static str {
    match tone {
        TonePreset::Natural => "语气要求：自然商务。清晰、礼貌、直接，像一位友善且经验丰富的职业人士的日常商务邮件。避免陈旧套话和堆砌敬语（例如 \"I hope this email finds you well\" 之类的开头可以酌情简化），使用现代、自然的商务表达。",
        TonePreset::Casual => "语气要求：轻松随和。像和熟识的同事或朋友写消息，可以使用口语化表达和缩略语，语气放松但不失分寸，不要公文化。",
        TonePreset::Formal => "语气要求：严谨正式。适用于正式函件、合同沟通、对外投诉等场景：措辞严谨完整，遵循正式书信惯例，但保持可读，不生硬古板。",
    }
}

pub fn build_system_prompt(
    mode: TranslateMode,
    tone: Option<TonePreset>,
    custom_note: Option<&str>,
) -> String {
    let mut sections: Vec<String> = Vec::new();
    match mode {
        TranslateMode::Translate => {
            sections.push("你是商务沟通翻译助手，把用户输入翻译成目标语言。译文要像目标语言的母语者自然写出来的，而不是逐词对译。".into());
            if let Some(tone) = tone {
                sections.push(tone_section(tone).into());
            }
            if let Some(note) = trimmed(custom_note) {
                sections.push(format!("额外要求：{note}"));
            }
            sections.push(BASE_RULES.into());
        }
        TranslateMode::Polish => {
            sections.push("你是文字润色助手。改写用户输入，保持原语言不变：修正语法错误和不地道的表达，使文本更自然、流畅、专业。保留原意和全部信息，不增删内容。".into());
            if let Some(tone) = tone {
                sections.push(tone_section(tone).into());
            }
            if let Some(note) = trimmed(custom_note) {
                sections.push(format!("额外要求：{note}"));
            }
            sections.push(BASE_RULES.into());
        }
        TranslateMode::Explain => {
            sections.push(
                "你是商务沟通解读助手。用户会给你一封邮件或一段对话，用简体中文输出以下三部分，使用 Markdown 格式、加粗小标题：\n\n\
                 **整体语气与意图**：分析对方真实的立场和情绪——是在催促、客气拒绝、例行通知，还是暗示不满，以及希望读者做什么。\n\n\
                 **关键表达解析**：逐条列出值得注意的表达（习语、委婉语、商务套话），解释字面意思与真实含义或潜台词；没有值得解析的表达时写「无明显特殊表达」。\n\n\
                 **备选译法**：挑 1-2 个关键句，给出忠实译法与更地道译法的对比。\n\n\
                 客观中立，不要过度揣测。"
                    .into(),
            );
        }
    }
    sections.join("\n\n")
}

pub fn build_user_prompt(request: &TranslateRequest) -> String {
    match request.mode {
        TranslateMode::Translate => format!(
            "翻译成{}：\n\n{}",
            language_display(&request.target_lang),
            request.text
        ),
        TranslateMode::Polish => format!("润色以下文本：\n\n{}", request.text),
        TranslateMode::Explain => format!("解读以下内容：\n\n{}", request.text),
    }
}

fn trimmed(note: Option<&str>) -> Option<&str> {
    note.map(str::trim).filter(|n| !n.is_empty())
}
```

- [ ] **Step 4: 运行测试通过**

```bash
cd src-tauri && cargo test translate::prompt 2>&1 | tail -5
```

Expected: 5 个测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/commands/translate/prompt.rs
git commit -m "feat(translate): 三模式提示词与语气预设构建"
```

---

### Task 3: SSE 流式客户端（client.rs）

**Files:**
- Modify: `src-tauri/src/commands/translate/client.rs`（替换占位）

**Interfaces:**
- Consumes: `core::http::HttpClientBuilder`
- Produces:
  - `commands::translate::client::{ChatRequest, StreamOutcome, stream_chat, parse_sse_line, LineBuffer, map_http_error}`
  - `ChatRequest { base_url, api_key, model, system_prompt, user_prompt }`（全 String 字段）
  - `stream_chat(&ChatRequest, impl FnMut(&str), &mut watch::Receiver<bool>) -> Result<StreamOutcome, String>`，`StreamOutcome::{Completed, Cancelled}`
  - `parse_sse_line(&str) -> Result<SseLine, String>`，`SseLine::{Delta(String), Done, Ignore}`

- [ ] **Step 1: 写失败测试（client.rs 底部）**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sse_line_deltas_done_and_ignore() {
        assert!(matches!(
            parse_sse_line(r#"data: {"choices":[{"delta":{"content":"Hi"}}]}"#),
            Ok(SseLine::Delta(t)) if t == "Hi"
        ));
        // data: 后无空格的写法
        assert!(matches!(
            parse_sse_line(r#"data:{"choices":[{"delta":{"content":" 你好"}}]}"#),
            Ok(SseLine::Delta(t)) if t == " 你好"
        ));
        assert!(matches!(parse_sse_line("data: [DONE]"), Ok(SseLine::Done)));
        // role 帧 / 空 content / 注释 / 空行 → Ignore
        assert!(matches!(parse_sse_line(r#"data: {"choices":[{"delta":{"role":"assistant"}}]}"#), Ok(SseLine::Ignore)));
        assert!(matches!(parse_sse_line(r#"data: {"choices":[]}"#), Ok(SseLine::Ignore)));
        assert!(matches!(parse_sse_line(": keep-alive"), Ok(SseLine::Ignore)));
        assert!(matches!(parse_sse_line(""), Ok(SseLine::Ignore)));
        // 坏 JSON → Err
        assert!(parse_sse_line("data: {broken").is_err());
    }

    #[test]
    fn line_buffer_reassembles_split_lines_and_utf8() {
        let mut buf = LineBuffer::default();
        // 半行 + 跨块 CJK 字符（"你" 的三字节被切开）
        let mut all = Vec::new();
        all.extend(buf.push(b"data: {\"c\":\"\xe4"));
        all.extend(buf.push(b"\xbd\xa0\xe5\xa5"}\n\n"}得到不对——见下方修正"));
        let _ = all;
    }

    #[test]
    fn line_buffer_basic_and_crlf() {
        let mut buf = LineBuffer::default();
        let lines = buf.push(b"hello\r\nwor");
        assert_eq!(lines, vec!["hello".to_string()]);
        let lines = buf.push(b"ld\n");
        assert_eq!(lines, vec!["world".to_string()]);
        assert_eq!(buf.finish(), None);
    }

    #[test]
    fn line_buffer_finish_returns_tail_without_newline() {
        let mut buf = LineBuffer::default();
        let lines = buf.push(b"data: partial");
        assert!(lines.is_empty());
        assert_eq!(buf.finish().as_deref(), Some("data: partial"));
    }

    #[test]
    fn line_buffer_splits_multibyte_char_across_chunks() {
        // "你好" = e4 bd a0 e5 a5 bd，在第 2 字节后切开
        let mut buf = LineBuffer::default();
        let l1 = buf.push(&b"line:\xe4\xbd"[..]);
        assert!(l1.is_empty(), "不完整的 UTF-8 行不应提前输出");
        let l2 = buf.push(&b"\xa0\xe5\xa5\xbd\n".to_vec());
        assert_eq!(l2, vec![format!("line:你好")]);
    }

    #[test]
    fn map_http_error_is_user_friendly_and_keyless() {
        assert!(map_http_error(401, r#"{"error":{"message":"Invalid API key sk-secret"}}"#).contains("API Key 无效"));
        assert!(!map_http_error(401, r#"{"error":{"message":"Invalid API key sk-secret"}}"#).contains("sk-secret"));
        assert!(map_http_error(429, "{}").contains("频繁"));
        assert!(map_http_error(503, "upstream error").contains("供应商服务异常"));
        assert!(map_http_error(400, r#"{"error":{"message":"model not found"}}"#).contains("model not found"));
    }
}
```

注意：`line_buffer_reassembles_split_lines_and_utf8` 是起草时的坏用例（内容写错了），**不要实现它**，以 `line_buffer_basic_and_crlf`、`line_buffer_finish_returns_tail_without_newline`、`line_buffer_splits_multibyte_char_across_chunks` 三个为准。

- [ ] **Step 2: 运行确认失败**

```bash
cd src-tauri && cargo test translate::client 2>&1 | tail -5
```

Expected: 编译失败。

- [ ] **Step 3: 实现 client.rs**

```rust
use std::time::Duration;

use futures_util::StreamExt;
use tokio::sync::watch;

use crate::core::http::HttpClientBuilder;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(180);
pub const TEMPERATURE: f64 = 1.3;

/// 一次流式请求的入参（全 String，便于测试与序列化解耦）
#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub system_prompt: String,
    pub user_prompt: String,
}

/// 流结束原因
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamOutcome {
    /// 正常完成（收到 [DONE] 或连接关闭）
    Completed,
    /// 被取消信号中止
    Cancelled,
}

/// 单行 SSE 数据的解析结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SseLine {
    Delta(String),
    Done,
    Ignore,
}

/// 解析一行 SSE。`data:` 帧取 choices[0].delta.content；role 帧、空 content、
/// 注释行、空行均视为 Ignore；坏 JSON 返回 Err。
pub fn parse_sse_line(line: &str) -> Result<SseLine, String> {
    let Some(data) = line.strip_prefix("data:") else {
        return Ok(SseLine::Ignore);
    };
    let data = data.trim();
    if data == "[DONE]" {
        return Ok(SseLine::Done);
    }
    let value: serde_json::Value =
        serde_json::from_str(data).map_err(|e| format!("响应数据解析失败：{e}"))?;
    let text = value
        .pointer("/choices/0/delta/content")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if text.is_empty() {
        Ok(SseLine::Ignore)
    } else {
        Ok(SseLine::Delta(text.to_string()))
    }
}

/// SSE 行缓冲器：字节块 → 完整行。按 b'\n' 切分（UTF-8 续字节 >= 0x80，
/// 不会与换行符混淆），因此多字节字符跨块是安全的。
#[derive(Default)]
pub struct LineBuffer {
    buf: Vec<u8>,
}

impl LineBuffer {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buf.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.buf.drain(..=pos).collect();
            let line = &line[..line.len() - 1]; // 去掉 \n
            let line = String::from_utf8_lossy(line);
            lines.push(line.trim_end_matches('\r').to_string());
        }
        lines
    }

    /// 流结束时调用：返回没有换行符结尾的残余行
    pub fn finish(&mut self) -> Option<String> {
        if self.buf.is_empty() {
            return None;
        }
        let bytes = std::mem::take(&mut self.buf);
        Some(String::from_utf8_lossy(&bytes).trim_end_matches('\r').to_string())
    }
}

/// 把 HTTP 非 2xx 响应映射为用户可读中文；不透出请求体里可能包含的敏感信息
pub fn map_http_error(status: u16, body: &str) -> String {
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.pointer("/error/message").and_then(|m| m.as_str()).map(str::to_string));
    match status {
        401 | 403 => "API Key 无效或已过期，请在供应商配置中检查。".to_string(),
        429 => "请求过于频繁或额度不足，请稍后再试。".to_string(),
        500..=599 => format!("供应商服务异常（{status}），请稍后再试。"),
        _ => format!("请求失败（{status}）{}", detail.map(|d| format!("：{d}")).unwrap_or_default()),
    }
}

fn map_reqwest_error(error: reqwest::Error) -> String {
    if error.is_connect() {
        "网络连接失败。Gemini 需要系统代理，请确认代理已开启；DeepSeek 请检查网络。".to_string()
    } else if error.is_timeout() {
        "请求超时，请检查网络或稍后再试。".to_string()
    } else {
        format!("网络请求失败：{error}")
    }
}

/// 发起流式 chat completion。每个增量文本回调 on_delta；
/// cancel 收到 true 时尽快返回 Cancelled。Key 不进任何错误消息。
pub async fn stream_chat(
    request: &ChatRequest,
    mut on_delta: impl FnMut(&str),
    cancel: &mut watch::Receiver<bool>,
) -> Result<StreamOutcome, String> {
    let url = format!("{}/chat/completions", request.base_url.trim_end_matches('/'));
    let client = HttpClientBuilder::new()
        .timeout(TOTAL_TIMEOUT)
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败：{e}"))?;
    // 注：reqwest 0.11 的 per-request connect timeout 不可用，
    // 连接超时由整体 timeout 与系统 TCP 超时兜底。
    let body = serde_json::json!({
        "model": request.model,
        "stream": true,
        "temperature": TEMPERATURE,
        "messages": [
            { "role": "system", "content": request.system_prompt },
            { "role": "user", "content": request.user_prompt },
        ],
    });

    let response = client
        .post(&url)
        .bearer_auth(&request.api_key)
        .json(&body)
        .send()
        .await
        .map_err(map_reqwest_error)?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(map_http_error(status.as_u16(), &text));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = LineBuffer::default();
    loop {
        tokio::select! {
            biased;
            _ = cancel.changed() => {
                if *cancel.borrow() {
                    return Ok(StreamOutcome::Cancelled);
                }
            }
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        for line in buffer.push(&bytes) {
                            match parse_sse_line(&line)? {
                                SseLine::Delta(text) => on_delta(&text),
                                SseLine::Done => return Ok(StreamOutcome::Completed),
                                SseLine::Ignore => {}
                            }
                        }
                    }
                    Some(Err(error)) => return Err(map_reqwest_error(error)),
                    None => {
                        if let Some(line) = buffer.finish() {
                            if let SseLine::Delta(text) = parse_sse_line(&line)? {
                                on_delta(&text);
                            }
                        }
                        return Ok(StreamOutcome::Completed);
                    }
                }
            }
        }
    }
}
```

（连接超时：规格写了 15s。reqwest 0.11 的 `ClientBuilder` 无独立 connect_timeout 参数？实际上有：`client.connect_timeout(Duration)`。把 `.connect_timeout(CONNECT_TIMEOUT)` 加到 builder 链上即可，上面注释作废，按此实现：

```rust
    let client = HttpClientBuilder::new()
        .timeout(TOTAL_TIMEOUT)
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败：{e}"))?;
```

`HttpClientBuilder` 目前只暴露 timeout/user_agent。**在 `core/http.rs` 的 `HttpClientBuilder` 上加一个 `connect_timeout(Duration)` builder 方法**（内部存字段，build 时 `.connect_timeout(...)`），这是对本任务必需的最小改动，不影响现有调用方。）

- [ ] **Step 4: 运行测试通过**

```bash
cd src-tauri && cargo test translate::client 2>&1 | tail -5
```

Expected: 5 个测试 PASS（含 core/http.rs 新增 builder 方法的既有测试不回归：`cargo test proxy_tests` 也 PASS）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/commands/translate/client.rs src-tauri/src/core/http.rs
git restore src-tauri/Cargo.toml 2>/dev/null; true
git commit -m "feat(translate): OpenAI 兼容 SSE 流式客户端"
```

---

### Task 4: 翻译历史 SQLite（history.rs）

**Files:**
- Modify: `src-tauri/src/commands/translate/history.rs`（替换占位）

**Interfaces:**
- Consumes: `core::database::{create_connection, create_indexes}`、`models::translate::{HistoryEntry, HistoryRecord}`
- Produces: `commands::translate::history::{TranslateHistory, HISTORY_LIMIT}`，方法 `new(&AppHandle)` / `open(&Path)` / `insert(&HistoryRecord) -> Result<i64>` / `list(limit, offset) -> Result<Vec<HistoryEntry>>` / `delete(id) -> Result<usize>` / `clear() -> Result<usize>` / `enforce_limit() -> Result<usize>`

- [ ] **Step 1: 写失败测试（history.rs 底部）**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn db() -> (TempDir, TranslateHistory) {
        let dir = TempDir::new().unwrap();
        let db = TranslateHistory::open(&dir.path().join("t.db")).unwrap();
        (dir, db)
    }

    fn record(text: &str) -> HistoryRecord {
        HistoryRecord {
            mode: "translate".into(),
            source_lang: Some("auto".into()),
            target_lang: Some("en".into()),
            tone: Some("natural".into()),
            provider: "deepseek".into(),
            model: "deepseek-chat".into(),
            source_text: text.into(),
            result_text: format!("translated-{text}"),
        }
    }

    #[test]
    fn insert_returns_id_and_list_reads_back() {
        let (_d, db) = db();
        let id = db.insert(&record("你好")).unwrap();
        assert!(id > 0);
        let rows = db.list(10, 0).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].source_text, "你好");
        assert_eq!(rows[0].result_text, "translated-你好");
        assert_eq!(rows[0].provider, "deepseek");
        assert!(!rows[0].created_at.is_empty());
    }

    #[test]
    fn list_orders_newest_first_and_paginates() {
        let (_d, db) = db();
        db.insert(&record("a")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1100));
        db.insert(&record("b")).unwrap();
        let rows = db.list(10, 0).unwrap();
        assert_eq!(rows[0].source_text, "b");
        let page = db.list(1, 1).unwrap();
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].source_text, "a");
    }

    #[test]
    fn delete_and_clear() {
        let (_d, db) = db();
        let id = db.insert(&record("x")).unwrap();
        assert_eq!(db.delete(id).unwrap(), 1);
        db.insert(&record("y")).unwrap();
        assert!(db.clear().unwrap() >= 1);
        assert!(db.list(10, 0).unwrap().is_empty());
    }

    #[test]
    fn enforce_limit_keeps_newest() {
        let (_d, db) = db();
        for i in 0..6 {
            db.insert(&record(&i.to_string())).unwrap();
        }
        let removed = db.enforce_limit_to(4).unwrap();
        assert_eq!(removed, 2);
        let rows = db.list(10, 0).unwrap();
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[0].source_text, "5");
    }
}
```

- [ ] **Step 2: 运行确认失败**

```bash
cd src-tauri && cargo test translate::history 2>&1 | tail -5
```

Expected: 编译失败。

- [ ] **Step 3: 实现 history.rs**

```rust
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use tauri::Manager;

use crate::core::database as core_db;
use crate::models::translate::{HistoryEntry, HistoryRecord};

/// 历史上限，超出按最旧清理
pub const HISTORY_LIMIT: i64 = 500;

/// 翻译历史数据库（app_data_dir/translate_history.db）
pub struct TranslateHistory {
    conn: Connection,
}

impl TranslateHistory {
    pub fn new(app_handle: &tauri::AppHandle) -> Result<Self> {
        let dir = app_handle.path().app_data_dir().context("获取应用数据目录失败")?;
        std::fs::create_dir_all(&dir).context("创建应用数据目录失败")?;
        Self::open(&dir.join("translate_history.db"))
    }

    pub fn open(db_path: &std::path::Path) -> Result<Self> {
        let conn = core_db::create_connection(db_path).context("创建历史库连接失败")?;
        let db = Self { conn };
        db.create_tables()?;
        Ok(db)
    }

    fn create_tables(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS translate_history (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
                mode         TEXT    NOT NULL,
                source_lang  TEXT,
                target_lang  TEXT,
                tone         TEXT,
                provider     TEXT    NOT NULL,
                model        TEXT    NOT NULL,
                source_text  TEXT    NOT NULL,
                result_text  TEXT    NOT NULL
            )",
            [],
        )?;
        core_db::create_indexes(
            &self.conn,
            &["CREATE INDEX IF NOT EXISTS idx_th_created ON translate_history(id DESC)"],
        )?;
        Ok(())
    }

    pub fn insert(&self, record: &HistoryRecord) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO translate_history
             (mode, source_lang, target_lang, tone, provider, model, source_text, result_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                record.mode,
                record.source_lang,
                record.target_lang,
                record.tone,
                record.provider,
                record.model,
                record.source_text,
                record.result_text,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn list(&self, limit: i64, offset: i64) -> Result<Vec<HistoryEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, created_at, mode, source_lang, target_lang, tone,
                    provider, model, source_text, result_text
             FROM translate_history
             ORDER BY id DESC
             LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map(params![limit, offset], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                created_at: row.get(1)?,
                mode: row.get(2)?,
                source_lang: row.get(3)?,
                target_lang: row.get(4)?,
                tone: row.get(5)?,
                provider: row.get(6)?,
                model: row.get(7)?,
                source_text: row.get(8)?,
                result_text: row.get(9)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    pub fn delete(&self, id: i64) -> Result<usize> {
        Ok(self.conn.execute("DELETE FROM translate_history WHERE id = ?1", params![id])?)
    }

    pub fn clear(&self) -> Result<usize> {
        Ok(self.conn.execute("DELETE FROM translate_history", [])?)
    }

    /// 按 HISTORY_LIMIT 清理最旧记录，返回删除数
    pub fn enforce_limit(&self) -> Result<usize> {
        self.enforce_limit_to(HISTORY_LIMIT)
    }

    pub fn enforce_limit_to(&self, max_rows: i64) -> Result<usize> {
        let removed = self.conn.execute(
            "DELETE FROM translate_history WHERE id NOT IN
             (SELECT id FROM translate_history ORDER BY id DESC LIMIT ?1)",
            params![max_rows],
        )?;
        Ok(removed)
    }
}
```

注意：设计文档里的表结构有 `custom_note` 列；本任务实现里去掉了它——历史回填场景用不到自定义补充，YAGNI。规格如需对齐可回改规格文档（实现以本任务为准）。

- [ ] **Step 4: 运行测试通过**

```bash
cd src-tauri && cargo test translate::history 2>&1 | tail -5
```

Expected: 4 个测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/commands/translate/history.rs
git restore src-tauri/Cargo.toml 2>/dev/null; true
git commit -m "feat(translate): 翻译历史 SQLite 存储与 FIFO 清理"
```

---

### Task 5: 命令层、运行状态与注册

**Files:**
- Modify: `src-tauri/src/commands/translate/commands.rs`（替换占位）
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Task 1-4 全部产物
- Produces（Tauri 命令，前端依赖）:
  - `translate_run(request: TranslateRequest, onEvent: Channel<TranslateEvent>)`
  - `translate_abort()`
  - `translate_get_provider_status() -> ProviderStatus`
  - `translate_save_provider(input: SaveProviderRequest) -> ProviderStatus`
  - `translate_list_history(limit?, offset?) -> Vec<HistoryEntry>`
  - `translate_delete_history(id)` / `translate_clear_history() -> usize`
  - `TranslateRunState`（需 `app.manage`）

- [ ] **Step 1: 实现 commands.rs**

```rust
use std::sync::Mutex;

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio::sync::watch;

use super::client::{stream_chat, ChatRequest, StreamOutcome};
use super::config;
use super::history::TranslateHistory;
use super::prompt;
use crate::models::translate::{
    HistoryEntry, HistoryRecord, ProviderConfig, ProviderKind, ProviderStatus,
    SaveProviderRequest, TranslateEvent, TranslateRequest,
};

/// 同时只允许一个翻译任务；保存取消信号供 translate_abort / 新任务顶替
#[derive(Default)]
pub struct TranslateRunState {
    cancel: Mutex<Option<watch::Sender<bool>>>,
}

impl TranslateRunState {
    fn abort_running(&self) {
        if let Ok(guard) = self.cancel.lock() {
            if let Some(sender) = guard.as_ref() {
                let _ = sender.send(true);
            }
        }
    }

    fn replace(&self, sender: watch::Sender<bool>) {
        if let Ok(mut guard) = self.cancel.lock() {
            if let Some(old) = guard.replace(sender) {
                let _ = old.send(true);
            }
        }
    }
}

/// 发起一次流式翻译；事件经 Channel 推送（delta/done/error）
#[tauri::command]
pub async fn translate_run(
    request: TranslateRequest,
    on_event: Channel<TranslateEvent>,
    state: State<'_, TranslateRunState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let app = app_handle.clone();
    let config = config::load_provider_config(&app_handle);
    let kind = config.active_provider;
    let credentials = config.credentials(kind);
    if !credentials.is_configured(kind) {
        return Err("尚未配置 API Key，请先在「供应商配置」中完成设置。".into());
    }
    let chat = build_chat_request(&request, &config)?;

    let (cancel_tx, mut cancel_rx) = watch::channel(false);
    state.replace(cancel_tx);

    tauri::async_runtime::spawn(async move {
        let mut full_text = String::new();
        let outcome = stream_chat(&chat, |delta| {
            full_text.push_str(delta);
            let _ = on_event.send(TranslateEvent::Delta { text: delta.to_string() });
        }, &mut cancel_rx)
        .await;

        match outcome {
            Ok(StreamOutcome::Completed) => {
                let model = chat.model.clone();
                let provider = provider_tag(&config);
                match save_history(&app, &request, &provider, &model, &full_text) {
                    Ok(id) => {
                        let _ = on_event.send(TranslateEvent::Done { history_id: id });
                    }
                    Err(error) => {
                        log::warn!("翻译结果写入历史失败: {error}");
                        // 历史失败不影响交付结果
                        let _ = on_event.send(TranslateEvent::Done { history_id: -1 });
                    }
                }
            }
            Ok(StreamOutcome::Cancelled) => {} // 前端保留已收文本，不发事件
            Err(message) => {
                let _ = on_event.send(TranslateEvent::Error { message });
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn translate_abort(state: State<'_, TranslateRunState>) -> Result<(), String> {
    state.abort_running();
    Ok(())
}

#[tauri::command]
pub async fn translate_get_provider_status(
    app_handle: AppHandle,
) -> Result<ProviderStatus, String> {
    Ok(config::build_status(&config::load_provider_config(&app_handle)))
}

#[tauri::command]
pub async fn translate_save_provider(
    input: SaveProviderRequest,
    app_handle: AppHandle,
) -> Result<ProviderStatus, String> {
    let mut config = config::load_provider_config(&app_handle);
    {
        let cred = config.credentials_mut(input.provider);
        if let Some(key) = &input.api_key {
            cred.api_key = key.trim().to_string(); // 空串表示清除
        }
        if let Some(model) = &input.model {
            let model = model.trim();
            if !model.is_empty() {
                cred.model = model.to_string();
            }
        }
        if input.provider == ProviderKind::Custom {
            if let Some(url) = &input.base_url {
                let url = url.trim().trim_end_matches('/');
                cred.base_url = Some(url.to_string());
            }
        }
    }
    if input.set_active {
        config.active_provider = input.provider;
    }
    config::save_provider_config(&app_handle, &config)
        .map_err(|e| format!("保存配置失败：{e}"))?;
    Ok(config::build_status(&config))
}

#[tauri::command]
pub async fn translate_list_history(
    limit: Option<i64>,
    offset: Option<i64>,
    app_handle: AppHandle,
) -> Result<Vec<HistoryEntry>, String> {
    let db = TranslateHistory::new(&app_handle).map_err(|e| e.to_string())?;
    db.list(limit.unwrap_or(100).min(500), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn translate_delete_history(id: i64, app_handle: AppHandle) -> Result<(), String> {
    let db = TranslateHistory::new(&app_handle).map_err(|e| e.to_string())?;
    db.delete(id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn translate_clear_history(app_handle: AppHandle) -> Result<usize, String> {
    let db = TranslateHistory::new(&app_handle).map_err(|e| e.to_string())?;
    db.clear().map_err(|e| e.to_string())
}

// ---- 内部辅助 ----

fn build_chat_request(request: &TranslateRequest, config: &ProviderConfig) -> Result<ChatRequest, String> {
    let kind = config.active_provider;
    let credentials = config.credentials(kind);
    let base_url = config::resolve_base_url(kind, config)
        .ok_or_else(|| "自定义供应商缺少 Base URL，请在配置中填写。".to_string())?;
    let model = if credentials.model.trim().is_empty() {
        config::default_model(kind).to_string()
    } else {
        credentials.model.trim().to_string()
    };
    Ok(ChatRequest {
        base_url,
        api_key: credentials.api_key.trim().to_string(),
        model,
        system_prompt: prompt::build_system_prompt(
            request.mode,
            request.tone,
            request.custom_note.as_deref(),
        ),
        user_prompt: prompt::build_user_prompt(request),
    })
}

fn provider_tag(config: &ProviderConfig) -> String {
    match config.active_provider {
        ProviderKind::DeepSeek => "deepseek".into(),
        ProviderKind::Gemini => "gemini".into(),
        ProviderKind::Custom => "custom".into(),
    }
}

fn save_history(
    app_handle: &AppHandle,
    request: &TranslateRequest,
    provider: &str,
    model: &str,
    result_text: &str,
) -> anyhow::Result<i64> {
    let db = TranslateHistory::new(app_handle)?;
    let id = db.insert(&HistoryRecord {
        mode: match request.mode {
            crate::models::translate::TranslateMode::Translate => "translate",
            crate::models::translate::TranslateMode::Polish => "polish",
            crate::models::translate::TranslateMode::Explain => "explain",
        }
        .to_string(),
        source_lang: Some(request.source_lang.clone()),
        target_lang: Some(request.target_lang.clone()),
        tone: request.tone.map(|t| match t {
            crate::models::translate::TonePreset::Natural => "natural",
            crate::models::translate::TonePreset::Casual => "casual",
            crate::models::translate::TonePreset::Formal => "formal",
        }.to_string()),
        provider: provider.to_string(),
        model: model.to_string(),
        source_text: request.text.clone(),
        result_text: result_text.to_string(),
    })?;
    db.enforce_limit()?;
    Ok(id)
}
```

- [ ] **Step 2: 注册命令与状态（lib.rs）**

`lib.rs` 顶部 use 区追加：

```rust
use commands::translate::commands::{
    translate_abort, translate_clear_history, translate_delete_history,
    translate_get_provider_status, translate_list_history, translate_run,
    translate_save_provider, TranslateRunState,
};
```

`setup` 闭包里 `app.manage(sticky_notes::NoteWindowManager::new());` 之后追加：

```rust
            app.manage(translate::commands::TranslateRunState::default());
```

注意：`use commands::translate::commands::{...}` 与 `app.manage(translate::...)` 二选一路径风格即可（`mod commands` 里已 `pub mod translate`，`translate::commands::TranslateRunState` 路径可用；use 列表只为 generate_handler 服务）。`generate_handler!` 列表末尾（`usage_record, usage_summary,` 之后）追加：

```rust
            // Translate commands
            translate_run,
            translate_abort,
            translate_get_provider_status,
            translate_save_provider,
            translate_list_history,
            translate_delete_history,
            translate_clear_history,
```

由于 `translate_run` 等通过 use 引入，generate_handler 直接用短名。**冲突注意**：`use commands::tax::*` 等通配已在文件里，若出现名字冲突按编译器提示改用全路径写法。

- [ ] **Step 3: 全量编译与测试**

```bash
cd src-tauri && cargo test translate:: 2>&1 | tail -8 && cargo check 2>&1 | tail -3
```

Expected: translate 模块全部测试 PASS，`cargo check` 无错误。

- [ ] **Step 4: 冒烟验证命令可达（可选，dev 运行）**

`pnpm tauri dev` 启动后 DevTools console 执行：

```js
window.__TAURI__.core.invoke('translate_get_provider_status').then(console.log)
```

Expected: 返回 `{ activeProvider: 'deepseek', deepseek: { model: 'deepseek-chat', apiKeyMask: '', configured: false, ... }, ... }`。（不启动 dev 也可跳过，Task 10 结束后统一冒烟。）

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/commands/translate/commands.rs src-tauri/src/lib.rs
git restore src-tauri/Cargo.toml 2>/dev/null; true
git commit -m "feat(translate): 翻译命令层与 Channel 流式事件"
```

---

### Task 6: 前端类型与 API 封装

**Files:**
- Create: `src/types/translate.ts`
- Modify: `src/types/index.ts`（末尾追加 `export * from './translate';`）
- Create: `src/lib/api/translate.ts`
- Modify: `src/lib/api/usage.ts:74`（`USAGE_TOOL_LABELS` 加 `'translate': '翻译'`）

**Interfaces:**
- Consumes: Task 5 的全部命令名与载荷（camelCase）
- Produces: `translateApi.{getStatus, saveProvider, run, abort, listHistory, deleteHistory, clearHistory}`、`TranslateMode/TonePreset/ProviderKind/TranslateEvent/ProviderStatus/HistoryEntry/LANGUAGES/TONE_PRESETS/MODE_OPTIONS`

- [ ] **Step 1: 写类型 `src/types/translate.ts`**

```ts
export type TranslateMode = 'translate' | 'polish' | 'explain';
export type TonePreset = 'natural' | 'casual' | 'formal';
export type ProviderKind = 'deepseek' | 'gemini' | 'custom';

export interface TranslateRequest {
  mode: TranslateMode;
  sourceLang: string;
  targetLang: string;
  tone?: TonePreset;
  customNote?: string;
  text: string;
}

export type TranslateEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; historyId: number }
  | { type: 'error'; message: string };

export interface ProviderStatusEntry {
  model: string;
  baseUrl?: string | null;
  apiKeyMask: string;
  configured: boolean;
}

export interface ProviderStatus {
  activeProvider: ProviderKind;
  deepseek: ProviderStatusEntry;
  gemini: ProviderStatusEntry;
  custom: ProviderStatusEntry;
}

export interface SaveProviderInput {
  provider: ProviderKind;
  /** 传 undefined 不修改；传空字符串清除 */
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  setActive?: boolean;
}

export interface HistoryEntry {
  id: number;
  createdAt: string;
  mode: TranslateMode;
  sourceLang?: string | null;
  targetLang?: string | null;
  tone?: TonePreset | null;
  provider: string;
  model: string;
  sourceText: string;
  resultText: string;
}

export const LANGUAGES = [
  { code: 'auto', label: '自动检测' },
  { code: 'zh', label: '中文' },
  { code: 'en', label: '英语' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'de', label: '德语' },
  { code: 'fr', label: '法语' },
  { code: 'es', label: '西班牙语' },
  { code: 'ru', label: '俄语' },
] as const;

export const TONE_PRESETS: { value: TonePreset; label: string }[] = [
  { value: 'natural', label: '自然商务' },
  { value: 'casual', label: '轻松随和' },
  { value: 'formal', label: '严谨正式' },
];

export const MODE_OPTIONS: { value: TranslateMode; label: string }[] = [
  { value: 'translate', label: '翻译' },
  { value: 'polish', label: '润色' },
  { value: 'explain', label: '解释' },
];
```

`src/types/index.ts` 末尾追加：

```ts
export * from './translate';
```

- [ ] **Step 2: 写 API 封装 `src/lib/api/translate.ts`**

```ts
import { Channel, invoke } from '@tauri-apps/api/core';
import { withUsage } from '@/lib/api/usage';
import type {
  HistoryEntry,
  ProviderStatus,
  SaveProviderInput,
  TranslateEvent,
  TranslateRequest,
} from '@/types/translate';

export const translateApi = {
  async getStatus(): Promise<ProviderStatus> {
    return invoke<ProviderStatus>('translate_get_provider_status');
  },

  async saveProvider(input: SaveProviderInput): Promise<ProviderStatus> {
    return invoke<ProviderStatus>('translate_save_provider', { input });
  },

  /** 流式翻译：onEvent 依次收到 delta/done/error */
  async run(request: TranslateRequest, onEvent: (event: TranslateEvent) => void): Promise<void> {
    const channel = new Channel<TranslateEvent>();
    channel.onmessage = onEvent;
    await withUsage(
      { tool: 'translate', action: 'query', items: 1 },
      () => invoke('translate_run', { request, onEvent: channel }),
    );
  },

  async abort(): Promise<void> {
    return invoke('translate_abort');
  },

  async listHistory(limit = 100, offset = 0): Promise<HistoryEntry[]> {
    return invoke<HistoryEntry[]>('translate_list_history', { limit, offset });
  },

  async deleteHistory(id: number): Promise<void> {
    return invoke('translate_delete_history', { id });
  },

  async clearHistory(): Promise<number> {
    return invoke('translate_clear_history');
  },
};
```

注意 `withUsage` 签名：`withUsage(meta, fn, counter?)`（见 `src/lib/api/usage.ts` 与 `tax.ts` 用法），第三参可省略。

- [ ] **Step 3: 更新使用统计标签**

`src/lib/api/usage.ts:74` 的 `USAGE_TOOL_LABELS` 追加：

```ts
  translate: '翻译',
```

- [ ] **Step 4: 类型检查**

```bash
cd "D:/workspace/projects/Liao/liao/liao-tools" && pnpm build 2>&1 | tail -5
```

Expected: tsc 与 vite build 通过。

- [ ] **Step 5: 提交**

```bash
git add src/types/translate.ts src/types/index.ts src/lib/api/translate.ts src/lib/api/usage.ts
git commit -m "feat(translate): 前端类型与 API 封装"
```

---

### Task 7: 翻译工作台页面

**Files:**
- Create: `src/features/translate/TranslatePage.tsx`
- Create: `src/features/translate/components/Workbench.tsx`
- Create: `src/features/translate/components/ToneSelector.tsx`
- Create: `src/features/translate/components/LanguageSelect.tsx`

**Interfaces:**
- Consumes: `translateApi`、types from Task 6
- Produces: `TranslatePage`（Task 10 接线路由）

- [ ] **Step 1: 实现子组件**

`src/features/translate/components/ToneSelector.tsx`：

```tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input-placeholder'; // 见下方说明
import { TONE_PRESETS, type TonePreset } from '@/types/translate';

interface ToneSelectorProps {
  tone: TonePreset;
  customNote: string;
  onToneChange: (tone: TonePreset) => void;
  onCustomNoteChange: (note: string) => void;
}

/** 语气三档 + 可展开的自定义补充 */
export function ToneSelector({ tone, customNote, onToneChange, onCustomNoteChange }: ToneSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-md border border-border bg-background p-0.5">
        {TONE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onToneChange(preset.value)}
            className={[
              'px-2.5 py-1 text-xs rounded-sm transition-colors',
              tone === preset.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => setExpanded((v) => !v)}
      >
        补充
        <ChevronDown size={14} className={['transition-transform', expanded ? 'rotate-180' : ''].join(' ')} />
      </Button>
      {expanded && (
        <Textarea
          value={customNote}
          onChange={(e) => onCustomNoteChange(e.target.value)}
          placeholder="给模型的补充说明，如：对方是合作多年的老客户，语气可以随意些"
          className="h-16 text-xs"
        />
      )}
    </div>
  );
}
```

**Textarea 说明**：`components/ui/` 下没有 textarea 组件。新建 `src/components/ui/textarea.tsx`（shadcn 标准件）：

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
```

然后 ToneSelector 顶部 import 改为 `import { Textarea } from '@/components/ui/textarea';`。

`src/features/translate/components/LanguageSelect.tsx`：

```tsx
import { LANGUAGES } from '@/types/translate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const CJK_RATIO_THRESHOLD = 0.3;

/** CJK 字符占比 > 0.3 视为中文输入 */
export function detectSourceLang(text: string): 'zh' | 'en' {
  const compact = text.replace(/\s/g, '');
  if (!compact) return 'en';
  const cjk = (compact.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return cjk / compact.length > CJK_RATIO_THRESHOLD ? 'zh' : 'en';
}

interface LanguageSelectProps {
  sourceLang: string;
  targetLang: string;
  onSourceChange: (code: string) => void;
  onTargetChange: (code: string) => void;
}

/** 方向选择：源（默认自动检测）+ 目标 */
export function LanguageSelect({ sourceLang, targetLang, onSourceChange, onTargetChange }: LanguageSelectProps) {
  const targetOptions = LANGUAGES.filter((l) => l.code !== 'auto');
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Select value={sourceLang} onValueChange={onSourceChange}>
        <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>
        ))}</SelectContent>
      </Select>
      <span className="text-muted-foreground">→</span>
      <Select value={targetLang} onValueChange={onTargetChange}>
        <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{targetOptions.map((l) => (
          <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>
        ))}</SelectContent>
      </Select>
    </div>
  );
}
```

`src/features/translate/components/Workbench.tsx`：

```tsx
import { useEffect, useRef } from 'react';
import { Check, Copy, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TranslateMode } from '@/types/translate';

interface WorkbenchProps {
  mode: TranslateMode;
  input: string;
  output: string;
  running: boolean;
  error: string | null;
  onInputChange: (text: string) => void;
  onRun: () => void;
  onStop: () => void;
}

/** 输入/输出双栏工作区 */
export function Workbench({ mode, input, output, running, error, onInputChange, onRun, onStop }: WorkbenchProps) {
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const overLimit = input.length > 8000;

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const copy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
      <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
        <Textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key === 'Enter' && !running && input.trim()) onRun();
          }}
          placeholder={
            mode === 'translate' ? '输入要翻译的文本…（Ctrl+Enter 运行）'
            : mode === 'polish' ? '输入要润色的文本…（Ctrl+Enter 运行）'
            : '粘贴要解读的邮件…（Ctrl+Enter 运行）'
          }
          className="min-h-0 flex-1 resize-none rounded-lg border-0 text-sm shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
          <span>{input.length > 0 ? `${input.length} 字符` : ''}</span>
          {overLimit && <span className="text-destructive">文本较长，响应可能较慢</span>}
        </div>
      </div>
      <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
        <div ref={outputRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm whitespace-pre-wrap">
          {error ? <span className="text-destructive">{error}</span> : output}
          {running && <Loader2 size={14} className="ml-1 inline animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={!output || running} onClick={copy}>
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            {copied ? '已复制' : '复制'}
          </Button>
          {running ? (
            <Button type="button" variant="destructive" size="sm" className="h-7 text-xs" onClick={onStop}>
              <Square size={12} /> 停止
            </Button>
          ) : (
            <Button type="button" size="sm" className="h-7 text-xs" disabled={!input.trim()} onClick={onRun}>
              运行（Ctrl+Enter）
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

注意 `text-success`/`text-destructive`：先查 `src/styles/tokens.css` 里语义色名，用项目实际存在的语义 token（tax 等页面已用的类名照抄；若 success 不存在就用 `text-primary`）。

- [ ] **Step 2: 实现 TranslatePage.tsx**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { History, Languages, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { translateApi } from '@/lib/api/translate';
import { useToast } from '@/hooks/use-toast';
import { detectSourceLang, LanguageSelect } from './components/LanguageSelect';
import { ToneSelector } from './components/ToneSelector';
import { Workbench } from './components/Workbench';
import { ProviderDialog } from './components/ProviderDialog';
import { HistoryDrawer } from './components/HistoryDrawer';
import type { ProviderStatus, TonePreset, TranslateEvent, TranslateMode } from '@/types/translate';

export function TranslatePage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<TranslateMode>('translate');
  const [tone, setTone] = useState<TonePreset>('natural');
  const [customNote, setCustomNote] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('en');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0); // done 后让抽屉刷新

  useEffect(() => {
    translateApi.getStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const handleEvent = useCallback((event: TranslateEvent) => {
    if (event.type === 'delta') {
      setOutput((prev) => prev + event.text);
    } else if (event.type === 'done') {
      setRunning(false);
      setHistoryVersion((v) => v + 1);
    } else {
      setRunning(false);
      setError(event.message);
      toast({ title: '翻译失败', description: event.message, variant: 'destructive' });
    }
  }, [toast]);

  const run = useCallback(async () => {
    if (!input.trim() || running) return;
    // 方向自动检测：source=auto 且为翻译模式时按输入推断
    const detected = detectSourceLang(input);
    const source = sourceLang === 'auto' ? detected : sourceLang;
    const target = mode === 'translate'
      ? (targetLang !== 'auto' ? targetLang : (source === 'zh' ? 'en' : 'zh'))
      : source;
    setOutput('');
    setError(null);
    setRunning(true);
    try {
      await translateApi.run({
        mode,
        sourceLang: source,
        targetLang: mode === 'explain' ? 'zh' : target,
        tone: mode === 'explain' ? undefined : tone,
        customNote: mode === 'explain' ? undefined : (customNote.trim() || undefined),
        text: input,
      }, handleEvent);
    } catch (e) {
      setRunning(false);
      const message = typeof e === 'string' ? e : '发起请求失败';
      setError(message);
      toast({ title: '翻译失败', description: message, variant: 'destructive' });
    }
  }, [input, running, sourceLang, targetLang, mode, tone, customNote, handleEvent, toast]);

  const stop = useCallback(() => {
    void translateApi.abort();
    setRunning(false);
  }, []);

  // Esc 中止
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && running) stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, stop]);

  const activeConfigured = status
    ? status[status.activeProvider]?.configured
    : false;

  return (
    <div className="lt-feature flex min-h-0 flex-1 flex-col gap-3">
      <FeatureHeader icon={Languages} title="翻译" description="邮件翻译、润色与语气解读，支持 DeepSeek / Gemini" />
      <div className="flex flex-wrap items-center gap-2">
        {/* 模式三选一 */}
        <div className="flex items-center rounded-md border border-border bg-background p-0.5">
          {([['translate', '翻译'], ['polish', '润色'], ['explain', '解释']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => { setMode(value); setOutput(''); setError(null); }}
              className={[
                'px-3 py-1 text-xs rounded-sm transition-colors',
                mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'translate' && (
          <LanguageSelect
            sourceLang={sourceLang}
            targetLang={targetLang}
            onSourceChange={setSourceLang}
            onTargetChange={setTargetLang}
          />
        )}
        {mode !== 'explain' && (
          <ToneSelector tone={tone} customNote={customNote} onToneChange={setTone} onCustomNoteChange={setCustomNote} />
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setHistoryOpen(true)}>
            <History size={14} /> 历史
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setProviderOpen(true)}>
            <Settings2 size={14} /> 供应商
          </Button>
        </div>
      </div>
      <Workbench
        mode={mode}
        input={input}
        output={output}
        running={running}
        error={error}
        onInputChange={setInput}
        onRun={run}
        onStop={stop}
      />
      <ProviderDialog
        open={providerOpen}
        onOpenChange={setProviderOpen}
        status={status}
        onSaved={setStatus}
      />
      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        version={historyVersion}
        onRestore={(entry) => {
          setInput(entry.sourceText);
          setOutput(entry.resultText);
          setMode(entry.mode);
          setHistoryOpen(false);
        }}
      />
      {/* 未配置引导：覆盖在输出侧的提示由 Workbench 内 error 处理；
          这里在首次加载且未配置时自动弹配置框 */}
      {status && !activeConfigured && !providerOpen && (
        <UnconfiguredHint onOpen={() => setProviderOpen(true)} />
      )}
    </div>
  );
}

function UnconfiguredHint({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span>还没有配置模型供应商——先花一分钟填入 API Key，翻译即可使用。</span>
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onOpen}>去配置</Button>
    </div>
  );
}
```

注意：`FeatureHeader` 的实际 props 以 `src/components/layout/FeatureHeader.tsx` 为准（先读再用，保持和其他页一致）；`lt-feature` 容器类名照抄现有页面（如 TaxPage）的根布局类。

- [ ] **Step 3: 类型检查**

```bash
cd "D:/workspace/projects/Liao/liao/liao-tools" && pnpm build 2>&1 | tail -5
```

Expected: 通过（ProviderDialog/HistoryDrawer 尚未存在——本任务先创建空壳：`export function ProviderDialog(...) { return null; }` 带同签名 props，Task 8/9 实现。空壳放在各自文件里，签名与本页用法一致）。

- [ ] **Step 4: 提交**

```bash
git add src/features/translate/ src/components/ui/textarea.tsx
git commit -m "feat(translate): 翻译工作台页面（三模式/语气/流式输出）"
```

---

### Task 8: 供应商配置弹窗与新手引导

**Files:**
- Modify: `src/features/translate/components/ProviderDialog.tsx`（替换空壳）

**Interfaces:**
- Consumes: `translateApi.getStatus/saveProvider`、`ProviderStatus`
- Produces: `ProviderDialog({ open, onOpenChange, status, onSaved })`

- [ ] **Step 1: 实现配置弹窗**

```tsx
import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { translateApi } from '@/lib/api/translate';
import type { ProviderKind, ProviderStatus } from '@/types/translate';

const PROVIDER_META: Record<Exclude<ProviderKind, 'custom'>, { label: string; applyUrl: string; applyHint: string }> = {
  deepseek: {
    label: 'DeepSeek',
    applyUrl: 'https://platform.deepseek.com/api_keys',
    applyHint: '注册后在「API Keys」页创建，Key 以 sk- 开头。国内直连可用。',
  },
  gemini: {
    label: 'Gemini',
    applyUrl: 'https://aistudio.google.com/apikey',
    applyHint: 'Google AI Studio 创建 Key。国内使用需要开启系统代理。',
  },
};

interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: ProviderStatus | null;
  onSaved: (status: ProviderStatus) => void;
}

export function ProviderDialog({ open, onOpenChange, status, onSaved }: ProviderDialogProps) {
  const [provider, setProvider] = useState<ProviderKind>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // 打开时把当前激活供应商的配置回填表单
  useEffect(() => {
    if (!open || !status) return;
    setProvider(status.activeProvider);
    const entry = status[status.activeProvider];
    setModel(entry?.model ?? '');
    setBaseUrl(entry?.baseUrl ?? '');
    setApiKey(''); // Key 永远不回填明文
  }, [open, status]);

  const save = async () => {
    setSaving(true);
    try {
      const next = await translateApi.saveProvider({
        provider,
        apiKey: apiKey.trim() ? apiKey.trim() : undefined,
        model: model.trim() && model.trim() !== status?.[provider]?.model ? model.trim() : undefined,
        baseUrl: provider === 'custom' ? baseUrl : undefined,
        setActive: true,
      });
      onSaved(next);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const entry = status?.[provider];
  const models = provider === 'deepseek'
    ? ['deepseek-chat', 'deepseek-reasoner']
    : provider === 'gemini'
      ? ['gemini-2.5-flash', 'gemini-2.5-pro']
      : [];
  const knownModel = models.includes(model);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>供应商配置</DialogTitle>
          <DialogDescription>选择一家服务商并填入 API Key，配置保存在本机。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(['deepseek', 'gemini', 'custom'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => { setProvider(kind); setModel(status?.[kind]?.model ?? ''); setApiKey(''); }}
                className={[
                  'rounded-md border px-2 py-2 text-xs transition-colors',
                  provider === kind ? 'border-primary bg-primary/5 font-medium' : 'border-border text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {kind === 'custom' ? '自定义' : PROVIDER_META[kind].label}
                {status?.[kind]?.configured && <span className="ml-1 text-primary">✓</span>}
              </button>
            ))}
          </div>

          {provider !== 'custom' && (
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>{PROVIDER_META[provider].applyHint}</p>
              <Button type="button" variant="link" className="h-5 p-0 text-xs" onClick={() => void openUrl(PROVIDER_META[provider].applyUrl)}>
                前往申请 API Key ↗
              </Button>
            </div>
          )}

          {provider === 'custom' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Base URL（以 /v1 结尾）</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" className="h-8 text-xs" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">API Key {entry?.apiKeyMask ? `（已保存 ${entry.apiKeyMask}）` : ''}</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={entry?.apiKeyMask ? '留空则不修改' : '粘贴 API Key'}
              className="h-8 text-xs"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">模型</Label>
            {models.length > 0 ? (
              <div className="flex gap-2">
                <Select value={knownModel ? model : '__custom'} onValueChange={(v) => v !== '__custom' && setModel(v)}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {models.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                    <SelectItem value="__custom" className="text-xs">自定义…</SelectItem>
                  </SelectContent>
                </Select>
                {!knownModel && (
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="模型名" className="h-8 flex-1 text-xs" />
                )}
              </div>
            ) : (
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="模型名，如 gpt-4o-mini" className="h-8 text-xs" />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" className="h-8 text-xs" disabled={saving || !model.trim()} onClick={save}>
            {saving ? '保存中…' : '保存并启用'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

注意：`status[status.activeProvider]` 的索引访问在 TS 下需要 `Record<ProviderKind, ProviderStatusEntry>` 兼容——若报类型错，给 ProviderStatus 加索引签名或用具名属性三元。

- [ ] **Step 2: 类型检查 + 提交**

```bash
cd "D:/workspace/projects/Liao/liao/liao-tools" && pnpm build 2>&1 | tail -3
git add src/features/translate/components/ProviderDialog.tsx
git commit -m "feat(translate): 供应商配置弹窗与申请引导"
```

---

### Task 9: 历史抽屉

**Files:**
- Modify: `src/features/translate/components/HistoryDrawer.tsx`（替换空壳）

**Interfaces:**
- Consumes: `translateApi.listHistory/deleteHistory/clearHistory`、`HistoryEntry`
- Produces: `HistoryDrawer({ open, onOpenChange, version, onRestore })`

- [ ] **Step 1: 实现（Dialog 右侧宽弹窗，列表 + 预览）**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { translateApi } from '@/lib/api/translate';
import { useToast } from '@/hooks/use-toast';
import type { HistoryEntry } from '@/types/translate';

const MODE_LABELS: Record<string, string> = { translate: '翻译', polish: '润色', explain: '解释' };
const TONE_LABELS: Record<string, string> = { natural: '自然商务', casual: '轻松随和', formal: '严谨正式' };

interface HistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 完成一次翻译后递增，触发重新加载 */
  version: number;
  onRestore: (entry: HistoryEntry) => void;
}

export function HistoryDrawer({ open, onOpenChange, version, onRestore }: HistoryDrawerProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const reload = useCallback(() => {
    translateApi.listHistory(100, 0).then(setEntries).catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open, version, reload]);

  const remove = async (id: number) => {
    await translateApi.deleteHistory(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const clearAll = async () => {
    const n = await translateApi.clearHistory();
    setEntries([]);
    toast({ title: '历史已清空', description: `共删除 ${n} 条` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            翻译历史
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" disabled={!entries.length} onClick={clearAll}>
              <Trash2 size={12} /> 清空
            </Button>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-2">
          <div className="space-y-2">
            {entries.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">还没有历史记录</p>
            )}
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onRestore(entry)}
                className="block w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{entry.createdAt}</span>
                  <span>{MODE_LABELS[entry.mode] ?? entry.mode}</span>
                  {entry.tone && <span>· {TONE_LABELS[entry.tone] ?? entry.tone}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    {entry.provider} / {entry.model}
                    <Trash2
                      size={12}
                      className="hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); void remove(entry.id); }}
                    />
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{entry.sourceText}</p>
                <p className="mt-0.5 line-clamp-2 text-sm">{entry.resultText}</p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 类型检查 + 提交**

```bash
cd "D:/workspace/projects/Liao/liao/liao-tools" && pnpm build 2>&1 | tail -3
git add src/features/translate/components/HistoryDrawer.tsx
git commit -m "feat(translate): 翻译历史抽屉（回填/删除/清空）"
```

---

### Task 10: 入口接线

**Files:**
- Modify: `src/App.tsx`（import + Route）
- Modify: `src/components/layout/Sidebar.tsx`（效率工具组加项 + `Languages` import）
- Modify: `src/components/layout/navigation.ts`（效率工具组加项 + `Languages` import）
- Modify: `src/features/home/HomePage.tsx`（tools 数组加项 + `Languages` import + 计数文案）

- [ ] **Step 1: 路由。** App.tsx：`import { TranslatePage } from './features/translate/TranslatePage';`；在 `<Route path="revcal" ... />` 之后加：

```tsx
          <Route path="translate" element={<TranslatePage />} />
```

- [ ] **Step 2: 侧边栏。** Sidebar.tsx：`import { ..., Languages } from 'lucide-react'`（按文件现有 import 风格）；「效率工具」组的 Todo 清单项后加：

```tsx
    { label: '翻译', href: '/translate', icon: Languages },
```

- [ ] **Step 3: 命令面板。** navigation.ts：import 区加 `Languages`；「效率工具」组 items 追加：

```ts
      { title: '翻译', href: '/translate', icon: Languages, description: '邮件翻译、润色与语气解读', keywords: ['翻译', 'translate', '邮件', '润色', '解释', 'deepseek', 'gemini'] },
```

- [ ] **Step 4: 首页卡片。** HomePage.tsx：import `Languages`；`tools` 数组 Todo 清单后加：

```tsx
  { name: '翻译', text: '邮件翻译、润色与语气解读', to: '/translate', icon: Languages, accent: 'blue' },
```

同时把「6 个核心工具」改为「7 个核心工具」（若模板字符串/文案在别处，grep `个核心工具`）。

- [ ] **Step 5: 类型检查 + 提交**

```bash
cd "D:/workspace/projects/Liao/liao/liao-tools" && pnpm build 2>&1 | tail -3 && pnpm lint:tokens 2>&1 | tail -3
git add src/App.tsx src/components/layout/Sidebar.tsx src/components/layout/navigation.ts src/features/home/HomePage.tsx
git commit -m "feat(translate): 翻译功能入口（侧边栏/命令面板/首页）"
```

---

### Task 11: 全量验证与手动验收

**Files:**
- 无新文件（只验证 + 修复）

- [ ] **Step 1: 后端全量测试**

```bash
export PATH="/c/Users/A/AppData/Local/nasm/nasm-2.16.03:$PATH"
export LIBCLANG_PATH="C:\Users\A\AppData\Roaming\Python\Python311\site-packages\clang\native"
cd src-tauri && cargo test 2>&1 | tail -6
```

Expected: 全部 PASS（含既有 alta/tax/update_history 测试不回归）。

- [ ] **Step 2: 前端全量构建与 lint**

```bash
cd "D:/workspace/projects/Liao/liao/liao-tools" && pnpm build 2>&1 | tail -3 && pnpm lint:tokens
```

Expected: build 成功；lint:tokens 对新文件无输出（脚本本身 exit 0，看有没有新增行）。

- [ ] **Step 3: 手动冒烟（pnpm tauri dev）**

按顺序验证并记录结果：
1. 侧边栏/首页/命令面板能进入翻译页；
2. 未配置时显示引导条，点「去配置」打开弹窗；
3. 配置 DeepSeek（真实 Key）→ 翻译一段中文邮件 → 流式输出、复制可用、历史出现新条目；
4. 三种模式各跑一次（解释模式确认输出三段结构）；
5. 三档语气对比同一输入，确认「自然商务」不古板、「轻松随和」够口语；
6. 中英方向自动检测：中文输入显示 中→英，英文输入显示 英→中；
7. 运行中点「停止」和按 Esc → 已生成文本保留；
8. 配置错误 Key → 输出区显示「API Key 无效或已过期」；
9. 断网（或关代理）→ 显示网络错误提示；
10. 历史抽屉：回填、单条删除、清空；
11. 自定义补充框输入「对方是老客户，语气随意些」→ 译文语气变化；
12. 使用统计页出现「翻译」工具行。

发现问题按粒度修复并各自提交（`fix(translate): …`）。

- [ ] **Step 4: 收尾提交（若有修复后的最终校验）**

```bash
git status --short
```

Expected: 干净（`src-tauri/Cargo.toml` 若因构建变 CRLF，`git restore src-tauri/Cargo.toml`）。

---

## Self-Review 记录

1. **规格覆盖**：配置存储(§4)→Task 1；流式协议(§5)→Task 3/5；提示词(§6)→Task 2；交互(§7.1/7.2)→Task 7；历史(§7.3/§8)→Task 4/9；错误处理(§9)→Task 3/5/7；入口(§7.4)→Task 10；新手引导(§1/§4.2)→Task 8；测试(§10)→各任务步骤+Task 11。规格 §8 的 `custom_note` 列在 Task 4 中裁剪（YAGNI），已在任务内注明以实现为准。
2. **占位符扫描**：Task 1 的占位文件仅限 Task 1 提交内存在，Task 2-5 逐一替换；无 TBD/TODO。
3. **类型一致性**：`TranslateEvent` 三变体（delta/done/error）在 Task 1（Rust serde tag=type）、Task 6（TS 判别联合）、Task 7（handleEvent）一致；`translateApi` 方法名在 Task 7/8/9 引用一致；`StreamOutcome::{Completed, Cancelled}` 在 Task 3 定义、Task 5 消费一致；`enforce_limit_to(max)` 在 Task 4 定义并测试、`enforce_limit()` 包装常量供 Task 5 使用，一致。
