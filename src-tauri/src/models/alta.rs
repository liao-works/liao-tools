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

    // === 新增字段 (v2) ===
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_text: Option<String>,          // 原始 HS 编码文本

    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_exceptions: Option<bool>,      // 是否包含例外
}

/// HS 编码条目（用于解析结果）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HsCodeEntry {
    pub code: String,
    pub code_4: String,
    pub code_6: String,
    pub code_8: String,
    pub is_exception: bool,
    pub parent_raw: String,
}

/// 匹配结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResult {
    pub is_forbidden: bool,
    pub matched_codes: Vec<String>,
    pub descriptions: Vec<String>,
    pub match_type: String,
    pub raw_texts: Vec<Option<String>>,      // 原始文本列表
    pub has_exceptions: Vec<bool>,            // 是否包含例外列表
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
    pub raw_text: Option<String>,         // 原始 HS 编码文本
    pub has_exceptions: Option<bool>,     // 是否包含例外
}

/// Alta 查询结果（前端接口）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AltaQueryResult {
    pub code: String,
    pub status: String, // "forbidden" or "safe"
    pub description: String,
    pub matched_items: Option<Vec<MatchedItem>>,
}

// ============================================================================
// ForbiddenItem 辅助方法
// ============================================================================

impl ForbiddenItem {
    /// 创建 v1 格式的条目（向后兼容）
    pub fn new_v1(
        hs_code: String,
        description: String,
        additional_info: String,
    ) -> Self {
        let hs_code_4 = Self::prefix(&hs_code, 4);
        let hs_code_6 = Self::prefix(&hs_code, 6);
        let hs_code_8 = Self::prefix(&hs_code, 8);

        Self {
            id: None,
            hs_code,
            hs_code_4,
            hs_code_6,
            hs_code_8,
            description,
            additional_info,
            source_url: String::new(),
            created_at: None,
            raw_text: None,
            has_exceptions: None,
        }
    }

    /// 创建 v2 格式的条目（含完整信息）
    pub fn new_v2(
        code: HsCodeEntry,
        raw_text: String,
        has_exceptions: bool,
        description: String,
        additional_info: String,
        source_url: String,
    ) -> Self {
        let enhanced_description = if has_exceptions {
            format!("{} [含例外]", description)
        } else {
            description
        };

        Self {
            id: None,
            hs_code: code.code.clone(),
            hs_code_4: code.code_4,
            hs_code_6: code.code_6,
            hs_code_8: code.code_8,
            description: enhanced_description,
            additional_info,
            source_url,
            created_at: None,
            raw_text: Some(raw_text),
            has_exceptions: Some(has_exceptions),
        }
    }

    fn prefix(code: &str, len: usize) -> String {
        if code.len() >= len {
            code[..len].to_string()
        } else {
            code.to_string()
        }
    }
}
