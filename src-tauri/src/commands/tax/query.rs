use crate::commands::tax::database::TaxDatabase;
use crate::models::tax::TaxTariff;
use anyhow::Result;

/// 查询处理器
pub struct TaxQuery;

impl TaxQuery {
    /// 精确查询
    pub fn exact_search(db: &TaxDatabase, code: &str) -> Result<Option<TaxTariff>> {
        let normalized_code = Self::normalize_code(code);
        let mut result = db.get_tariff(&normalized_code)?;
        
        if let Some(ref mut tariff) = result {
            tariff.similarity = Some(1.0); // 精确匹配相似度为1
        }
        
        Ok(result)
    }
    
    /// 模糊查询
    pub fn fuzzy_search(db: &TaxDatabase, query: &str, limit: usize) -> Result<Vec<TaxTariff>> {
        let normalized_query = Self::normalize_code(query);
        
        if normalized_query.is_empty() {
            return Ok(Vec::new());
        }
        
        // 先尝试精确匹配
        if let Some(exact_result) = Self::exact_search(db, &normalized_query)? {
            return Ok(vec![exact_result]);
        }
        
        // 获取所有记录并计算相似度
        let all_tariffs = db.get_all_tariffs()?;
        let mut scored_results: Vec<(f64, TaxTariff)> = all_tariffs
            .into_iter()
            .filter_map(|mut tariff| {
                let similarity = Self::calculate_similarity(&normalized_query, &tariff.code);
                if similarity > 0.2 {
                    // 相似度阈值
                    tariff.similarity = Some(similarity);
                    Some((similarity, tariff))
                } else {
                    None
                }
            })
            .collect();
        
        // 按相似度降序排序
        scored_results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        
        // 取前limit个结果
        Ok(scored_results.into_iter().take(limit).map(|(_, t)| t).collect())
    }
    
    /// 计算相似度（前缀匹配权重0.7 + 编辑距离权重0.3）
    fn calculate_similarity(code1: &str, code2: &str) -> f64 {
        if code1.is_empty() || code2.is_empty() {
            return 0.0;
        }
        
        // 计算最长公共前缀
        let prefix_len = code1
            .chars()
            .zip(code2.chars())
            .take_while(|(c1, c2)| c1 == c2)
            .count();
        
        let max_len = code1.len().max(code2.len());
        let prefix_score = if max_len > 0 {
            prefix_len as f64 / max_len as f64
        } else {
            0.0
        };
        
        // 计算编辑距离相似度
        let edit_score = strsim::normalized_levenshtein(code1, code2);
        
        // 综合得分：前缀匹配权重0.7，编辑距离权重0.3
        prefix_score * 0.7 + edit_score * 0.3
    }
    
    /// 标准化编码（只保留数字）
    fn normalize_code(code: &str) -> String {
        code.chars().filter(|c| c.is_ascii_digit()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_normalize_code() {
        assert_eq!(TaxQuery::normalize_code("0101-210-000"), "0101210000");
        assert_eq!(TaxQuery::normalize_code("0101 210 000"), "0101210000");
        assert_eq!(TaxQuery::normalize_code("abc0101210000xyz"), "0101210000");
    }
    
    #[test]
    fn test_calculate_similarity() {
        // 完全相同
        assert!((TaxQuery::calculate_similarity("0101210000", "0101210000") - 1.0).abs() < 0.01);
        
        // 相同前缀
        let sim = TaxQuery::calculate_similarity("0101210000", "0101220000");
        assert!(sim > 0.8); // 前8个字符相同
        
        // 完全不同
        let sim = TaxQuery::calculate_similarity("0000000000", "9999999999");
        assert!(sim < 0.3);
    }
}
