use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 模板类型枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TemplateType {
    Ups,
    Dpd,
}

impl TemplateType {
    pub fn from_string(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "ups" => Some(TemplateType::Ups),
            "dpd" => Some(TemplateType::Dpd),
            _ => None,
        }
    }

    pub fn to_string(&self) -> String {
        match self {
            TemplateType::Ups => "ups".to_string(),
            TemplateType::Dpd => "dpd".to_string(),
        }
    }
}

/// 处理请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessRequest {
    pub main_file_path: String,
    pub detail_file_path: Option<String>,
    pub template_type: TemplateType,
}

/// 处理响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessResponse {
    pub success: bool,
    pub output_path: String,
    pub message: String,
    pub logs: Vec<String>,
}

/// 模板配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateConfig {
    pub template_type: TemplateType,
    pub template_path: Option<String>,
    pub use_default: bool,
}

impl TemplateConfig {
    pub fn default_for_type(template_type: TemplateType) -> Self {
        TemplateConfig {
            template_type,
            template_path: None,
            use_default: true,
        }
    }
}

/// 字段映射配置
#[derive(Debug, Clone)]
pub struct FieldMapping {
    pub data_field: String,
    pub template_field: String,
}

impl FieldMapping {
    pub fn new(data_field: &str, template_field: &str) -> Self {
        FieldMapping {
            data_field: data_field.to_string(),
            template_field: template_field.to_string(),
        }
    }
}

/// 工作表配置
#[derive(Debug, Clone)]
pub struct SheetConfig {
    pub sheet_name: String,
    pub mappings: Vec<FieldMapping>,
}

impl SheetConfig {
    pub fn new(sheet_name: &str, mappings: Vec<FieldMapping>) -> Self {
        SheetConfig {
            sheet_name: sheet_name.to_string(),
            mappings,
        }
    }
}

/// Excel 数据行（类似 pandas DataFrame 的一行）
#[derive(Debug, Clone)]
pub struct ExcelRow {
    pub data: HashMap<String, CellValue>,
}

impl ExcelRow {
    pub fn new() -> Self {
        ExcelRow {
            data: HashMap::new(),
        }
    }

    pub fn get(&self, key: &str) -> Option<&CellValue> {
        self.data.get(key)
    }

    pub fn set(&mut self, key: String, value: CellValue) {
        self.data.insert(key, value);
    }
}

/// Excel 单元格值
#[derive(Debug, Clone)]
pub enum CellValue {
    Empty,
    String(String),
    Number(f64),
    Integer(i64),
    Boolean(bool),
}

impl CellValue {
    pub fn to_string(&self) -> String {
        match self {
            CellValue::Empty => String::new(),
            CellValue::String(s) => s.clone(),
            CellValue::Number(n) => n.to_string(),
            CellValue::Integer(i) => i.to_string(),
            CellValue::Boolean(b) => b.to_string(),
        }
    }

    pub fn to_f64(&self) -> Option<f64> {
        match self {
            CellValue::Number(n) => Some(*n),
            CellValue::Integer(i) => Some(*i as f64),
            CellValue::String(s) => s.parse().ok(),
            _ => None,
        }
    }

    pub fn to_i64(&self) -> Option<i64> {
        match self {
            CellValue::Integer(i) => Some(*i),
            CellValue::Number(n) => Some(*n as i64),
            CellValue::String(s) => s.parse().ok(),
            _ => None,
        }
    }

    pub fn is_empty(&self) -> bool {
        matches!(self, CellValue::Empty)
    }
}

/// Excel 数据表（类似 pandas DataFrame）
#[derive(Debug, Clone)]
pub struct ExcelDataFrame {
    pub columns: Vec<String>,
    pub rows: Vec<ExcelRow>,
}

impl ExcelDataFrame {
    pub fn new(columns: Vec<String>) -> Self {
        ExcelDataFrame {
            columns,
            rows: Vec::new(),
        }
    }

    pub fn add_row(&mut self, row: ExcelRow) {
        self.rows.push(row);
    }

    pub fn len(&self) -> usize {
        self.rows.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    pub fn get_column_values(&self, column: &str) -> Vec<CellValue> {
        self.rows
            .iter()
            .filter_map(|row| row.get(column).cloned())
            .collect()
    }
}

/// 国家统计数据
#[derive(Debug, Clone)]
pub struct CountryStats {
    pub country_code: String,
    pub package_count: i64,
    pub gross_weight: f64,
    pub volume_weight: f64,
}

impl CountryStats {
    pub fn new(country_code: String) -> Self {
        CountryStats {
            country_code,
            package_count: 0,
            gross_weight: 0.0,
            volume_weight: 0.0,
        }
    }

    pub fn add(&mut self, packages: i64, gross: f64, volume: f64) {
        self.package_count += packages;
        self.gross_weight += gross;
        self.volume_weight += volume;
    }
}

/// 邮编统计数据
#[derive(Debug, Clone)]
pub struct ZipcodeStats {
    pub zipcode: String,
    pub package_count: i64,
    pub gross_weight: f64,
    pub volume_weight: f64,
}

impl ZipcodeStats {
    pub fn new(zipcode: String) -> Self {
        ZipcodeStats {
            zipcode,
            package_count: 0,
            gross_weight: 0.0,
            volume_weight: 0.0,
        }
    }

    pub fn add(&mut self, packages: i64, gross: f64, volume: f64) {
        self.package_count += packages;
        self.gross_weight += gross;
        self.volume_weight += volume;
    }
}
