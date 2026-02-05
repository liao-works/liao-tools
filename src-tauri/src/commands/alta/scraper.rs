use crate::core::html::HtmlParser;
use crate::core::http;
use crate::models::alta::{ForbiddenItem, HsCodeEntry};
use anyhow::{Context, Result};
use log::{debug, info, warn};
use reqwest::Client;
use regex::Regex;

// 导入 lazy_static 宏
use lazy_static::lazy_static;

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

    /// 智能解析 HS 编码条目
    fn parse_hs_code_entry(
        &self,
        raw_text: &str,
        _description: &str,
        _document: &str
    ) -> Vec<HsCodeEntry> {
        lazy_static! {
            static ref CODE_RE: Regex = Regex::new(r"\d{4,10}").unwrap();
        }

        let mut entries = Vec::new();

        // 1. 判断是否有例外
        let has_exceptions = raw_text.contains("за исключением") ||
                            raw_text.contains("кроме");

        if has_exceptions {
            // 2.1 有例外：分离主编码和例外编码
            if let Some(pos) = raw_text.find("за исключением") {
                let main_part = &raw_text[..pos];
                let exception_part = &raw_text[pos..];

                // 提取主编码
                let main_codes: Vec<String> = CODE_RE
                    .find_iter(main_part)
                    .map(|m| m.as_str().to_string())
                    .collect();

                // 提取例外编码
                let exception_codes: Vec<String> = CODE_RE
                    .find_iter(exception_part)
                    .map(|m| m.as_str().to_string())
                    .collect();

                // 为主编码创建条目
                for code in main_codes {
                    entries.push(HsCodeEntry {
                        code: code.clone(),
                        code_4: Self::prefix(&code, 4),
                        code_6: Self::prefix(&code, 6),
                        code_8: Self::prefix(&code, 8),
                        is_exception: false,
                        parent_raw: raw_text.to_string(),
                    });
                }

                // 为例外编码创建条目（标记为例外）
                for code in exception_codes {
                    entries.push(HsCodeEntry {
                        code: code.clone(),
                        code_4: Self::prefix(&code, 4),
                        code_6: Self::prefix(&code, 6),
                        code_8: Self::prefix(&code, 8),
                        is_exception: true,
                        parent_raw: raw_text.to_string(),
                    });
                }
            }
        } else {
            // 2.2 无例外：所有编码都是主编码
            let codes: Vec<String> = CODE_RE
                .find_iter(raw_text)
                .map(|m| m.as_str().to_string())
                .collect();

            for code in codes {
                entries.push(HsCodeEntry {
                    code: code.clone(),
                    code_4: Self::prefix(&code, 4),
                    code_6: Self::prefix(&code, 6),
                    code_8: Self::prefix(&code, 8),
                    is_exception: false,
                    parent_raw: raw_text.to_string(),
                });
            }
        }

        entries
    }

    /// 获取编码前缀
    fn prefix(code: &str, len: usize) -> String {
        if code.len() >= len {
            code[..len].to_string()
        } else {
            code.to_string()
        }
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
                    let raw_hs_text = cols[0]
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

                    // 使用新的智能解析器
                    let entries = self.parse_hs_code_entry(&raw_hs_text, &description, &document);

                    // 过滤掉例外编码（只存储被禁运的编码）
                    let forbidden_entries: Vec<_> = entries.into_iter()
                        .filter(|e| !e.is_exception)
                        .collect();

                    // 为每个主编码创建 ForbiddenItem
                    for entry in forbidden_entries {
                        let has_exception = raw_hs_text.contains("за исключением");

                        items.push(ForbiddenItem::new_v2(
                            entry,
                            raw_hs_text.clone(),
                            has_exception,
                            description.clone(),
                            document.clone(),
                            self.base_url.clone(),
                        ));
                    }

                    if items.is_empty() {
                        debug!("跳过无效的HS编码: {}", raw_hs_text);
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
