use serde::{Deserialize, Serialize};

/// recognize 接口返回的承运商候选。
/// 对方接口出参为 snake_case；序列化给前端时按本项目约定用 camelCase，
/// 因此每个字段用 rename(camelCase) + alias(snake_case) 兼容两个方向。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecognizedCarrier {
    #[serde(rename = "carrierCode", alias = "carrier_code")]
    pub carrier_code: String,
    #[serde(rename = "carrierName", alias = "carrier_name", default)]
    pub carrier_name: String,
    #[serde(rename = "carrierNameEn", alias = "carrier_name_en", default)]
    pub carrier_name_en: Option<String>,
    #[serde(default)]
    pub confidence: Option<i64>,
    #[serde(rename = "jumpUrl", alias = "jump_url", default)]
    pub jump_url: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
}

/// query 接口返回的单条轨迹事件（在物流巴巴系统内发货过的单号才有）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTrackEvent {
    #[serde(default)]
    pub sdate: Option<String>,
    #[serde(default)]
    pub place: Option<String>,
    #[serde(default)]
    pub intro: Option<String>,
}

/// query 接口 data 的宽松解析：order 形态各异，只取确定存在的轨迹事件
#[derive(Debug, Clone, Deserialize, Default)]
pub struct RemoteTrackData {
    #[serde(default)]
    pub no: Option<String>,
    #[serde(default)]
    pub items: Vec<RemoteTrackEvent>,
}

/// 一次单号查询的聚合结果（recognize + query 并发后合并）
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShippingLookupResult {
    pub number: String,
    pub category: String,
    pub carriers: Vec<RecognizedCarrier>,
    /// 在物流巴巴系统内查到的轨迹事件；空 = 该单号不在其系统内
    pub track_events: Vec<RemoteTrackEvent>,
}

/// recognize 接口原始响应（code=1 为成功）
#[derive(Debug, Deserialize)]
pub struct RecognizeResponse {
    #[allow(dead_code)]
    pub code: i64,
    #[serde(default)]
    pub data: Option<Vec<RecognizedCarrier>>,
}

/// query 接口原始响应
#[derive(Debug, Deserialize)]
pub struct QueryResponse {
    #[allow(dead_code)]
    pub code: i64,
    #[serde(default)]
    pub data: Option<RemoteTrackData>,
}
