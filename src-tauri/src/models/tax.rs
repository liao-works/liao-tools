use serde::{Deserialize, Serialize};

/// 税率信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaxTariff {
    pub code: String,
    pub description: Option<String>,
    pub rate: String,
    pub url: String,
    pub north_ireland_rate: Option<String>,
    pub north_ireland_url: Option<String>,
    pub other_rate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anti_dumping_rate: Option<String>, // 反倾销税率
    #[serde(skip_serializing_if = "Option::is_none")]
    pub countervailing_rate: Option<String>, // 反补贴税率
    pub last_updated: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub similarity: Option<f64>, // 仅用于模糊查询
}

/// 版本详情
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionDetail {
    pub version: String,
    pub records: i64,
    pub date: String,
}

/// 更新日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelogItem {
    pub date: String,
    pub message: String,
}

/// 单条数据变动（服务端 data_changes.changes 元素，用于更新前预览）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelogEntry {
    pub code: String,
    pub change_type: String, // 'added' | 'removed' | 'modified'
    #[serde(default)]
    pub description: String,
    pub field: Option<String>,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChangelogSummary {
    #[serde(default)]
    pub added: i64,
    #[serde(default)]
    pub removed: i64,
    #[serde(default)]
    pub modified: i64,
}

/// 服务端发布的版本数据变动明细（更新前预览用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataChanges {
    pub version: Option<String>,
    pub previous_version: Option<String>,
    #[serde(default)]
    pub summary: ChangelogSummary,
    #[serde(default)]
    pub changes: Vec<ChangelogEntry>,
}

/// 版本信息
#[derive(Debug, Clone, Serialize)]
pub struct TaxVersionInfo {
    pub local: VersionDetail,
    pub remote: VersionDetail,
    pub has_update: bool,
    pub changelog: Vec<ChangelogItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_changes: Option<DataChanges>,
}

/// 批量处理结果
#[derive(Debug, Clone, Serialize)]
pub struct BatchResult {
    pub total: usize,
    pub success: usize,
    pub errors: Vec<String>,
    pub output_path: String,
}

/// 远程元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteMetadata {
    pub version: String,
    pub timestamp: String,
    pub last_modified: String,
    pub file_size: u64,
    pub record_count: i64,
    pub download_urls: DownloadUrls,
    #[serde(default)]
    pub changelog: Option<Vec<ChangelogItem>>,
    #[serde(default)]
    pub data_changes: Option<DataChanges>,
}

/// 下载URL
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadUrls {
    pub primary: String,
    pub metadata: String,
    #[serde(default)]
    pub mirror: Vec<String>,
}

/// 单行更新结果
#[derive(Debug, Clone, Serialize)]
pub struct UpdateResult {
    pub success: bool,
    pub message: String,
    pub uk_updated: bool,
    pub ni_updated: bool,
    pub old_uk_rate: Option<String>,
    pub new_uk_rate: Option<String>,
    pub old_ni_rate: Option<String>,
    pub new_ni_rate: Option<String>,
    pub new_description: Option<String>,
}
