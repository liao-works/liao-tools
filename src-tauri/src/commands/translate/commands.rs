use std::sync::Mutex;

use tauri::ipc::Channel;
use tauri::{AppHandle, State};
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
