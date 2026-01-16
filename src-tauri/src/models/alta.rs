use serde::{Deserialize, Serialize};

/// 禁运商品模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForbiddenItem {
    pub id: Option<i64>,
    pub hs_code: String,
    pub hs_code_4: String,
    pub hs_code_6: String,
    pub hs_code_8: String,
    pub description: String,
    pub additional_info: String,
    pub source_url: String,
    pub created_at: Option<String>,
}

/// 匹配结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResult {
    pub is_forbidden: bool,
    pub matched_codes: Vec<String>,
    pub descriptions: Vec<String>,
    pub match_type: String,
}

/// 查询请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryRequest {
    pub hs_code: String,
    pub match_length: Option<u8>, // 4, 6, 8, or None for exact
}

/// 更新结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateResult {
    pub success: bool,
    pub items_count: usize,
    pub message: String,
}

/// 数据库信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseInfo {
    pub total_items: i64,
    pub last_update: Option<String>,
    pub db_size: u64,
}

/// Excel 处理统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcelStats {
    pub total: usize,
    pub forbidden: usize,
    pub safe: usize,
    pub invalid: usize,
    pub output_path: String,
}

/// 匹配的商品项（用于前端显示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchedItem {
    pub code: String,
    pub description: String,
    pub level: u8,
}

/// Alta 查询结果（前端接口）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AltaQueryResult {
    pub code: String,
    pub status: String, // "forbidden" or "safe"
    pub description: String,
    pub matched_items: Option<Vec<MatchedItem>>,
}
