use serde::{Deserialize, Serialize};

/// Excel 处理类型枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProcessType {
    SeaRailWithImage,    // 海铁有图版
    SeaRailNoImage,      // 海铁无图版
    AirFreight,          // 空运版
}

impl ProcessType {
    pub fn from_string(s: &str) -> Option<Self> {
        match s {
            "sea-rail-with-image" => Some(ProcessType::SeaRailWithImage),
            "sea-rail-no-image" => Some(ProcessType::SeaRailNoImage),
            "air-freight" => Some(ProcessType::AirFreight),
            _ => None,
        }
    }

    pub fn to_string(&self) -> String {
        match self {
            ProcessType::SeaRailWithImage => "sea-rail-with-image".to_string(),
            ProcessType::SeaRailNoImage => "sea-rail-no-image".to_string(),
            ProcessType::AirFreight => "air-freight".to_string(),
        }
    }
}

/// 处理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessConfig {
    pub process_type: ProcessType,
    pub weight_column: usize,      // 重量列索引（海铁13，空运15）
    pub box_column: usize,         // 箱子列索引（海铁11，空运13）
    pub copy_images: bool,         // 是否复制图片
}

impl ProcessConfig {
    /// 创建默认配置
    pub fn default_for_type(process_type: ProcessType) -> Self {
        match process_type {
            ProcessType::SeaRailWithImage => ProcessConfig {
                process_type,
                weight_column: 13,
                box_column: 11,
                copy_images: true,
            },
            ProcessType::SeaRailNoImage => ProcessConfig {
                process_type,
                weight_column: 13,
                box_column: 11,
                copy_images: false,
            },
            ProcessType::AirFreight => ProcessConfig {
                process_type,
                weight_column: 15,
                box_column: 13,
                copy_images: true,
            },
        }
    }
}

/// 处理请求
#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessRequest {
    pub file_path: String,
    pub config: ProcessConfig,
}

/// 处理响应
#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessResponse {
    pub success: bool,
    pub output_path: String,
    pub message: String,
    pub logs: Vec<String>,
}

/// 合并单元格范围
#[derive(Debug, Clone)]
pub struct MergedRange {
    pub start_row: u32,
    pub start_col: u32,
    pub end_row: u32,
    pub end_col: u32,
}

impl MergedRange {
    pub fn contains(&self, row: u32, col: u32) -> bool {
        row >= self.start_row 
            && row <= self.end_row 
            && col >= self.start_col 
            && col <= self.end_col
    }
}
