use crate::models::revcal::{FetchError, RevCalBatchResult, RevCalProduct, RevCalQueryResult};
use std::future::Future;
use std::time::Duration;

/// 批量查询配置
pub struct BatchConfig {
    /// 相邻请求之间的基础间隔（实际间隔附加 0~400ms 随机抖动，降低触发限流风险）
    pub request_delay: Duration,
    /// 首趟结束后对失败码的补查趟数（0 = 关闭）
    pub retry_failed_passes: usize,
}

/// 限流状态：触发限流后逐级抬升后续请求的额外间隔，成功后减半恢复，封顶 10s
#[derive(Default)]
pub struct ThrottleState {
    extra_delay_ms: u64,
}

impl ThrottleState {
    const STEP_MS: u64 = 1500;
    const MAX_EXTRA_MS: u64 = 10_000;

    pub fn on_throttled(&mut self) {
        self.extra_delay_ms = (self.extra_delay_ms + Self::STEP_MS).min(Self::MAX_EXTRA_MS);
    }

    pub fn on_success(&mut self) {
        self.extra_delay_ms /= 2;
    }

    pub fn next_delay(&self, base: Duration) -> Duration {
        base + Duration::from_millis(self.extra_delay_ms)
    }
}

/// 顺序执行批量查询：逐码调用 fetch，收集结果并回调进度。
/// 单码失败不中断整体；首趟结束后对失败码补查 `retry_failed_passes` 轮。
pub async fn run_batch<F, Fut>(
    codes: Vec<String>,
    country_code: String,
    mut fetch: F,
    config: BatchConfig,
    mut on_progress: impl FnMut(usize, usize, &str, &str),
) -> RevCalBatchResult
where
    F: FnMut(String, String) -> Fut,
    Fut: Future<Output = Result<Vec<RevCalProduct>, FetchError>>,
{
    let codes: Vec<String> = codes
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();
    let total = codes.len();
    let mut results = Vec::with_capacity(total);
    let mut throttle = ThrottleState::default();

    // 首趟
    for (index, code) in codes.iter().enumerate() {
        let outcome = fetch(code.clone(), country_code.clone()).await;
        let (products, error, status) = match outcome {
            Ok(products) => {
                throttle.on_success();
                (products, None, "success")
            }
            Err(FetchError::Throttled(msg)) => {
                throttle.on_throttled();
                (Vec::new(), Some(format!("接口限流: {}", msg)), "error")
            }
            Err(FetchError::Other(msg)) => (Vec::new(), Some(msg), "error"),
        };
        on_progress(index + 1, total, code, status);
        results.push(RevCalQueryResult {
            code: code.clone(),
            products,
            error,
        });
        if index + 1 < total {
            let delay = throttle.next_delay(config.request_delay)
                + Duration::from_millis(jitter_millis());
            tokio::time::sleep(delay).await;
        }
    }

    // 补查趟：只重发失败的码
    for _pass in 0..config.retry_failed_passes {
        let failed_indices: Vec<usize> = results
            .iter()
            .enumerate()
            .filter(|(_, r)| r.error.is_some())
            .map(|(i, _)| i)
            .collect();
        if failed_indices.is_empty() {
            break;
        }
        let failed_total = failed_indices.len();
        for (i, idx) in failed_indices.iter().enumerate() {
            let code = codes[*idx].clone();
            on_progress(i + 1, failed_total, &code, "retry");
            let delay = throttle.next_delay(config.request_delay)
                + Duration::from_millis(jitter_millis());
            tokio::time::sleep(delay).await;

            let outcome = fetch(code.clone(), country_code.clone()).await;
            let (products, error, status) = match outcome {
                Ok(products) => {
                    throttle.on_success();
                    (products, None, "retry-success")
                }
                Err(FetchError::Throttled(msg)) => {
                    throttle.on_throttled();
                    (Vec::new(), Some(format!("接口限流: {}", msg)), "retry-error")
                }
                Err(FetchError::Other(msg)) => (Vec::new(), Some(msg), "retry-error"),
            };
            on_progress(i + 1, failed_total, &code, status);
            results[*idx] = RevCalQueryResult {
                code,
                products,
                error,
            };
        }
    }

    let success = results.iter().filter(|r| r.error.is_none()).count();
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
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

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
            dimensions_official: String::new(),
        }
    }

    #[test]
    fn throttle_state_escalates_and_caps() {
        let mut st = ThrottleState::default();
        let base = Duration::from_millis(800);
        assert_eq!(st.next_delay(base), base);
        st.on_throttled();
        assert_eq!(st.next_delay(base), base + Duration::from_millis(1500));
        st.on_throttled();
        assert_eq!(st.next_delay(base), base + Duration::from_millis(3000));
        // 成功后减半，允许逐渐恢复
        st.on_success();
        assert_eq!(st.next_delay(base), base + Duration::from_millis(1500));
        // 有上限封顶
        for _ in 0..10 {
            st.on_throttled();
        }
        assert_eq!(st.next_delay(base), base + Duration::from_millis(10_000));
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
                        "B2" => Err(FetchError::Other("网络错误".to_string())),
                        _ => Ok(vec![]),
                    }
                }
            },
            BatchConfig { request_delay: Duration::ZERO, retry_failed_passes: 0 },
            |_current, _total, _code, _status| {},
        )
        .await;

        // 调用顺序与输入一致（补查趟已关闭）
        assert_eq!(fetch_calls, vec!["B1", "B2", "B3"]);
        assert_eq!(result.total, 3);
        assert_eq!(result.success, 2);
        assert_eq!(result.failed, 1);
        assert_eq!(result.results.len(), 3);
        assert!(result.results[0].found());
        assert_eq!(
            result.results[1].error.as_deref(),
            Some("网络错误")
        );
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
                    Err(FetchError::Other("查询失败".to_string()))
                }
            },
            BatchConfig { request_delay: Duration::ZERO, retry_failed_passes: 0 },
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
    async fn failed_codes_are_retried_in_second_pass() {
        let codes = vec!["B1".to_string(), "B2".to_string()];
        let calls = Arc::new(AtomicUsize::new(0));
        let calls2 = calls.clone();
        let result = run_batch(
            codes,
            "GB".to_string(),
            move |code: String, _cc: String| {
                let c = calls2.clone();
                async move {
                    let n = c.fetch_add(1, Ordering::SeqCst);
                    // B2 首趟失败（第 2 次调用），补查趟成功（第 3 次调用）
                    if code == "B2" && n == 1 {
                        Err(FetchError::Other("网络错误".to_string()))
                    } else {
                        Ok(vec![product(&code)])
                    }
                }
            },
            BatchConfig { request_delay: Duration::ZERO, retry_failed_passes: 1 },
            |_c, _t, _code, _s| {},
        )
        .await;

        // 调用顺序：B1(首趟)、B2(首趟失败)、B2(补查成功)
        assert_eq!(calls.load(Ordering::SeqCst), 3);
        assert_eq!(result.success, 2);
        assert_eq!(result.failed, 0);
        assert!(result.results[1].found());
        assert!(result.results[1].error.is_none());
    }

    #[tokio::test]
    async fn second_pass_preserves_persistent_failures() {
        let result = run_batch(
            vec!["B1".to_string()],
            "GB".to_string(),
            |_code: String, _cc: String| async move {
                Err(FetchError::Throttled("HTTP 429".to_string()))
            },
            BatchConfig { request_delay: Duration::ZERO, retry_failed_passes: 1 },
            |_c, _t, _code, _s| {},
        )
        .await;

        assert_eq!(result.success, 0);
        assert_eq!(result.failed, 1);
        assert!(result.results[0].error.as_deref().unwrap().contains("限流"));
    }

    #[tokio::test]
    async fn retry_pass_can_be_disabled() {
        let calls = Arc::new(AtomicUsize::new(0));
        let calls2 = calls.clone();
        let result = run_batch(
            vec!["B1".to_string()],
            "GB".to_string(),
            move |_code: String, _cc: String| {
                let c = calls2.clone();
                async move {
                    c.fetch_add(1, Ordering::SeqCst);
                    Err::<Vec<RevCalProduct>, _>(FetchError::Other("失败".to_string()))
                }
            },
            BatchConfig { request_delay: Duration::ZERO, retry_failed_passes: 0 },
            |_c, _t, _code, _s| {},
        )
        .await;

        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(result.failed, 1);
    }

    #[tokio::test]
    async fn second_pass_emits_retry_progress() {
        let progress: Arc<std::sync::Mutex<Vec<(usize, usize, String, String)>>> =
            Arc::new(std::sync::Mutex::new(Vec::new()));
        let p2 = progress.clone();
        let _ = run_batch(
            vec!["B1".to_string(), "B2".to_string()],
            "GB".to_string(),
            |code: String, _cc: String| async move {
                if code == "B1" {
                    Ok(vec![product("B1")])
                } else {
                    Err(FetchError::Other("失败".to_string()))
                }
            },
            BatchConfig { request_delay: Duration::ZERO, retry_failed_passes: 1 },
            move |current, total, code, status| {
                p2.lock().unwrap().push((current, total, code.to_string(), status.to_string()));
            },
        )
        .await;

        let got = progress.lock().unwrap().clone();
        assert_eq!(
            got,
            vec![
                (1, 2, "B1".to_string(), "success".to_string()),
                (2, 2, "B2".to_string(), "error".to_string()),
                // 补查趟：进入时发 retry 事件，结束后发最终状态
                (1, 1, "B2".to_string(), "retry".to_string()),
                (1, 1, "B2".to_string(), "retry-error".to_string()),
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
            BatchConfig { request_delay: Duration::ZERO, retry_failed_passes: 1 },
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
            BatchConfig { request_delay: Duration::ZERO, retry_failed_passes: 1 },
            |_c, _t, _code, _s| {},
        )
        .await;
        assert_eq!(result.total, 0);
        assert!(result.results.is_empty());
    }
}
