use serde::{Deserialize, Serialize};

/// 批量查询请求（API Key 由前端本地保存、调用时传入）
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackingQueryRequest {
    pub numbers: Vec<String>,
    pub api_key: String,
}

/// 单号查询结果行（导出时会从原样传回，需要 Deserialize）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackingRow {
    pub number: String,
    /// 承运商名称（取自轨迹 provider，可能为空）
    pub carrier: String,
    /// 17TRACK 主状态原文（如 InTransit / Delivered）
    pub status: String,
    pub sub_status: String,
    pub latest_event_time: String,
    pub latest_event_description: String,
    pub latest_event_location: String,
    pub transit_days: Option<i64>,
    /// 预计送达区间展示串，如 "2026-10-20 ~ 2026-10-24"
    pub estimated_delivery: String,
    /// 查询失败 / 未注册 / 额度不足等原因
    pub error: Option<String>,
}

/// 批量查询结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackingBatchResult {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub rows: Vec<TrackingRow>,
}
