use crate::models::revcal::{RevCalBatchResult, RevCalProduct, RevCalQueryResult};
use std::future::Future;
use std::time::Duration;

/// 批量查询配置
pub struct BatchConfig {
    /// 相邻请求之间的基础间隔（实际间隔附加 0~400ms 随机抖动，降低触发限流风险）
    pub request_delay: Duration,
}

/// 顺序执行批量查询：逐码调用 fetch，收集结果并回调进度。
/// 单码失败不中断整体，错误记录在对应结果里。
pub async fn run_batch<F, Fut>(
    codes: Vec<String>,
    country_code: String,
    mut fetch: F,
    config: BatchConfig,
    mut on_progress: impl FnMut(usize, usize, &str, &str),
) -> RevCalBatchResult
where
    F: FnMut(String, String) -> Fut,
    Fut: Future<Output = Result<Vec<RevCalProduct>, String>>,
{
    let codes: Vec<String> = codes
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();
    let total = codes.len();
    let mut results = Vec::with_capacity(total);
    let mut success = 0usize;

    for (index, code) in codes.iter().enumerate() {
        let outcome = fetch(code.clone(), country_code.clone()).await;
        let (products, error, status) = match outcome {
            Ok(products) => {
                success += 1;
                (products, None, "success")
            }
            Err(e) => (Vec::new(), Some(e), "error"),
        };
        on_progress(index + 1, total, code, status);
        results.push(RevCalQueryResult {
            code: code.clone(),
            products,
            error,
        });
        // 最后一个之后不再等待
        if index + 1 < total && config.request_delay > Duration::ZERO {
            let delay = config.request_delay + Duration::from_millis(jitter_millis());
            tokio::time::sleep(delay).await;
        }
    }

    RevCalBatchResult {
        total,
        success,
        failed: total - success,
        results,
    }
}

fn jitter_millis() -> u64 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(0);
    nanos % 400
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::revcal::RevCalProduct;

    fn product(asin: &str) -> RevCalProduct {
        RevCalProduct {
            asin: asin.to_string(),
            title: format!("商品 {}", asin),
            brand: None,
            image_url: None,
            product_link: None,
            length: None,
            width: None,
            height: None,
            dimension_unit: None,
            weight: None,
            weight_unit: None,
            price: None,
            currency: None,
            fee_category: None,
            sales_rank: None,
            sales_rank_context: None,
            reviews_count: None,
            rating: None,
            offer_count: None,
        }
    }

    #[tokio::test]
    async fn batch_collects_results_in_order_with_progress() {
        let codes = vec!["B1".to_string(), "B2".to_string(), "B3".to_string()];
        let mut fetch_calls: Vec<String> = Vec::new();
        let result = run_batch(
            codes,
            "GB".to_string(),
            |code: String, _cc: String| {
                fetch_calls.push(code.clone());
                async move {
                    match code.as_str() {
                        "B1" => Ok(vec![product("B1")]),
                        "B2" => Err("网络错误".to_string()),
                        _ => Ok(vec![]),
                    }
                }
            },
            BatchConfig { request_delay: Duration::ZERO },
            |_current, _total, _code, _status| {},
        )
        .await;

        // 调用顺序与输入一致
        assert_eq!(fetch_calls, vec!["B1", "B2", "B3"]);
        assert_eq!(result.total, 3);
        assert_eq!(result.success, 2);
        assert_eq!(result.failed, 1);
        assert_eq!(result.results.len(), 3);
        assert!(result.results[0].found());
        assert_eq!(result.results[1].error.as_deref(), Some("网络错误"));
        assert!(!result.results[2].found());
        assert!(result.results[2].error.is_none());
    }

    #[tokio::test]
    async fn batch_reports_progress_per_code() {
        let codes = vec!["B1".to_string(), "B2".to_string()];
        let mut progress: Vec<(usize, usize, String, String)> = Vec::new();
        let _ = run_batch(
            codes,
            "GB".to_string(),
            |code: String, _cc: String| async move {
                if code == "B1" {
                    Ok(vec![product("B1")])
                } else {
                    Err("查询失败".to_string())
                }
            },
            BatchConfig { request_delay: Duration::ZERO },
            |current, total, code, status| {
                progress.push((current, total, code.to_string(), status.to_string()));
            },
        )
        .await;

        assert_eq!(
            progress,
            vec![
                (1, 2, "B1".to_string(), "success".to_string()),
                (2, 2, "B2".to_string(), "error".to_string()),
            ]
        );
    }

    #[tokio::test]
    async fn batch_skips_blank_codes() {
        let codes = vec!["  ".to_string(), "B1".to_string(), String::new()];
        let mut fetch_calls: Vec<String> = Vec::new();
        let result = run_batch(
            codes,
            "GB".to_string(),
            |code: String, _cc: String| {
                fetch_calls.push(code.clone());
                async move { Ok(vec![product(&code)]) }
            },
            BatchConfig { request_delay: Duration::ZERO },
            |_c, _t, _code, _s| {},
        )
        .await;

        // 空白码被过滤，不发起请求
        assert_eq!(fetch_calls, vec!["B1"]);
        assert_eq!(result.total, 1);
        assert_eq!(result.success, 1);
    }

    #[tokio::test]
    async fn batch_empty_input_returns_empty_result() {
        let result = run_batch(
            vec![],
            "GB".to_string(),
            |_code: String, _cc: String| async move { Ok(vec![]) },
            BatchConfig { request_delay: Duration::ZERO },
            |_c, _t, _code, _s| {},
        )
        .await;
        assert_eq!(result.total, 0);
        assert!(result.results.is_empty());
    }
}
