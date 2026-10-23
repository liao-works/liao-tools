use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 统一汇率数据：rates 为「1 单位 base 币 = X 单位目标币」，默认基准 CNY。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeRates {
    pub base: String,
    /// 数据日期（YYYY-MM-DD，数据源的报价日，非抓取时间）
    pub date: String,
    pub rates: HashMap<String, f64>,
    /// 来源标识：er-api / frankfurter / currency-api
    pub source: String,
    /// 抓取时间（unix 毫秒），用于前端区分是否为历史缓存
    pub fetched_at: i64,
}

/// 人民币中间价单项，pair 沿用官方写法（USD/CNY、100JPY/CNY）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CnParityItem {
    pub pair: String,
    pub value: f64,
}

/// 人民币中间价，数据来自中国外汇交易中心（CFETS）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CnParity {
    /// 中间价发布日期（YYYY-MM-DD）
    pub date: String,
    pub items: Vec<CnParityItem>,
}
