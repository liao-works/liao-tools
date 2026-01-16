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

/// 版本信息
#[derive(Debug, Clone, Serialize)]
pub struct TaxVersionInfo {
    pub local: VersionDetail,
    pub remote: VersionDetail,
    pub has_update: bool,
    pub changelog: Vec<ChangelogItem>,
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
