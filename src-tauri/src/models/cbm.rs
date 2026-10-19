use serde::{Deserialize, Serialize};

fn default_length_unit() -> String {
    "cm".to_string()
}

fn default_true() -> bool {
    true
}

fn default_weight_unit() -> String {
    "kg".to_string()
}

fn default_quantity() -> f64 {
    1.0
}

fn default_divisor() -> f64 {
    6000.0
}

/// 同规格包裹行：长宽高为同单位下的单件尺寸
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CbmPackage {
    #[serde(default)]
    pub name: String,
    pub length: f64,
    pub width: f64,
    pub height: f64,
    /// mm / cm / m / in / ft
    #[serde(default = "default_length_unit")]
    pub length_unit: String,
    /// 每件实重，0 表示未提供
    #[serde(default)]
    pub weight: f64,
    /// g / kg / lb
    #[serde(default = "default_weight_unit")]
    pub weight_unit: String,
    #[serde(default = "default_quantity")]
    pub quantity: f64,
}

/// 试算请求：体积重系数（cm³/kg）决定计费口径
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CbmRequest {
    pub packages: Vec<CbmPackage>,
    /// 6000 空运 / 5000 国际快递 / 1000 海运拼箱，或自定义
    #[serde(default = "default_divisor")]
    pub divisor: f64,
}

/// 批量试算全局参数
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CbmBatchParams {
    #[serde(default = "default_length_unit")]
    pub length_unit: String,
    #[serde(default = "default_weight_unit")]
    pub weight_unit: String,
    #[serde(default = "default_divisor")]
    pub divisor: f64,
}

/// 单行试算结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CbmPackageResult {
    pub name: String,
    pub line: usize,
    /// 归一化为 cm 后的尺寸
    pub length_cm: f64,
    pub width_cm: f64,
    pub height_cm: f64,
    pub quantity: f64,
    pub total_volume_cbm: f64,
    pub total_actual_weight_kg: f64,
    pub volumetric_weight_kg: f64,
    pub chargeable_weight_kg: f64,
    /// "实重" 或 "体积重"
    pub charge_basis: String,
}

/// 常用柜型装柜估算
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CbmContainerEstimate {
    pub name: String,
    /// 内尺寸（米）展示串
    pub internal: String,
    pub capacity_cbm: f64,
    pub payload_kg: f64,
    pub containers_by_volume: u32,
    pub containers_by_weight: u32,
    pub containers_needed: u32,
}

/// 试算结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CbmResult {
    pub packages: Vec<CbmPackageResult>,
    pub total_volume_cbm: f64,
    pub total_actual_weight_kg: f64,
    pub total_volumetric_weight_kg: f64,
    pub chargeable_weight_kg: f64,
    pub charge_basis: String,
    pub divisor: f64,
    pub containers: Vec<CbmContainerEstimate>,
    pub errors: Vec<String>,
}

/// 批量试算汇总
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CbmBatchResult {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub errors: Vec<String>,
    pub output_path: String,
}

/// 单规格装柜试算请求：同一商品装满柜的简化估算
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CbmLoadingRequest {
    pub length: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default = "default_length_unit")]
    pub length_unit: String,
    /// 单件实重，0 表示未提供（只按体积估算）
    #[serde(default)]
    pub weight: f64,
    #[serde(default = "default_weight_unit")]
    pub weight_unit: String,
    pub quantity: f64,
    /// 是否可堆叠（不可堆叠时只装一层）
    #[serde(default = "default_true")]
    pub stackable: bool,
}

/// 单柜型装柜试算结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CbmLoadingContainer {
    pub name: String,
    /// 每柜可装件数；0 表示单件超出该柜型
    pub pieces_per_container: u32,
    pub containers_needed: u32,
    /// 体积 / 重量利用率（0-1）
    pub volume_utilization: f64,
    pub weight_utilization: Option<f64>,
    /// 限制装载数的因素："体积" 或 "重量"
    pub limiting_factor: String,
}

/// 装柜试算结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CbmLoadingResult {
    pub item_volume_cbm: f64,
    pub item_weight_kg: Option<f64>,
    pub total_volume_cbm: f64,
    pub containers: Vec<CbmLoadingContainer>,
}
