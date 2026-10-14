use crate::models::revcal::{parse_search_response, FetchError, RevCalProduct};
use log::warn;
use std::time::Duration;
use wreq::Client;
use wreq_util::Emulation;

const BASE_URL: &str = "https://sellercentral.amazon.fr";
const MAX_RETRIES: u32 = 5;

/// 第 attempt 次失败后的等待时长（5 次尝试之间 4 个间隔，线性递增）
fn retry_backoff(attempt: u32) -> Duration {
    Duration::from_millis(1500 + 500 * attempt as u64)
}

enum SearchError {
    /// 429/403：触发限流或风控，重试并通知批量层全局降速
    Throttled(String),
    /// 网络错误/5xx/解析失败：可重试
    Retryable(String),
    /// 其余 4xx：不值得重试
    NonRetryable(String),
}

fn classify_status(status: u16) -> SearchError {
    let msg = format!("接口返回 HTTP {}", status);
    match status {
        403 | 429 => SearchError::Throttled(msg),
        400..=499 => SearchError::NonRetryable(msg),
        _ => SearchError::Retryable(msg),
    }
}

/// revcalpublic 公开接口客户端（无需登录态）。
/// 通过 wreq 模拟 Chrome 的 TLS/HTTP2 指纹与默认请求头（UA 由预设提供），
/// 避免被 Amazon 边缘节点按非浏览器指纹拒连；Referer 单独补上以贴合页面 XHR 流量。
pub struct RevCalClient {
    client: Client,
    locale: String,
}

impl RevCalClient {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .emulation(Emulation::Chrome149)
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
        Ok(Self {
            client,
            locale: "fr-FR".to_string(),
        })
    }

    /// 查询单个关键词（ASIN/UPC/EAN/ISBN/标题），返回商品列表；空列表表示未找到。
    /// 限流/网络错误自动重试（共 5 次尝试，线性退避）；限流错误单独标记供批量层降速。
    pub async fn search(
        &self,
        keywords: &str,
        country_code: &str,
    ) -> Result<Vec<RevCalProduct>, FetchError> {
        let mut last_err = FetchError::Other(String::new());
        for attempt in 0..MAX_RETRIES {
            match self.search_once(keywords, country_code).await {
                Ok(products) => return Ok(products),
                Err(SearchError::NonRetryable(e)) => {
                    return Err(FetchError::Other(e));
                }
                Err(e) => {
                    last_err = match &e {
                        SearchError::Throttled(msg) => FetchError::Throttled(msg.clone()),
                        SearchError::Retryable(msg) | SearchError::NonRetryable(msg) => {
                            FetchError::Other(msg.clone())
                        }
                    };
                    if attempt < MAX_RETRIES - 1 {
                        let delay = retry_backoff(attempt);
                        warn!(
                            "revcal 查询失败(第{}次)，{:?}后重试: {}",
                            attempt + 1,
                            delay,
                            last_err
                        );
                        tokio::time::sleep(delay).await;
                    }
                }
            }
        }
        Err(last_err)
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
            .header(
                "referer",
                format!("{}/revcalpublic?lang=fr_FR", BASE_URL),
            )
            .header("accept-language", "fr-FR,fr;q=0.9,en;q=0.8")
            .json(&body)
            .send()
            .await
            .map_err(|e| SearchError::Retryable(format!("网络错误: {}", e)))?;

        let status = resp.status();
        if !status.is_success() {
            return Err(classify_status(status.as_u16()));
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

    #[test]
    fn retry_backoff_is_linear() {
        // 5 次尝试之间 4 个间隔：1.5s/2s/2.5s/3s（参照社区同类项目的线性退避）
        assert_eq!(retry_backoff(0), Duration::from_millis(1500));
        assert_eq!(retry_backoff(1), Duration::from_millis(2000));
        assert_eq!(retry_backoff(2), Duration::from_millis(2500));
        assert_eq!(retry_backoff(3), Duration::from_millis(3000));
    }

    #[test]
    fn classify_status_marks_throttling() {
        assert!(matches!(classify_status(429), SearchError::Throttled(_)));
        assert!(matches!(classify_status(403), SearchError::Throttled(_)));
        assert!(matches!(classify_status(500), SearchError::Retryable(_)));
        assert!(matches!(classify_status(404), SearchError::NonRetryable(_)));
    }

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
        // 价格随市场波动，只断言存在；尺寸是稳定物理属性，断言精确值
        assert!(products[0].price.is_some(), "价格字段应存在");
        assert_eq!(products[0].length, Some(20.2001));
    }

    /// 10 码真实批量稳定性验证（需联网，默认忽略）：
    /// cargo test --lib live_batch -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_batch_10_codes_stability() {
        use crate::commands::revcal::batch::{run_batch, BatchConfig};
        use std::time::Duration;

        let client = RevCalClient::new().expect("客户端创建应成功");

        // 先用标题搜索采集 9 个真实 ASIN，加上用户示例码凑 10 个，保证都是有效码
        let seed = client.search("echo dot", "GB").await.expect("种子搜索应成功");
        assert!(seed.len() >= 9, "种子搜索应至少返回 9 个商品");
        let mut codes: Vec<String> = seed.iter().map(|p| p.asin.clone()).take(9).collect();
        codes.insert(0, "B0GD7VRN9V".to_string());
        println!("待查编码: {:?}", codes);

        let started = std::time::Instant::now();
        let result = run_batch(
            codes,
            "GB".to_string(),
            |code: String, cc: String| {
                let client = &client;
                async move { client.search(&code, &cc).await }
            },
            BatchConfig {
                request_delay: Duration::from_millis(800),
                retry_failed_passes: 1,
            },
            |current, total, code, status| {
                println!("[{}/{}] {} → {}", current, total, code, status);
            },
        )
        .await;

        println!(
            "\n=== 结果汇总（耗时 {:.1}s）===",
            started.elapsed().as_secs_f32()
        );
        for r in &result.results {
            let title = |t: &str| t.chars().take(36).collect::<String>();
            match (&r.error, r.products.first()) {
                (None, Some(p)) => println!(
                    "✅ {} | {}… | 价 {} {:?} | {:?}×{:?}×{:?}{:?} / {:?}{:?}",
                    r.code,
                    title(&p.title),
                    p.currency.as_deref().unwrap_or("?"),
                    p.price,
                    p.length,
                    p.width,
                    p.height,
                    p.dimension_unit,
                    p.weight,
                    p.weight_unit
                ),
                (Some(e), _) => println!("❌ {} | {}", r.code, e),
                _ => println!("⚠️ {} | 未找到", r.code),
            }
        }
        println!(
            "总计 {} | 成功 {} | 失败 {}",
            result.total, result.success, result.failed
        );
        assert_eq!(result.failed, 0, "10 个真实有效码批量查询不应有失败");
    }
}
