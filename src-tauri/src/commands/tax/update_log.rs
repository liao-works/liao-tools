//! 数据更新事件日志（JSONL，追加写）。
//!
//! 与 update_history.db 的逐字段 diff 互补：这里记录每次检查、下载、
//! 安装、失败与回滚等事件级流水，供客户端展示"数据更新日志"时间线。
//! 日志是尽力而为的辅助信息，任何写入失败都不影响数据更新本身。

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

const LOG_FILE: &str = "tax-update-events.jsonl";
const MAX_EVENTS: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum UpdateEventKind {
    /// 手动/自动检查远程版本
    #[serde(rename_all = "camelCase")]
    Check {
        ok: bool,
        has_update: bool,
        remote_version: Option<String>,
        detail: Option<String>,
    },
    /// 开始下载
    #[serde(rename_all = "camelCase")]
    DownloadStart {
        from_version: String,
        to_version: String,
    },
    /// 下载并校验完成（尚未落盘切换）
    #[serde(rename_all = "camelCase")]
    DownloadComplete {
        to_version: String,
        size_bytes: u64,
        duration_ms: u64,
    },
    /// 新快照已切换为本地正式库
    #[serde(rename_all = "camelCase")]
    Install {
        from_version: String,
        to_version: String,
        record_count: i64,
    },
    /// 检查/下载/安装任一环节失败（本地数据未被破坏时也会记录）
    #[serde(rename_all = "camelCase")]
    Failure {
        stage: String,
        detail: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEvent {
    pub timestamp: String,
    #[serde(flatten)]
    pub kind: UpdateEventKind,
}

fn log_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .context("App data directory")?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(LOG_FILE))
}

/// 追加一条事件。调用方负责只传已确定的信息；写失败只打日志。
pub fn append(app_handle: &tauri::AppHandle, kind: UpdateEventKind) {
    if let Err(err) = try_append(app_handle, kind) {
        log::warn!("Cannot append tax update event: {}", err);
    }
}

fn try_append(app_handle: &tauri::AppHandle, kind: UpdateEventKind) -> Result<()> {
    let path = log_path(app_handle)?;
    let event = UpdateEvent {
        timestamp: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        kind,
    };
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    writeln!(file, "{}", serde_json::to_string(&event)?)?;
    Ok(())
}

/// 读取最近的事件（新→旧）。损坏行跳过，不整体失败。
pub fn read_events(app_handle: &tauri::AppHandle, limit: usize) -> Result<Vec<UpdateEvent>> {
    let path = log_path(app_handle)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let mut events: Vec<UpdateEvent> = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<UpdateEvent>(line) {
            Ok(event) => events.push(event),
            Err(_) => log::warn!("Skipping malformed tax update event line"),
        }
    }
    events.reverse(); // 新→旧
    events.truncate(limit.max(1).min(MAX_EVENTS));
    Ok(events)
}

/// 清理全部事件日志（用户显式操作）。
pub fn clear_events(app_handle: &tauri::AppHandle) -> Result<usize> {
    let path = log_path(app_handle)?;
    if !path.exists() {
        return Ok(0);
    }
    let count = std::fs::read_to_string(&path)?
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count();
    std::fs::remove_file(&path)?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_roundtrip_and_limit() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(LOG_FILE);
        // 直接走内部函数验证序列化格式稳定
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .unwrap();
        for i in 0..3 {
            let event = UpdateEvent {
                timestamp: format!("2026-10-17T10:0{}:00Z", i),
                kind: UpdateEventKind::Install {
                    from_version: "a".into(),
                    to_version: format!("data-{}", i),
                    record_count: 16_744,
                },
            };
            writeln!(file, "{}", serde_json::to_string(&event).unwrap()).unwrap();
        }
        let raw = std::fs::read_to_string(&path).unwrap();
        let parsed: Vec<UpdateEvent> = raw
            .lines()
            .filter(|l| !l.trim().is_empty())
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(parsed.len(), 3);
        assert!(matches!(
            parsed[0].kind,
            UpdateEventKind::Install { ref to_version, .. } if to_version == "data-0"
        ));
    }

    #[test]
    fn check_event_serializes_camelCase() {
        let event = UpdateEvent {
            timestamp: "2026-10-17T00:00:00Z".into(),
            kind: UpdateEventKind::Check {
                ok: true,
                has_update: false,
                remote_version: Some("data-x".into()),
                detail: None,
            },
        };
        let raw = serde_json::to_string(&event).unwrap();
        assert!(raw.contains("\"hasUpdate\":false"));
        assert!(raw.contains("\"type\":\"check\""));
    }
}
