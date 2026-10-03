use crate::models::revcal::{parse_search_response, RevCalProduct};
use log::warn;
use std::time::Duration;

const BASE_URL: &str = "https://sellercentral.amazon.fr";
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/// revcalpublic 公开接口客户端（无需登录态）
pub struct RevCalClient {
    client: reqwest::Client,
    locale: String,
    max_retries: u32,
}

enum SearchError {
    /// 4xx 等不值得重试的错误
    NonRetryable(String),
    /// 网络/5xx 等可重试错误
    Retryable(String),
}

impl RevCalClient {
    pub fn new() -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(USER_AGENT)
            .build()
            .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
        Ok(Self {
            client,
            locale: "fr-FR".to_string(),
            max_retries: 3,
        })
    }

    /// 查询单个关键词（ASIN/UPC/EAN/ISBN/标题），返回商品列表；空列表表示未找到
    pub async fn search(
        &self,
        keywords: &str,
        country_code: &str,
    ) -> Result<Vec<RevCalProduct>, String> {
        let mut last_err = String::new();
        for attempt in 0..self.max_retries {
            match self.search_once(keywords, country_code).await {
                Ok(products) => return Ok(products),
                Err(SearchError::NonRetryable(e)) => return Err(e),
                Err(SearchError::Retryable(e)) => {
                    last_err = e;
                    if attempt < self.max_retries - 1 {
                        let delay = 2u64.pow(attempt);
                        warn!(
                            "revcal 查询失败(第{}次)，{}s后重试: {}",
                            attempt + 1,
                            delay,
                            last_err
                        );
                        tokio::time::sleep(Duration::from_secs(delay)).await;
                    }
                }
            }
        }
        Err(format!("重试 {} 次后仍失败: {}", self.max_retries, last_err))
    }

    async fn search_once(
        &self,
        keywords: &str,
        country_code: &str,
    ) -> Result<Vec<RevCalProduct>, SearchError> {
        let url = format!(
            "{}/rcpublic/searchproduct?countryCode={}&locale={}",
            BASE_URL, country_code, self.locale
        );
        let body = serde_json::json!({
            "keywords": keywords,
            "countryCode": country_code,
            "searchType": "GENERAL",
            "pageOffset": 1
        });
        let resp = self
            .client
            .post(&url)
            .header("accept", "application/json, text/plain, */*")
            .json(&body)
            .send()
            .await
            .map_err(|e| SearchError::Retryable(format!("网络错误: {}", e)))?;

        let status = resp.status();
        if !status.is_success() {
            let msg = format!("接口返回 HTTP {}", status.as_u16());
            return if status.is_client_error() {
                Err(SearchError::NonRetryable(msg))
            } else {
                Err(SearchError::Retryable(msg))
            };
        }

        let text = resp
            .text()
            .await
            .map_err(|e| SearchError::Retryable(format!("读取响应失败: {}", e)))?;
        parse_search_response(&text).map_err(SearchError::Retryable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 真实接口冒烟测试（需联网，默认忽略）：cargo test --lib revcal -- --ignored
    #[tokio::test]
    #[ignore]
    async fn live_search_returns_product() {
        let client = RevCalClient::new().expect("客户端创建应成功");
        let products = client
            .search("B0GD7VRN9V", "GB")
            .await
            .expect("真实接口查询应成功");
        assert_eq!(products.len(), 1);
        assert_eq!(products[0].asin, "B0GD7VRN9V");
        assert_eq!(products[0].price, Some(69.99));
        assert_eq!(products[0].length, Some(20.2001));
    }
}
