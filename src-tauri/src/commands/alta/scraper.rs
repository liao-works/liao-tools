use crate::core::html::HtmlParser;
use crate::core::http;
use crate::models::alta::ForbiddenItem;
use anyhow::{Context, Result};
use log::{debug, info, warn};
use reqwest::Client;

/// Alta.ru 禁运数据爬虫
pub struct AltaScraper {
    base_url: String,
    client: Client,
}

impl AltaScraper {
    /// 创建新的爬虫实例
    pub fn new() -> Self {
        // 使用 core 的 HTTP 客户端工具
        let client = http::create_default_client();

        Self {
            base_url: "https://www.alta.ru/tnved/forbidden_export/".to_string(),
            client,
        }
    }

    /// 获取所有禁运数据（异步）
    pub async fn fetch_all_data(&self) -> Result<Vec<ForbiddenItem>> {
        info!("开始获取禁运数据...");

        // 发送 HTTP GET 请求（异步）
        let response = self
            .client
            .get(&self.base_url)
            .send()
            .await
            .context("Failed to send HTTP request")?;

        if !response.status().is_success() {
            anyhow::bail!("HTTP request failed with status: {}", response.status());
        }

        let html = response.text().await.context("Failed to read response body")?;

        // 解析 HTML
        let items = self.parse_forbidden_items(&html)?;

        info!("爬取完成，共获取 {} 条禁运数据", items.len());

        Ok(items)
    }

    /// 解析 HTML，提取禁运商品数据
    fn parse_forbidden_items(&self, html: &str) -> Result<Vec<ForbiddenItem>> {
        // 使用 core 的 HTML 解析工具
        let document = HtmlParser::parse(html);
        let mut items = Vec::new();

        // 查找目标表格：class="pTnved_tableFull"
        let table_selector = HtmlParser::selector("table.pTnved_tableFull")?;

        if let Some(table) = document.select(&table_selector).next() {
            items = self.parse_table(&table)?;
            info!("解析到 {} 条禁运数据", items.len());
        } else {
            warn!("未找到禁运数据表格 (class='pTnved_tableFull')");
        }

        Ok(items)
    }

    /// 解析表格结构的数据
    fn parse_table(&self, table: &scraper::ElementRef) -> Result<Vec<ForbiddenItem>> {
        let mut items = Vec::new();

        // 使用 core 的 HTML 解析工具创建选择器
        let tbody_selector = HtmlParser::selector("tbody")?;
        let tr_selector = HtmlParser::selector("tr")?;
        let td_selector = HtmlParser::selector("td")?;

        if let Some(tbody) = table.select(&tbody_selector).next() {
            for row in tbody.select(&tr_selector) {
                let cols: Vec<_> = row.select(&td_selector).collect();

                // 确保至少有3列数据
                if cols.len() >= 3 {
                    // 第1列：HS编码
                    let hs_code = cols[0]
                        .text()
                        .collect::<Vec<_>>()
                        .join("")
                        .trim()
                        .to_string();

                    // 第2列：商品名称/描述
                    let description = cols[1]
                        .text()
                        .collect::<Vec<_>>()
                        .join("")
                        .trim()
                        .to_string();

                    // 第3列：文档/法规信息
                    let document = cols[2]
                        .text()
                        .collect::<Vec<_>>()
                        .join("")
                        .trim()
                        .to_string();

                    // 使用 core 的工具清理HS编码
                    let hs_code_clean = HtmlParser::extract_digits(&hs_code);

                    if !hs_code_clean.is_empty() {
                        let hs_code_4 = if hs_code_clean.len() >= 4 {
                            hs_code_clean[0..4].to_string()
                        } else {
                            hs_code_clean.clone()
                        };

                        let hs_code_6 = if hs_code_clean.len() >= 6 {
                            hs_code_clean[0..6].to_string()
                        } else {
                            hs_code_clean.clone()
                        };

                        let hs_code_8 = if hs_code_clean.len() >= 8 {
                            hs_code_clean[0..8].to_string()
                        } else {
                            hs_code_clean.clone()
                        };

                        items.push(ForbiddenItem {
                            id: None,
                            hs_code: hs_code_clean,
                            hs_code_4,
                            hs_code_6,
                            hs_code_8,
                            description,
                            additional_info: document,
                            source_url: self.base_url.clone(),
                            created_at: None,
                        });
                    } else {
                        debug!("跳过无效的HS编码: {}", hs_code);
                    }
                }
            }
        } else {
            warn!("表格中未找到tbody");
        }

        Ok(items)
    }

    /// 测试网站连接（异步）
    pub async fn test_connection(&self) -> bool {
        match self.client.get(&self.base_url).send().await {
            Ok(response) => response.status().is_success(),
            Err(e) => {
                warn!("连接测试失败: {}", e);
                false
            }
        }
    }
}

impl Default for AltaScraper {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scraper_creation() {
        let scraper = AltaScraper::new();
        assert_eq!(
            scraper.base_url,
            "https://www.alta.ru/tnved/forbidden_export/"
        );
    }
}
