//! 船司单号在线识别：复刻物流巴巴（5688.cn）货物追踪页的接口协议。
//!
//! 协议要点（2026-10-20 从其前端代码核实）：
//! - `GET /api/5688/track/recognize?no=&category=` 与 `GET /api/5688/track/query?no=`
//! - 请求头 `X-Timestamp`（秒）/ `X-Nonce`（随机串）/ `X-Sign`（HMAC-SHA256 hex），
//!   签名消息 = `时间戳 + 路径 + 随机数`（路径去掉 /api 前缀、不含 query），
//!   密钥 = `aw_5688_master_2026_<unix周数>`（前端硬编码、按周轮换）
//! - 403 时按响应 Date 头校准本地时钟偏移后重试一次
//! - 这是对方未公开的内部接口，密钥字面量含年份（2026），对方升级即可能失效；
//!   调用方必须容忍失败并回退到本地识别。
use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use sha2::Sha256;
use tauri::AppHandle;

use crate::core::http::HttpClientBuilder;
use crate::models::shipping::{
    QueryResponse, RecognizeResponse, RecognizedCarrier, RemoteTrackData, RemoteTrackEvent,
    ShippingLookupResult,
};

const API_BASE: &str = "https://www.5688.cn";
/// 密钥盐值里的年份字面量（与对方前端保持一致，随其升级而更新）
const SIGN_SALT_YEAR: &str = "2026";
const MAX_NUMBER_LEN: usize = 64;
const VALID_CATEGORIES: [&str; 3] = ["sea", "air", "express"];

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 与对方前端一致：随机串 = 时间戳（毫秒）的 36 进制 + 纳秒的 36 进制尾巴
fn make_nonce() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!(
        "{}{}",
        radix36(millis as u64),
        radix36(nanos as u64 | 1)
    )
}

fn radix36(mut v: u64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if v == 0 {
        return "0".into();
    }
    let mut buf = Vec::new();
    while v > 0 {
        buf.push(DIGITS[(v % 36) as usize]);
        v /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).unwrap_or_default()
}

/// HMAC-SHA256 hex，独立成纯函数便于测试
fn hmac_hex(secret: &str, message: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(message.as_bytes());
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// 生成签名三件套；path 为去掉 /api 前缀、不含 query 的路径
fn sign_headers(path: &str, clock_offset_secs: i64) -> Vec<(&'static str, String)> {
    let ts = (unix_secs() as i64 + clock_offset_secs).to_string();
    let nonce = make_nonce();
    let week = (unix_secs() as i64 + clock_offset_secs).max(0) as u64 / 604_800;
    let secret = format!("aw_5688_master_{SIGN_SALT_YEAR}_{week}");
    let sign = hmac_hex(&secret, &format!("{ts}{path}{nonce}"));
    vec![
        ("X-Timestamp", ts),
        ("X-Nonce", nonce),
        ("X-Sign", sign),
        ("X-Locale", "zh".to_string()),
    ]
}

/// 规范化签名路径：/api/5688/track/x -> /5688/track/x
fn sign_path(api_path: &str) -> &str {
    api_path.strip_prefix("/api").unwrap_or(api_path)
}

fn normalize_number(raw: &str) -> Result<String, String> {
    let number = raw.trim().to_uppercase();
    if number.is_empty() {
        return Err("请输入单号".into());
    }
    if number.len() > MAX_NUMBER_LEN {
        return Err("单号过长".into());
    }
    Ok(number)
}

async fn call_api(
    client: &reqwest::Client,
    api_path: &str,
    query: &str,
    clock_offset_secs: &mut i64,
) -> Result<String, String> {
    let path = sign_path(api_path);
    let url = format!("{API_BASE}{api_path}{query}");
    let mut resp = None;
    // 最多两次：403 时按服务器 Date 校准时钟后重试
    for attempt in 0..2 {
        let mut headers = reqwest::header::HeaderMap::new();
        for (name, value) in sign_headers(path, *clock_offset_secs) {
            if let Ok(v) = reqwest::header::HeaderValue::from_str(&value) {
                headers.insert(name, v);
            }
        }
        let r = client
            .get(&url)
            .headers(headers)
            .header("Referer", format!("{API_BASE}/track"))
            .send()
            .await
            .map_err(|e| format!("请求失败: {e}"))?;
        if r.status() == reqwest::StatusCode::FORBIDDEN && attempt == 0 {
            if let Some(date) = r.headers().get(reqwest::header::DATE).and_then(|v| v.to_str().ok()) {
                if let Some(server_secs) = parse_http_date_secs(date) {
                    let offset = server_secs - unix_secs() as i64;
                    if offset.abs() > 30 {
                        *clock_offset_secs = offset;
                    }
                }
            }
            continue;
        }
        resp = Some(r);
        break;
    }
    let resp = resp.ok_or_else(|| "请求被拒绝".to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
    if !status.is_success() {
        return Err(format!("接口返回 {status}: {}", truncate(&body, 120)));
    }
    Ok(body)
}

fn truncate(s: &str, max: usize) -> &str {
    match s.char_indices().nth(max) {
        Some((i, _)) => &s[..i],
        None => s,
    }
}

/// 解析 HTTP Date 头（RFC 7231 IMF-fixdate，如 `Tue, 20 Oct 2026 02:11:47 GMT`）为 unix 秒。
/// 仅支持这一种格式（reqwest/hyper 生成与主流服务器一致），避免引入额外的解析依赖。
fn parse_http_date_secs(raw: &str) -> Option<i64> {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let parts: Vec<&str> = raw.split_whitespace().collect();
    // day month year hh:mm:ss
    if parts.len() < 5 {
        return None;
    }
    let day: i64 = parts[1].parse().ok()?;
    let month = MONTHS.iter().position(|m| *m == parts[2])? as i64;
    let year: i64 = parts[3].parse().ok()?;
    let mut hms = parts[4].split(':');
    let hour: i64 = hms.next()?.parse().ok()?;
    let minute: i64 = hms.next()?.parse().ok()?;
    let second: i64 = hms.next()?.parse().ok()?;
    // civil date -> days since epoch（Howard Hinnant 算法；month 为 0 基）
    let y = if month <= 1 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 10) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * 86_400 + hour * 3_600 + minute * 60 + second)
}

fn parse_query_track(data: Option<RemoteTrackData>, number: &str) -> Vec<RemoteTrackEvent> {
    match data {
        Some(d) if !d.items.is_empty() => d.items,
        _ => {
            let _ = number;
            Vec::new()
        }
    }
}

/// 单号查询：recognize（识别承运商）+ query（系统内轨迹）并发后合并
#[tauri::command]
pub async fn shipping_track_lookup(
    number: String,
    category: String,
    _app_handle: AppHandle,
) -> Result<ShippingLookupResult, String> {
    let number = normalize_number(&number)?;
    let category = category.trim().to_lowercase();
    if !VALID_CATEGORIES.contains(&category.as_str()) {
        return Err("category 仅支持 sea / air / express".into());
    }

    let client = HttpClientBuilder::new()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;
    let mut clock_offset: i64 = 0;

    let recognize_path = "/api/5688/track/recognize";
    let query_path = "/api/5688/track/query";
    let recognize_query = format!("?no={number}&category={category}");
    let query_query = format!("?no={number}");
    let mut rec_offset: i64 = 0;
    let mut qry_offset: i64 = 0;
    let (rec_res, qry_res) = tokio::join!(
        call_api(&client, recognize_path, &recognize_query, &mut rec_offset),
        call_api(&client, query_path, &query_query, &mut qry_offset)
    );

    let carriers: Vec<RecognizedCarrier> = match &rec_res {
        Ok(body) => serde_json::from_str::<RecognizeResponse>(body)
            .ok()
            .and_then(|r| r.data)
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    let track_events: Vec<RemoteTrackEvent> = match &qry_res {
        Ok(body) => serde_json::from_str::<QueryResponse>(body)
            .ok()
            .map(|r| parse_query_track(r.data, &number))
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    };

    if carriers.is_empty() && track_events.is_empty() {
        // 两个接口都失败时，把错误暴露给前端（多为网络或对方协议变更）
        if let (Err(re), Err(qe)) = (&rec_res, &qry_res) {
            return Err(format!("在线识别不可用：{re}"));
        }
    }

    Ok(ShippingLookupResult {
        number,
        category,
        carriers,
        track_events,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hmac_hex_matches_reference_vector() {
        // 参考值由 Node crypto.createHmac('sha256', secret).update(ts+path+nonce) 生成
        let sign = hmac_hex(
            "aw_5688_master_2026_2924",
            "1769000000/5688/track/recognizetestnonce123",
        );
        assert_eq!(
            sign,
            "2c0c3368a3fcfa57eb4355020e34f327a3296d4553d12276503051b52fa09178"
        );
    }

    #[test]
    fn sign_headers_shape() {
        let headers = sign_headers("/5688/track/recognize", 0);
        let get = |k: &str| headers.iter().find(|(n, _)| *n == k).map(|(_, v)| v.clone());
        assert_eq!(get("X-Locale").as_deref(), Some("zh"));
        let ts = get("X-Timestamp").unwrap();
        assert!(ts.parse::<i64>().is_ok());
        assert!(!get("X-Nonce").unwrap().is_empty());
        assert_eq!(get("X-Sign").unwrap().len(), 64);
    }

    #[test]
    fn sign_path_strips_api_prefix() {
        assert_eq!(sign_path("/api/5688/track/query"), "/5688/track/query");
        assert_eq!(sign_path("/5688/track/query"), "/5688/track/query");
    }

    #[test]
    fn normalize_rejects_blank_and_long() {
        assert!(normalize_number("  ").is_err());
        assert!(normalize_number(&"A".repeat(65)).is_err());
        assert_eq!(normalize_number(" cosu123 ").unwrap(), "COSU123");
    }

    #[test]
    fn parse_recognize_fixture() {
        let body = r#"{"data":[{"carrier_code":"EMC","carrier_name":"长荣海运股份有限公司","carrier_name_en":"EVERGREEN MARINE CORPORATION","logo":"/static/x.png","confidence":95,"exclusivity":"exclusive","jump_url":"http://www.shipmentlink.com/servlet/TDB1_CargoTracking.do","jump_form":null,"has_deep_link":false,"pattern_id":582}],"msg":"操作成功","code":1}"#;
        let parsed: RecognizeResponse = serde_json::from_str(body).unwrap();
        let carriers = parsed.data.unwrap();
        assert_eq!(carriers.len(), 1);
        assert_eq!(carriers[0].carrier_code, "EMC");
        assert_eq!(carriers[0].confidence, Some(95));
        assert_eq!(
            carriers[0].jump_url.as_deref(),
            Some("http://www.shipmentlink.com/servlet/TDB1_CargoTracking.do")
        );
    }

    #[test]
    fn parse_query_fixture_with_events() {
        let body = r#"{"data":{"no":"TEST1","items":[{"id":1,"place":"宁波","sdate":"2026-01-18 12:00","intro":"装船离港"},{"id":2,"place":"上海","sdate":"2026-01-11 10:30","intro":"进场"}],"details":[]},"msg":"操作成功","code":1}"#;
        let parsed: QueryResponse = serde_json::from_str(body).unwrap();
        let events = parse_query_track(parsed.data, "TEST1");
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].place.as_deref(), Some("宁波"));
        assert_eq!(events[0].intro.as_deref(), Some("装船离港"));
    }

    #[test]
    fn parse_query_fixture_empty_items() {
        let body = r#"{"data":{"no":"149607520779","items":[],"details":[]},"msg":"操作成功","code":1}"#;
        let parsed: QueryResponse = serde_json::from_str(body).unwrap();
        assert!(parse_query_track(parsed.data, "X").is_empty());
    }

    #[test]
    fn radix36_basics() {
        assert_eq!(radix36(0), "0");
        assert_eq!(radix36(35), "z");
        assert_eq!(radix36(36), "10");
    }

    /// 需要外网，仅本地手动验证签名协议是否仍被对方接受：cargo test live_recognize -- --ignored --nocapture
    #[tokio::test]
    #[ignore = "需要外网"]
    async fn live_recognize_smoke() {
        let client = HttpClientBuilder::new()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .build()
            .unwrap();
        let mut offset = 0i64;
        let body = call_api(
            &client,
            "/api/5688/track/recognize",
            "?no=MAEU123456789&category=sea",
            &mut offset,
        )
        .await
        .unwrap();
        assert!(body.contains("carrier_code"), "unexpected body: {body}");
        println!("live body: {body}");
    }

    #[test]
    fn parse_http_date_epoch_math() {
        // 参照值由 Date.parse 生成（Node 24 验证）
        assert_eq!(
            parse_http_date_secs("Tue, 20 Oct 2026 00:00:00 GMT"),
            Some(1_792_454_400)
        );
        // 1970-01-01 00:00:00 UTC = 0
        assert_eq!(parse_http_date_secs("Thu, 01 Jan 1970 00:00:00 GMT"), Some(0));
        // 闰年 2024-02-29 12:00:00 UTC = 1709208000
        assert_eq!(
            parse_http_date_secs("Thu, 29 Feb 2024 12:00:00 GMT"),
            Some(1_709_208_000)
        );
        assert_eq!(parse_http_date_secs("garbage"), None);
    }
}
