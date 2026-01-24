use reqwest;
use scraper::{Html, Selector, ElementRef};
use std::time::Duration;
use thiserror::Error;
use log::{info, warn, error};

#[derive(Error, Debug)]
pub enum ScraperError {
    #[error("网络错误: {0}")]
    NetworkError(String),
    
    #[error("解析错误: {0}")]
    ParseError(String),
    
    #[error("商品不存在 (404)")]
    NotFound,
    
    #[error("数据库错误: {0}")]
    DatabaseError(String),
}

#[derive(Debug, Clone)]
pub struct ParsedTariff {
    pub code: Option<String>,
    pub description: Option<String>,
    pub rate: Option<String>,
    pub other_rate: Option<String>,
    pub anti_dumping_rate: Option<String>, // 反倾销税率
    pub countervailing_rate: Option<String>, // 反补贴税率
}

pub struct TaxScraper {
    client: reqwest::Client,
    max_retries: u32,
}

impl TaxScraper {
    pub fn new() -> Result<Self, ScraperError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
            .build()
            .map_err(|e| ScraperError::NetworkError(e.to_string()))?;

        Ok(Self {
            client,
            max_retries: 3,
        })
    }

    /// 带重试机制的HTTP请求 (指数退避策略)
    pub async fn fetch_with_retry(&self, url: &str) -> Result<String, ScraperError> {
        for attempt in 0..self.max_retries {
            match self.fetch_url(url).await {
                Ok(content) => {
                    info!("成功抓取 URL: {}", url);
                    return Ok(content);
                }
                Err(e) => {
                    if let ScraperError::NotFound = e {
                        // 404 不重试
                        return Err(e);
                    }
                    
                    if attempt < self.max_retries - 1 {
                        let delay = 2u64.pow(attempt);
                        warn!("第 {} 次请求失败，{}秒后重试: {}", attempt + 1, delay, e);
                        tokio::time::sleep(Duration::from_secs(delay)).await;
                    } else {
                        error!("所有重试都失败: {}", e);
                        return Err(e);
                    }
                }
            }
        }
        
        Err(ScraperError::NetworkError("超过最大重试次数".to_string()))
    }

    async fn fetch_url(&self, url: &str) -> Result<String, ScraperError> {
        let response = self.client
            .get(url)
            .send()
            .await
            .map_err(|e| ScraperError::NetworkError(e.to_string()))?;

        let status = response.status();
        if status.as_u16() == 404 {
            return Err(ScraperError::NotFound);
        }
        
        if !status.is_success() {
            return Err(ScraperError::NetworkError(format!("HTTP {}", status)));
        }

        response
            .text()
            .await
            .map_err(|e| ScraperError::NetworkError(e.to_string()))
    }

    /// 解析commodity页面提取税率信息
    pub fn parse_commodity_page(&self, html: &str) -> Result<ParsedTariff, ScraperError> {
        let document = Html::parse_document(html);
        let mut result = ParsedTariff {
            code: None,
            description: None,
            rate: None,
            other_rate: None,
            anti_dumping_rate: None,
            countervailing_rate: None,
        };

        // 提取商品描述
        if let Ok(desc_selector) = Selector::parse("h1.commodity-header") {
            if let Some(desc_elem) = document.select(&desc_selector).next() {
                let desc = desc_elem.text().collect::<String>().trim().to_string();
                if !desc.is_empty() {
                    result.description = Some(desc);
                    info!("找到商品描述");
                }
            }
        }

        // 查找税率表格
        if let Ok(table_selector) = Selector::parse("table.small-table") {
            for table in document.select(&table_selector) {
                if result.rate.is_some() {
                    break;
                }

                // 查找表头，定位 "Duty rate" 列
                let mut duty_rate_idx: Option<usize> = None;
                if let Ok(th_selector) = Selector::parse("th") {
                    for (idx, th) in table.select(&th_selector).enumerate() {
                        let header_text = th.text().collect::<String>();
                        if header_text.contains("Duty rate") {
                            duty_rate_idx = Some(idx);
                            break;
                        }
                    }
                }

                if let Some(duty_idx) = duty_rate_idx {
                    // 查找所有行
                    if let Ok(row_selector) = Selector::parse("tr") {
                        for row in table.select(&row_selector) {
                            if let Ok(cell_selector) = Selector::parse("td, th") {
                                let cells: Vec<ElementRef> = row.select(&cell_selector).collect();
                                
                                if cells.len() <= duty_idx {
                                    continue;
                                }

                                // 第一列：国家/地区
                                let country_text = cells[0].text().collect::<String>();
                                
                                // 第二列：Measure type (如果存在)
                                let measure_type = if cells.len() > 1 {
                                    cells[1].text().collect::<String>().to_lowercase()
                                } else {
                                    String::new()
                                };

                                // 检查是否是有效的关税类型
                                let valid_keywords = ["third country duty", "non preferential duty", "other"];
                                let is_valid_measure = valid_keywords.iter().any(|kw| measure_type.contains(kw));

                                // 提取税率的通用函数
                                let extract_rate = |cell: &ElementRef| -> Option<String> {
                                    // 优先查找 span.duty-expression > span
                                    if let Ok(expr_selector) = Selector::parse("span.duty-expression span") {
                                        if let Some(rate_elem) = cell.select(&expr_selector).next() {
                                            let rate = rate_elem.text().collect::<String>().trim().to_string();
                                            if !rate.is_empty() {
                                                return Some(rate);
                                            }
                                        }
                                    }
                                    
                                    // 备选：直接查找 span.duty-expression
                                    if let Ok(expr_selector) = Selector::parse("span.duty-expression") {
                                        if let Some(rate_elem) = cell.select(&expr_selector).next() {
                                            let rate = rate_elem.text().collect::<String>().trim().to_string();
                                            if !rate.is_empty() {
                                                return Some(rate);
                                            }
                                        }
                                    }
                                    
                                    // 最后备选：直接获取文本
                                    let rate = cell.text().collect::<String>().trim().to_string();
                                    if !rate.is_empty() {
                                        Some(rate)
                                    } else {
                                        None
                                    }
                                };

                                // 处理 "All countries" 或 "United Kingdom"
                                if (country_text.contains("All countries") || country_text.contains("United Kingdom")) 
                                    && is_valid_measure {
                                    if let Some(rate) = extract_rate(&cells[duty_idx]) {
                                        result.rate = Some(rate.clone());
                                        info!("找到一般税率: {}", rate);
                                    }
                                }
                                
                                // 处理 "Other"
                                if country_text.contains("Other") && is_valid_measure {
                                    if let Some(rate) = extract_rate(&cells[duty_idx]) {
                                        result.other_rate = Some(rate.clone());
                                        info!("找到Other税率: {}", rate);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 如果没有找到一般税率，但有 Other 税率，使用 Other
        if result.rate.is_none() && result.other_rate.is_some() {
            result.rate = result.other_rate.clone();
            info!("使用Other税率作为一般税率");
        }

        Ok(result)
    }

    /// 并行抓取英国和北爱尔兰数据
    pub async fn fetch_both_regions(
        &self,
        uk_url: &str,
        ni_url: &str,
    ) -> (Result<ParsedTariff, ScraperError>, Result<ParsedTariff, ScraperError>) {
        let uk_task = self.fetch_and_parse(uk_url);
        let ni_task = self.fetch_and_parse(ni_url);

        tokio::join!(uk_task, ni_task)
    }

    async fn fetch_and_parse(&self, url: &str) -> Result<ParsedTariff, ScraperError> {
        let html = self.fetch_with_retry(url).await?;
        self.parse_commodity_page(&html)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_empty_html() {
        let scraper = TaxScraper::new().unwrap();
        let result = scraper.parse_commodity_page("<html></html>");
        assert!(result.is_ok());
    }
}
