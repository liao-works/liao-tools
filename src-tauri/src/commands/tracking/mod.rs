//! 运单轨迹批量查询：17TRACK 开放接口（v2.4）客户端。
//!
//! 用户自备 API Key（官网免费申请，按额度计费）；Key 只在调用时由前端
//! 传入，不做持久化。接口限制：单批最多 40 票、3 请求/秒——批量时自动
//! 分块并在请求间休眠。查询失败的单号保留原因，绝不静默丢弃。

pub mod commands;
pub mod excel;

use crate::core::http::HttpClientBuilder;
use crate::models::tracking::TrackingRow;
use serde_json::{json, Value};
use std::time::Duration;

const API_BASE: &str = "https://api.17track.net/track/v2.4";
/// 官方单次请求上限
pub const MAX_BATCH: usize = 40;
/// 已注册过的单号无需重复注册，视为成功
const ERR_ALREADY_REGISTERED: i64 = -18019901;
const ERR_INVALID_KEY: i64 = -18010002;

/// 规整单号列表：去空白、去重（保序）、剔除空串
pub fn normalize_numbers(input: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    input
        .iter()
        .map(|n| n.trim())
        .filter(|n| !n.is_empty())
        .filter(|n| seen.insert(n.to_string()))
        .map(|n| n.to_string())
        .collect()
}

fn top_level_error(code: i64, body: &Value) -> String {
    let message = body
        .get("data")
        .and_then(Value::as_str)
        .or_else(|| body.get("message").and_then(Value::as_str))
        .unwrap_or("接口返回未知错误");
    match code {
        ERR_INVALID_KEY => "API Key 无效或未授权（-18010002），请在 17TRACK 官网核对密钥".to_string(),
        _ => format!("17TRACK 接口错误 {code}：{message}"),
    }
}

/// POST 一个接口并返回成功响应体；HTTP 或顶层 code!=0 时报错
async fn post_api(
    client: &reqwest::Client,
    path: &str,
    api_key: &str,
    body: &impl serde::Serialize,
) -> Result<Value, String> {
    let resp = client
        .post(format!("{API_BASE}/{path}"))
        .header("17token", api_key)
        .json(body)
        .send()
        .await
        .map_err(|e| format!("请求 17TRACK 失败：{e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let parsed: Value = serde_json::from_str(&text)
        .map_err(|_| format!("17TRACK 返回非 JSON（HTTP {status}）：{}", truncate(&text, 200)))?;
    let code = parsed.get("code").and_then(Value::as_i64).unwrap_or_default();
    if code != 0 {
        return Err(top_level_error(code, &parsed));
    }
    Ok(parsed)
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else {
        format!("{}…", text.chars().take(max).collect::<String>())
    }
}

fn empty_row(number: &str, error: String) -> TrackingRow {
    TrackingRow {
        number: number.to_string(),
        carrier: String::new(),
        status: String::new(),
        sub_status: String::new(),
        latest_event_time: String::new(),
        latest_event_description: String::new(),
        latest_event_location: String::new(),
        transit_days: None,
        estimated_delivery: String::new(),
        error: Some(error),
    }
}

/// 从 accepted 条目解析结果行；轨迹字段缺失时保留空串，不猜测
pub fn parse_accepted_row(item: &Value) -> TrackingRow {
    let number = item
        .get("number")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let track_info = item.get("track_info");
    let latest_status = track_info.and_then(|t| t.get("latest_status"));
    let latest_event = track_info.and_then(|t| t.get("latest_event"));
    let time_metrics = track_info.and_then(|t| t.get("time_metrics"));
    let estimated = time_metrics
        .and_then(|m| m.get("estimated_delivery_date"))
        .map(|date| {
            let from = date.get("from").and_then(Value::as_str).unwrap_or_default();
            let to = date.get("to").and_then(Value::as_str).unwrap_or_default();
            match (from.is_empty(), to.is_empty()) {
                (true, true) => String::new(),
                (true, false) => to.to_string(),
                (false, true) => from.to_string(),
                (false, false) => format!("{from} ~ {to}"),
            }
        })
        .unwrap_or_default();
    // 承运商名取全部 provider 的去重名称
    let mut carriers: Vec<String> = Vec::new();
    if let Some(providers) = track_info
        .and_then(|t| t.get("tracking"))
        .and_then(|t| t.get("providers"))
        .and_then(Value::as_array)
    {
        for provider in providers {
            if let Some(name) = provider
                .get("provider")
                .and_then(|p| p.get("name"))
                .and_then(Value::as_str)
            {
                if !name.is_empty() && !carriers.iter().any(|c| c == name) {
                    carriers.push(name.to_string());
                }
            }
        }
    }
    TrackingRow {
        number,
        carrier: carriers.join(" / "),
        status: latest_status
            .and_then(|s| s.get("status"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        sub_status: latest_status
            .and_then(|s| {
                s.get("sub_status_descr")
                    .and_then(Value::as_str)
                    .or_else(|| s.get("sub_status").and_then(Value::as_str))
            })
            .unwrap_or_default()
            .to_string(),
        latest_event_time: latest_event
            .and_then(|e| e.get("time_iso"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        latest_event_description: latest_event
            .and_then(|e| e.get("description"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        latest_event_location: latest_event
            .and_then(|e| e.get("location"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        transit_days: time_metrics
            .and_then(|m| m.get("days_of_transit"))
            .and_then(Value::as_i64),
        estimated_delivery: estimated,
        error: None,
    }
}

/// 从 gettrackinfo 响应解析全部结果行（accepted + rejected）
pub fn parse_gettrackinfo_response(body: &Value) -> Vec<TrackingRow> {
    let mut rows = Vec::new();
    if let Some(accepted) = body.pointer("/data/accepted").and_then(Value::as_array) {
        for item in accepted {
            rows.push(parse_accepted_row(item));
        }
    }
    if let Some(rejected) = body.pointer("/data/rejected").and_then(Value::as_array) {
        for item in rejected {
            let number = item.get("number").and_then(Value::as_str).unwrap_or_default();
            let code = item.pointer("/error/code").and_then(Value::as_i64);
            let message = item
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("未获取到轨迹");
            let friendly = match code {
                Some(-18019902) => "尚未注册或轨迹仍在采集，请稍后重试".to_string(),
                Some(-18019903) => "承运商无法自动识别，请在 17TRACK 指定承运商后重试".to_string(),
                Some(-18019907) => "今日查询额度已用尽".to_string(),
                Some(-18019908) => "API 额度已耗尽，请充值或明日再试".to_string(),
                _ => format!("{message}（code {code:?}）"),
            };
            rows.push(empty_row(number, friendly));
        }
    }
    rows
}

/// 注册一批单号（已注册视为成功）。返回是否为致命错误（如 Key 无效）。
async fn register_chunk(
    client: &reqwest::Client,
    api_key: &str,
    numbers: &[String],
) -> Result<(), String> {
    let body: Vec<Value> = numbers
        .iter()
        .map(|number| json!({ "number": number }))
        .collect();
    let result = post_api(client, "register", api_key, &body).await;
    match result {
        Ok(body) => {
            // 单号级拒绝里，除"已注册"外也值得记录；但注册阶段先放行，
            // 让 gettrackinfo 给出更明确的结果与原因。
            let fatal = body
                .pointer("/data/rejected")
                .and_then(Value::as_array)
                .map(|rejected| {
                    rejected.iter().any(|item| {
                        item.pointer("/error/code").and_then(Value::as_i64) == Some(ERR_INVALID_KEY)
                    })
                })
                .unwrap_or(false);
            if fatal {
                Err(top_level_error(ERR_INVALID_KEY, &body))
            } else {
                Ok(())
            }
        }
        Err(err) => {
            if err.contains("-18010002") {
                Err(err)
            } else {
                // 注册失败不致命：单号可能早已注册过，继续尝试查询
                Ok(())
            }
        }
    }
}

/// 查询一批单号
async fn gettrackinfo_chunk(
    client: &reqwest::Client,
    api_key: &str,
    numbers: &[String],
) -> Result<Vec<TrackingRow>, String> {
    let body: Vec<Value> = numbers
        .iter()
        .map(|number| json!({ "number": number }))
        .collect();
    let response = post_api(client, "gettrackinfo", api_key, &body).await?;
    let mut rows = parse_gettrackinfo_response(&response);
    // 保证每个请求的单号都有结果行（接口偶发漏返时补占位，避免行丢失）
    for number in numbers {
        if !rows.iter().any(|row| row.number == *number) {
            rows.push(empty_row(number, "接口未返回该单号的结果".to_string()));
        }
    }
    Ok(rows)
}

/// 批量主流程：分块注册 → 查询 → 汇总。progress 回调 (current, total)。
pub async fn run_batch<F>(
    numbers: &[String],
    api_key: &str,
    mut progress: F,
) -> Result<crate::models::tracking::TrackingBatchResult, String>
where
    F: FnMut(usize, usize),
{
    let numbers = normalize_numbers(numbers);
    if numbers.is_empty() {
        return Err("请提供至少一个运单号".to_string());
    }
    if api_key.trim().is_empty() {
        return Err("请先填写 17TRACK API Key（官网免费申请）".to_string());
    }
    let client = HttpClientBuilder::new()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("初始化 HTTP 客户端失败：{e}"))?;

    let total = numbers.len();
    let mut rows: Vec<TrackingRow> = Vec::with_capacity(total);
    let mut fatal_error: Option<String> = None;

    for (index, chunk) in numbers.chunks(MAX_BATCH).enumerate() {
        if let Err(err) = register_chunk(&client, api_key, chunk).await {
            // Key 无效无法继续，直接终止
            for number in chunk {
                rows.push(empty_row(number, err.clone()));
            }
            fatal_error = Some(err);
            break;
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
        match gettrackinfo_chunk(&client, api_key, chunk).await {
            Ok(mut chunk_rows) => rows.append(&mut chunk_rows),
            Err(err) => {
                let fatal = err.contains("-18010002");
                for number in chunk {
                    rows.push(empty_row(number, err.clone()));
                }
                if fatal {
                    fatal_error = Some(err);
                    break;
                }
            }
        }
        progress((index + 1) * MAX_BATCH, total);
        // 3 请求/秒限速：每块两个请求后休眠
        if index + 1 < numbers.len().div_ceil(MAX_BATCH) {
            tokio::time::sleep(Duration::from_millis(400)).await;
        }
    }

    let success = rows.iter().filter(|row| row.error.is_none()).count();
    if let Some(err) = fatal_error {
        if success == 0 {
            return Err(err);
        }
    }
    Ok(crate::models::tracking::TrackingBatchResult {
        total,
        success,
        failed: total - success,
        rows,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_trims_and_dedupes() {
        let input = vec![
            " RR123456789CN ".to_string(),
            "".to_string(),
            "RR123456789CN".to_string(),
            "  ".to_string(),
            "LP00451203912345".to_string(),
        ];
        assert_eq!(
            normalize_numbers(&input),
            vec!["RR123456789CN".to_string(), "LP00451203912345".to_string()]
        );
    }

    #[test]
    fn parses_accepted_and_rejected_rows() {
        let body: Value = serde_json::from_str(
            r#"{
                "code": 0,
                "data": {
                    "accepted": [
                        {
                            "number": "RR123456789CN",
                            "carrier": "3011",
                            "track_info": {
                                "latest_status": {
                                    "status": "InTransit",
                                    "sub_status": "InTransit_Other",
                                    "sub_status_descr": "运输途中"
                                },
                                "latest_event": {
                                    "time_iso": "2026-10-18T08:30:00+08:00",
                                    "description": "到达交换局",
                                    "location": "Shanghai"
                                },
                                "time_metrics": {
                                    "days_of_transit": 6,
                                    "estimated_delivery_date": {
                                        "from": "2026-10-20",
                                        "to": "2026-10-24"
                                    }
                                },
                                "tracking": {
                                    "providers": [
                                        {"provider": {"key": "3011", "name": "中国邮政"}, "events": []},
                                        {"provider": {"key": "100003", "name": "中国邮政"}, "events": []},
                                        {"provider": {"key": "9999", "name": "Royal Mail"}, "events": []}
                                    ]
                                }
                            }
                        }
                    ],
                    "rejected": [
                        {
                            "number": "BAD123",
                            "error": {"code": -18019902, "message": "The tracking number does not exist."}
                        },
                        {
                            "number": "EXP01",
                            "error": {"code": -18019908, "message": "Quotas exhausted."}
                        }
                    ]
                }
            }"#,
        )
        .unwrap();
        let rows = parse_gettrackinfo_response(&body);
        assert_eq!(rows.len(), 3);
        let ok = &rows[0];
        assert_eq!(ok.number, "RR123456789CN");
        assert_eq!(ok.status, "InTransit");
        assert_eq!(ok.sub_status, "运输途中");
        assert_eq!(ok.latest_event_description, "到达交换局");
        assert_eq!(ok.transit_days, Some(6));
        assert_eq!(ok.estimated_delivery, "2026-10-20 ~ 2026-10-24");
        assert_eq!(ok.carrier, "中国邮政 / Royal Mail");
        assert!(ok.error.is_none());
        assert!(rows[1].error.as_deref().unwrap().contains("尚未注册"));
        assert!(rows[2].error.as_deref().unwrap().contains("额度已耗尽"));
    }

    #[test]
    fn parses_minimal_accepted_row_without_missing_fields() {
        let body: Value = serde_json::from_str(
            r#"{"code":0,"data":{"accepted":[{"number":"NP1","carrier":"3011"}],"rejected":[]}}"#,
        )
        .unwrap();
        let rows = parse_gettrackinfo_response(&body);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].number, "NP1");
        assert_eq!(rows[0].status, "");
        assert_eq!(rows[0].transit_days, None);
        assert!(rows[0].error.is_none());
    }

    #[test]
    fn estimated_delivery_single_side_formats() {
        let body: Value = serde_json::from_str(
            r#"{"code":0,"data":{"accepted":[{"number":"N","track_info":{"time_metrics":{"estimated_delivery_date":{"from":"2026-10-20"}}}}],"rejected":[]}}"#,
        )
        .unwrap();
        let rows = parse_gettrackinfo_response(&body);
        assert_eq!(rows[0].estimated_delivery, "2026-10-20");
    }
}
