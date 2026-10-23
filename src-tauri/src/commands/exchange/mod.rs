pub mod commands;

use std::collections::HashMap;
use std::path::PathBuf;

use chrono::{DateTime, FixedOffset, Utc};
use reqwest::Client;
use serde_json::Value;
use tauri::Manager;

use crate::core::http::create_client_with_timeout;
use crate::models::exchange::{CnParity, CnParityItem, ExchangeRates};

const CACHE_KEY_LATEST: &str = "latest";
const CACHE_KEY_CN_PARITY: &str = "cn-parity";
const FRANKFURTER_URL: &str = "https://api.frankfurter.dev/v1/latest?base=CNY";
const ER_API_URL: &str = "https://open.er-api.com/v6/latest/CNY";
const CURRENCY_API_URL: &str =
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json";
const CHINAMONEY_REFERER: &str = "https://www.chinamoney.com.cn/chinese/bkccpr/";
/// 中间价展示的货币对（顺序即返回 values 的顺序）
const CN_PARITY_PAIRS: &[&str] = &[
    "USD/CNY", "EUR/CNY", "100JPY/CNY", "HKD/CNY", "GBP/CNY", "AUD/CNY", "CAD/CNY", "SGD/CNY",
    "CHF/CNY", "NZD/CNY",
];

/// 北京时区的当前时间
fn beijing_now() -> DateTime<FixedOffset> {
    Utc::now().with_timezone(&FixedOffset::east_opt(8 * 3600).expect("固定偏移合法"))
}

fn beijing_today() -> String {
    beijing_now().format("%Y-%m-%d").to_string()
}

// ---------------------------------------------------------------------------
// 缓存（exchange.db，同一天内不重复联网）
// ---------------------------------------------------------------------------

fn db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map(|dir| dir.join("exchange.db"))
        .map_err(|e| format!("无法定位应用数据目录: {e}"))
}

fn cache_read(app_handle: &tauri::AppHandle, key: &str) -> Option<String> {
    let Some(path) = db_path(app_handle).ok() else {
        return None;
    };
    let Ok(conn) = crate::core::database::create_connection(&path) else {
        return None;
    };
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS exchange_cache (
            cache_key TEXT PRIMARY KEY,
            payload   TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )",
    )
    .ok()?;
    let payload: Option<String> = conn
        .query_row(
            "SELECT payload FROM exchange_cache WHERE cache_key = ?1",
            [key],
            |row| row.get(0),
        )
        .ok();
    payload
}

fn cache_write(app_handle: &tauri::AppHandle, key: &str, payload: &str) {
    let Some(path) = db_path(app_handle).ok() else {
        return;
    };
    let Ok(conn) = crate::core::database::create_connection(&path) else {
        return;
    };
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS exchange_cache (
            cache_key TEXT PRIMARY KEY,
            payload   TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )",
    );
    let _ = conn.execute(
        "INSERT INTO exchange_cache (cache_key, payload, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(cache_key) DO UPDATE SET payload = ?2, updated_at = ?3",
        rusqlite::params![key, payload, Utc::now().timestamp_millis()],
    );
}

// ---------------------------------------------------------------------------
// 数据源解析（纯函数，便于单测）
// ---------------------------------------------------------------------------

/// 仅保留 ISO 法币样式的代码（3 位纯字母），过滤掉带数字/符号的加密货币代码；
/// BTC 等 3 位字母的 crypto 仍可能从 currency-api 混入，但前端只消费精选币种列表
fn is_fiat_code(code: &str) -> bool {
    code.len() == 3 && code.chars().all(|c| c.is_ascii_alphabetic())
}

fn normalize_er_api(value: &Value, fetched_at: i64) -> Result<ExchangeRates, String> {
    if value.get("result").and_then(Value::as_str) != Some("success") {
        return Err("er-api 返回异常".into());
    }
    let published = value
        .get("time_last_update_unix")
        .and_then(Value::as_i64)
        .ok_or("er-api 缺少更新时间")?;
    let date = DateTime::from_timestamp(published, 0)
        .ok_or("er-api 更新时间非法")?
        .format("%Y-%m-%d")
        .to_string();
    let raw = value
        .get("rates")
        .and_then(Value::as_object)
        .ok_or("er-api 缺少 rates")?;
    let rates: HashMap<String, f64> = raw
        .iter()
        .filter(|(code, _)| is_fiat_code(code))
        .filter_map(|(code, v)| v.as_f64().map(|n| (code.to_uppercase(), n)))
        .collect();
    Ok(ExchangeRates {
        base: "CNY".into(),
        date,
        rates,
        source: "er-api".into(),
        fetched_at,
    })
}

fn normalize_frankfurter(value: &Value, fetched_at: i64) -> Result<ExchangeRates, String> {
    let date = value
        .get("date")
        .and_then(Value::as_str)
        .ok_or("frankfurter 缺少日期")?
        .to_string();
    let raw = value
        .get("rates")
        .and_then(Value::as_object)
        .ok_or("frankfurter 缺少 rates")?;
    let mut rates: HashMap<String, f64> = raw
        .iter()
        .filter(|(code, _)| is_fiat_code(code))
        .filter_map(|(code, v)| v.as_f64().map(|n| (code.to_uppercase(), n)))
        .collect();
    rates.insert("CNY".into(), 1.0);
    Ok(ExchangeRates {
        base: "CNY".into(),
        date,
        rates,
        source: "frankfurter".into(),
        fetched_at,
    })
}

fn normalize_currency_api(value: &Value, fetched_at: i64) -> Result<ExchangeRates, String> {
    let date = value
        .get("date")
        .and_then(Value::as_str)
        .ok_or("currency-api 缺少日期")?
        .to_string();
    let raw = value
        .get("cny")
        .and_then(Value::as_object)
        .ok_or("currency-api 缺少 cny 表")?;
    let mut rates: HashMap<String, f64> = raw
        .iter()
        .filter(|(code, _)| is_fiat_code(code))
        .filter_map(|(code, v)| v.as_f64().map(|n| (code.to_uppercase(), n)))
        .collect();
    rates.insert("CNY".into(), 1.0);
    Ok(ExchangeRates {
        base: "CNY".into(),
        date,
        rates,
        source: "currency-api".into(),
        fetched_at,
    })
}

/// 解析中国外汇交易中心中间价：取记录中最新一天，按请求的货币对顺序对齐 values。
/// 注意该接口对高频请求返回「信封正常但 records 为空」的限流响应，这里必须软处理。
fn parse_cn_parity(pairs: &[&str], value: &Value) -> Result<CnParity, String> {
    let Some(records) = value
        .pointer("/data/records")
        .and_then(Value::as_array)
        .filter(|records| !records.is_empty())
    else {
        return Err("接口未返回发布记录（可能触发限流或当日尚未发布）".into());
    };
    let latest = records.first().expect("非空已检查");
    let date = latest
        .get("date")
        .and_then(Value::as_str)
        .ok_or("中间价记录缺少日期")?
        .to_string();
    let values = latest
        .get("values")
        .and_then(Value::as_array)
        .ok_or("中间价记录缺少数值")?;
    if values.len() != pairs.len() {
        return Err("中间价数值与货币对数量不一致".into());
    }
    let items = pairs
        .iter()
        .zip(values)
        .filter_map(|(pair, v)| v.as_str().and_then(|s| s.parse::<f64>().ok()).map(|n| CnParityItem { pair: pair.to_string(), value: n }))
        .collect();
    Ok(CnParity { date, items })
}

/// 截取 JSON 响应片段用于日志排查
fn json_snippet(value: &Value) -> String {
    let text = value.to_string();
    text.chars().take(300).collect()
}

// ---------------------------------------------------------------------------
// 数据源抓取
// ---------------------------------------------------------------------------

async fn fetch_json(client: &Client, url: &str, referer: Option<&str>) -> Result<Value, String> {
    let mut request = client.get(url);
    if let Some(referer) = referer {
        request = request.header(reqwest::header::REFERER, referer);
    }
    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            log::warn!("请求 {url} 失败: {error}");
            return Err(format!("请求失败: {error}"));
        }
    };
    if !response.status().is_success() {
        log::warn!("请求 {url} 返回 HTTP {}", response.status());
        return Err(format!("HTTP {}", response.status()));
    }
    match response.json::<Value>().await {
        Ok(value) => Ok(value),
        Err(error) => {
            log::warn!("响应 {url} 解析失败: {error}");
            Err(format!("响应解析失败: {error}"))
        }
    }
}

/// 多源降级获取最新汇率：er-api → 欧央行 → jsDelivr CDN；全部失败回退本地缓存。
pub async fn get_latest_rates(app_handle: &tauri::AppHandle) -> Result<ExchangeRates, String> {
    let cached = cache_read(app_handle, CACHE_KEY_LATEST)
        .and_then(|payload| serde_json::from_str::<ExchangeRates>(&payload).ok());
    if let Some(rates) = &cached {
        if rates.date == beijing_today() {
            return Ok(rates.clone());
        }
    }

    let client = create_client_with_timeout(10);
    let fetched_at = Utc::now().timestamp_millis();
    let mut result = async {
        let value = fetch_json(&client, ER_API_URL, None).await?;
        normalize_er_api(&value, fetched_at)
    }
    .await;
    if result.is_err() {
        result = async {
            let value = fetch_json(&client, FRANKFURTER_URL, None).await?;
            normalize_frankfurter(&value, fetched_at)
        }
        .await;
    }
    if result.is_err() {
        result = async {
            let value = fetch_json(&client, CURRENCY_API_URL, None).await?;
            normalize_currency_api(&value, fetched_at)
        }
        .await;
    }
    if let Ok(rates) = result {
        if let Ok(payload) = serde_json::to_string(&rates) {
            cache_write(app_handle, CACHE_KEY_LATEST, &payload);
        }
        return Ok(rates);
    }

    match cached {
        Some(rates) => Ok(rates),
        None => Err("无法获取汇率数据，请检查网络后重试。".into()),
    }
}

/// 人民币中间价（中国外汇交易中心），同一天内使用缓存。
pub async fn get_cn_parity(app_handle: &tauri::AppHandle) -> Result<CnParity, String> {
    if let Some(payload) = cache_read(app_handle, CACHE_KEY_CN_PARITY) {
        if let Ok(parity) = serde_json::from_str::<CnParity>(&payload) {
            if parity.date == beijing_today() {
                return Ok(parity);
            }
        }
    }

    let client = create_client_with_timeout(10);
    let end = beijing_now();
    let start = end - chrono::Duration::days(7);
    let url = format!(
        "https://www.chinamoney.com.cn/ags/ms/cm-u-bk-ccpr/CcprHisNew?startDate={}&endDate={}&currency={}",
        start.format("%Y-%m-%d"),
        end.format("%Y-%m-%d"),
        CN_PARITY_PAIRS.join("%2C"),
    );
    let parity = match fetch_json(&client, &url, Some(CHINAMONEY_REFERER)).await {
        Ok(value) => {
            let outcome = parse_cn_parity(CN_PARITY_PAIRS, &value);
            if let Err(error) = &outcome {
                log::warn!("中间价解析失败: {error}; 响应片段: {}", json_snippet(&value));
            }
            outcome
        }
        Err(error) => Err(format!("中间价接口请求失败: {error}")),
    };
    if let Ok(parity) = &parity {
        if let Ok(payload) = serde_json::to_string(parity) {
            cache_write(app_handle, CACHE_KEY_CN_PARITY, &payload);
        }
        return Ok(parity.clone());
    }

    // 抓取失败（含当日尚未发布）回退缓存；注意中间价日期天然落后，直接回退不比较日期
    if let Some(payload) = cache_read(app_handle, CACHE_KEY_CN_PARITY) {
        if let Ok(parity) = serde_json::from_str::<CnParity>(&payload) {
            return Ok(parity);
        }
    }
    parity
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_er_api_parses_published_date_and_rates() {
        let sample = serde_json::json!({
            "result": "success",
            "time_last_update_unix": 1792713751_i64,
            "rates": { "USD": 0.149517, "EUR": 0.1337, "jpy": 23.53, "1inch": 1.6 }
        });
        let rates = normalize_er_api(&sample, 1000).expect("解析成功");
        assert_eq!(rates.base, "CNY");
        // 1792713751 = 2026-10-23 00:02:31 UTC
        assert_eq!(rates.date, "2026-10-23");
        assert_eq!(rates.rates.get("USD"), Some(&0.149517));
        assert_eq!(rates.rates.get("JPY"), Some(&23.53)); // 小写键被归一为大写
        assert!(!rates.rates.contains_key("1inch")); // 非法币形状的代码被过滤
        assert_eq!(rates.source, "er-api");
    }

    #[test]
    fn normalize_er_api_rejects_error_payload() {
        let sample = serde_json::json!({ "result": "error" });
        assert!(normalize_er_api(&sample, 0).is_err());
    }

    #[test]
    fn normalize_frankfurter_inserts_cny_base() {
        let sample = serde_json::json!({
            "amount": 1.0, "base": "CNY", "date": "2026-10-22",
            "rates": { "USD": 0.14952, "JPY": 23.53, "HKD": 1.1746 }
        });
        let rates = normalize_frankfurter(&sample, 0).expect("解析成功");
        assert_eq!(rates.date, "2026-10-22");
        assert_eq!(rates.rates.get("CNY"), Some(&1.0));
        assert_eq!(rates.rates.get("USD"), Some(&0.14952));
    }

    #[test]
    fn normalize_currency_api_uppercases_and_inserts_base() {
        let sample = serde_json::json!({
            "date": "2026-10-22",
            "cny": { "usd": 0.14949374, "jpy": 23.53061713, "eur": 0.13368875 }
        });
        let rates = normalize_currency_api(&sample, 0).expect("解析成功");
        assert_eq!(rates.rates.get("USD"), Some(&0.14949374));
        assert_eq!(rates.rates.get("CNY"), Some(&1.0));
        assert_eq!(rates.source, "currency-api");
    }

    #[test]
    fn parse_cn_parity_zips_pairs_with_values() {
        let pairs = ["USD/CNY", "EUR/CNY", "100JPY/CNY"];
        let sample = serde_json::json!({
            "data": {
                "records": [
                    { "date": "2026-10-23", "values": ["6.7180", "7.5140", "4.2793"] },
                    { "date": "2026-10-22", "values": ["6.7195", "7.5244", "4.2381"] }
                ]
            }
        });
        let parity = parse_cn_parity(&pairs, &sample).expect("解析成功");
        assert_eq!(parity.date, "2026-10-23"); // 取最新一天
        assert_eq!(parity.items.len(), 3);
        assert_eq!(parity.items[0].pair, "USD/CNY");
        assert_eq!(parity.items[0].value, 6.7180);
        assert_eq!(parity.items[2].value, 4.2793);
    }

    #[test]
    fn parse_cn_parity_rejects_mismatched_lengths() {
        let pairs = ["USD/CNY", "EUR/CNY"];
        let sample = serde_json::json!({
            "data": { "records": [ { "date": "2026-10-23", "values": ["6.7180"] } ] }
        });
        assert!(parse_cn_parity(&pairs, &sample).is_err());
    }

    #[test]
    fn parse_cn_parity_rejects_empty_records() {
        let sample = serde_json::json!({ "data": { "records": [] } });
        assert!(parse_cn_parity(&["USD/CNY"], &sample).is_err());
    }

    #[test]
    fn parse_cn_parity_soft_handles_throttled_envelope() {
        // 限流响应：信封字段齐全但缺 records
        let sample = serde_json::json!({ "head": { "rep_code": "200" }, "data": { "total": 3 } });
        assert!(parse_cn_parity(&["USD/CNY"], &sample).is_err());
    }

    #[test]
    fn beijing_today_formats_iso_date() {
        let today = beijing_today();
        assert_eq!(today.len(), 10);
        assert!(today.chars().nth(4) == Some('-'));
    }
}
