use serde::{Deserialize, Serialize};

/// 单条变更记录（对应 change_log 一行）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRecord {
    pub session_id: String,
    pub module: String,            // 'tax' | 'alta'
    pub update_type: String,       // 'full' | 'single'
    pub version_from: Option<String>,
    pub version_to: Option<String>,
    pub code: String,
    pub field: Option<String>,     // None 表示整条新增/删除
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub change_type: String,       // 'added' | 'removed' | 'modified'
}

/// 历史列表中一次更新的摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub module: String,
    pub update_type: String,
    pub version_to: Option<String>,
    pub timestamp: String,
    pub change_count: i64,
}

/// 单条变更明细（含 id 与 timestamp，用于明细展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeDetail {
    pub id: i64,
    pub session_id: String,
    pub module: String,
    pub update_type: String,
    pub version_from: Option<String>,
    pub version_to: Option<String>,
    pub timestamp: String,
    pub code: String,
    pub field: Option<String>,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub change_type: String,
}
