use super::database::DatabaseManager;
use crate::models::alta::{AltaQueryResult, MatchResult, MatchedItem};
use anyhow::Result;
use log::{debug, info};
use std::sync::{Arc, Mutex};

/// HS编码匹配器
pub struct HSCodeMatcher {
    db: Arc<Mutex<DatabaseManager>>,
}

impl HSCodeMatcher {
    /// 创建新的匹配器
    pub fn new(db: Arc<Mutex<DatabaseManager>>) -> Self {
        Self { db }
    }

    /// 清理HS编码（去除空格、特殊字符，只保留数字）
    pub fn clean_hs_code(&self, hs_code: &str) -> String {
        hs_code
            .chars()
            .filter(|c| c.is_ascii_digit())
            .collect()
    }

    /// 匹配HS编码
    pub fn match_code(&self, hs_code: &str, match_length: Option<u8>) -> Result<MatchResult> {
        // 清理HS编码
        let clean_code = self.clean_hs_code(hs_code);

        if clean_code.is_empty() {
            return Ok(MatchResult {
                is_forbidden: false,
                matched_codes: vec![],
                descriptions: vec![],
                match_type: "无效编码".to_string(),
            });
        }

        // 检查编码长度是否足够
        if let Some(length) = match_length {
            if clean_code.len() < length as usize {
                return Ok(MatchResult {
                    is_forbidden: false,
                    matched_codes: vec![],
                    descriptions: vec![],
                    match_type: format!("编码长度不足{}位", length),
                });
            }
        }

        // 查询数据库
        let db = self.db.lock().unwrap();
        let results = db.search_by_hs_code(&clean_code, match_length)?;

        if !results.is_empty() {
            let match_type = match match_length {
                Some(4) => "4位匹配",
                Some(6) => "6位匹配",
                Some(8) => "8位匹配",
                _ => "完全匹配",
            };

            let matched_codes: Vec<String> = results.iter().map(|item| item.hs_code.clone()).collect();
            let descriptions: Vec<String> = results.iter().map(|item| item.description.clone()).collect();

            debug!("匹配到 {} 条记录，匹配类型: {}", results.len(), match_type);

            Ok(MatchResult {
                is_forbidden: true,
                matched_codes,
                descriptions,
                match_type: match_type.to_string(),
            })
        } else {
            Ok(MatchResult {
                is_forbidden: false,
                matched_codes: vec![],
                descriptions: vec![],
                match_type: "未匹配".to_string(),
            })
        }
    }

    /// 批量匹配HS编码
    pub fn batch_match(
        &self,
        hs_codes: Vec<String>,
        match_length: Option<u8>,
    ) -> Result<Vec<MatchResult>> {
        let mut results = Vec::new();

        for hs_code in hs_codes {
            let result = self.match_code(&hs_code, match_length)?;
            results.push(result);
        }

        info!("批量匹配完成，共处理 {} 条记录", results.len());
        Ok(results)
    }

    /// 转换为前端查询结果格式
    pub fn to_query_result(&self, hs_code: &str, match_result: &MatchResult) -> AltaQueryResult {
        let status = if match_result.is_forbidden {
            "forbidden"
        } else {
            "safe"
        };

        let description = if match_result.is_forbidden && !match_result.descriptions.is_empty() {
            match_result.descriptions[0].clone()
        } else if match_result.match_type == "无效编码" {
            "无效的HS编码".to_string()
        } else if match_result.match_type.starts_with("编码长度不足") {
            match_result.match_type.clone()
        } else {
            "该商品未在禁运列表中".to_string()
        };

        let matched_items = if match_result.is_forbidden {
            let items: Vec<MatchedItem> = match_result
                .matched_codes
                .iter()
                .zip(match_result.descriptions.iter())
                .map(|(code, desc)| {
                    let level = if match_result.match_type.contains("4位") {
                        4
                    } else if match_result.match_type.contains("6位") {
                        6
                    } else if match_result.match_type.contains("8位") {
                        8
                    } else {
                        10
                    };

                    MatchedItem {
                        code: code.clone(),
                        description: desc.clone(),
                        level,
                    }
                })
                .collect();
            Some(items)
        } else {
            None
        };

        AltaQueryResult {
            code: hs_code.to_string(),
            status: status.to_string(),
            description,
            matched_items,
        }
    }

    /// 获取匹配统计信息
    pub fn get_match_statistics(&self, results: &[MatchResult]) -> serde_json::Value {
        let total = results.len();
        let forbidden = results.iter().filter(|r| r.is_forbidden).count();
        let safe = results
            .iter()
            .filter(|r| !r.is_forbidden && r.match_type == "未匹配")
            .count();
        let invalid = results
            .iter()
            .filter(|r| {
                r.match_type == "无效编码" || r.match_type.starts_with("编码长度不足")
            })
            .count();

        let forbidden_rate = if total > 0 {
            format!("{:.2}%", (forbidden as f64 / total as f64) * 100.0)
        } else {
            "0%".to_string()
        };

        serde_json::json!({
            "total": total,
            "forbidden": forbidden,
            "safe": safe,
            "invalid": invalid,
            "forbidden_rate": forbidden_rate
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::database::DatabaseManager;
    use crate::models::alta::ForbiddenItem;
    use std::sync::{Arc, Mutex};
    use tempfile::NamedTempFile;

    #[test]
    fn test_clean_hs_code() {
        let temp_file = NamedTempFile::new().unwrap();
        let db = Arc::new(Mutex::new(DatabaseManager::new(temp_file.path()).unwrap()));
        let matcher = HSCodeMatcher::new(db);

        assert_eq!(matcher.clean_hs_code("12-34 56"), "123456");
        assert_eq!(matcher.clean_hs_code("ABC123"), "123");
        assert_eq!(matcher.clean_hs_code("  9876  "), "9876");
    }

    #[test]
    fn test_match_code() {
        let temp_file = NamedTempFile::new().unwrap();
        let db_manager = DatabaseManager::new(temp_file.path()).unwrap();

        // 插入测试数据
        let items = vec![ForbiddenItem {
            id: None,
            hs_code: "123456".to_string(),
            hs_code_4: "1234".to_string(),
            hs_code_6: "123456".to_string(),
            hs_code_8: "123456".to_string(),
            description: "Test Item".to_string(),
            additional_info: "Info".to_string(),
            source_url: "https://example.com".to_string(),
            created_at: None,
        }];
        db_manager.update_forbidden_items(items).unwrap();

        let db = Arc::new(Mutex::new(db_manager));
        let matcher = HSCodeMatcher::new(db);

        // 测试4位匹配
        let result = matcher.match_code("123456", Some(4)).unwrap();
        assert!(result.is_forbidden);
        assert_eq!(result.match_type, "4位匹配");

        // 测试未匹配
        let result = matcher.match_code("999999", Some(4)).unwrap();
        assert!(!result.is_forbidden);
    }
}
