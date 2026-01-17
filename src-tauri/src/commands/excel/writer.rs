use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Image, Workbook, Worksheet};
use std::path::Path;
use crate::commands::error::CommandError;
use super::merge_parser::{CellStyle, EmbeddedImage};

/// Excel 写入器
pub struct ExcelWriter {
    workbook: Workbook,
}

impl ExcelWriter {
    /// 创建新的写入器
    pub fn new() -> Result<Self, CommandError> {
        let workbook = Workbook::new();
        Ok(ExcelWriter { workbook })
    }

    /// 添加工作表
    pub fn add_worksheet(&mut self, name: &str) -> Result<&mut Worksheet, CommandError> {
        self.workbook.add_worksheet()
            .set_name(name)
            .map_err(|e| CommandError::new(format!("添加工作表失败: {}", e), "WRITE_ERROR"))
    }

    /// 保存到文件
    pub fn save<P: AsRef<Path>>(mut self, path: P) -> Result<(), CommandError> {
        self.workbook
            .save(path)
            .map_err(|e| CommandError::new(format!("保存 Excel 文件失败: {}", e), "WRITE_ERROR"))
    }

    /// 获取工作簿的可变引用
    pub fn workbook_mut(&mut self) -> &mut Workbook {
        &mut self.workbook
    }
}

/// 创建默认单元格格式（模拟Python版本的样式）
pub fn create_default_format() -> Format {
    Format::new()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin)
}

/// 根据原始样式创建格式
pub fn create_format_with_style(style: Option<&CellStyle>) -> Format {
    let mut format = Format::new()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);

    if let Some(cell_style) = style {
        // 应用数字格式
        if let Some(ref num_fmt) = cell_style.number_format {
            // 只有非 General 格式才设置
            if num_fmt != "General" {
                format = format.set_num_format(num_fmt);
            }
        }

        // 应用背景颜色
        if let Some(ref bg_color) = cell_style.background_color {
            if let Some(color) = parse_color(bg_color) {
                format = format.set_background_color(color);
            }
        }
    }

    format
}

/// 创建用于重量拆分的数字格式（保留两位小数）
pub fn create_weight_format(style: Option<&CellStyle>) -> Format {
    let mut format = Format::new()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin)
        .set_num_format("0.00");

    // 保留背景颜色
    if let Some(cell_style) = style {
        if let Some(ref bg_color) = cell_style.background_color {
            if let Some(color) = parse_color(bg_color) {
                format = format.set_background_color(color);
            }
        }
    }

    format
}

/// 解析十六进制颜色字符串为 Color
fn parse_color(hex: &str) -> Option<Color> {
    if hex.len() < 6 {
        return None;
    }

    let hex = hex.trim_start_matches('#');
    let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()?;

    Some(Color::RGB(
        ((r as u32) << 16) | ((g as u32) << 8) | (b as u32)
    ))
}

/// 创建居中对齐格式
pub fn create_center_format() -> Format {
    Format::new()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
}

/// 写入单元格数据的辅助结构
#[derive(Debug, Clone)]
pub struct CellData {
    pub row: u32,
    pub col: u32,
    pub value: CellValue,
}

#[derive(Debug, Clone)]
pub enum CellValue {
    String(String),
    Number(f64),
    Integer(i64),
    Formula(String),  // 公式类型
    Empty,
}

/// 带样式的单元格值
#[derive(Debug, Clone)]
pub struct StyledCellValue {
    pub value: CellValue,
    pub style: Option<CellStyle>,
    pub is_weight_cell: bool,  // 是否是重量拆分的单元格（需要强制使用0.00格式）
    pub image: Option<EmbeddedImage>,  // 嵌入的图片
}

impl StyledCellValue {
    pub fn new(value: CellValue, style: Option<CellStyle>) -> Self {
        Self { value, style, is_weight_cell: false, image: None }
    }

    pub fn weight(value: f64, style: Option<CellStyle>) -> Self {
        Self {
            value: CellValue::Number(value),
            style,
            is_weight_cell: true,
            image: None,
        }
    }

    pub fn with_image(value: CellValue, style: Option<CellStyle>, image: EmbeddedImage) -> Self {
        Self {
            value,
            style,
            is_weight_cell: false,
            image: Some(image),
        }
    }
}

impl CellValue {
    pub fn from_string(s: Option<String>) -> Self {
        match s {
            Some(val) if !val.is_empty() => {
                // 尝试解析为数字
                if let Ok(num) = val.parse::<f64>() {
                    CellValue::Number(num)
                } else if let Ok(int) = val.parse::<i64>() {
                    CellValue::Integer(int)
                } else {
                    CellValue::String(val)
                }
            }
            _ => CellValue::Empty,
        }
    }
}

/// 写入单元格数据到工作表
pub fn write_cell(
    worksheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: &CellValue,
    format: &Format,
) -> Result<(), CommandError> {
    let result = match value {
        CellValue::String(s) => {
            worksheet.write_string_with_format(row, col, s, format)
        }
        CellValue::Number(n) => {
            worksheet.write_number_with_format(row, col, *n, format)
        }
        CellValue::Integer(i) => {
            worksheet.write_number_with_format(row, col, *i as f64, format)
        }
        CellValue::Formula(f) => {
            // 写入公式（去掉开头的 = 号，rust_xlsxwriter 会自动添加）
            let formula = f.strip_prefix('=').unwrap_or(f);
            worksheet.write_formula_with_format(row, col, formula, format)
        }
        CellValue::Empty => {
            // Empty 单元格也写入空字符串以保持格式
            worksheet.write_string_with_format(row, col, "", format)
        }
    };

    result.map(|_| ())
        .map_err(|e| CommandError::new(format!("写入单元格失败: {}", e), "WRITE_ERROR"))
}

/// 设置列宽
pub fn set_column_width(
    worksheet: &mut Worksheet,
    col: u16,
    width: f64,
) -> Result<(), CommandError> {
    worksheet
        .set_column_width(col, width)
        .map(|_| ())
        .map_err(|e| CommandError::new(format!("设置列宽失败: {}", e), "WRITE_ERROR"))
}

/// 设置行高
pub fn set_row_height(
    worksheet: &mut Worksheet,
    row: u32,
    height: f64,
) -> Result<(), CommandError> {
    worksheet
        .set_row_height(row, height)
        .map(|_| ())
        .map_err(|e| CommandError::new(format!("设置行高失败: {}", e), "WRITE_ERROR"))
}

/// 合并单元格
pub fn merge_range(
    worksheet: &mut Worksheet,
    first_row: u32,
    first_col: u16,
    last_row: u32,
    last_col: u16,
) -> Result<(), CommandError> {
    worksheet
        .merge_range(first_row, first_col, last_row, last_col, "", &Format::new())
        .map(|_| ())
        .map_err(|e| CommandError::new(format!("合并单元格失败: {}", e), "WRITE_ERROR"))
}

/// 嵌入图片到单元格（使用 insert_image_with_offset 实现居中）
pub fn embed_image_to_cell(
    worksheet: &mut Worksheet,
    row: u32,
    col: u16,
    image_data: &EmbeddedImage,
) -> Result<(), CommandError> {
    // 检查图片数据是否有效
    if image_data.data.is_empty() {
        return Err(CommandError::new("图片数据为空", "IMAGE_ERROR"));
    }

    // 检查图片数据最小长度（至少需要几个字节来识别格式）
    if image_data.data.len() < 8 {
        return Err(CommandError::new("图片数据太短，无法识别格式", "IMAGE_ERROR"));
    }

    // 从图片数据创建 Image 对象
    let mut image = Image::new_from_buffer(&image_data.data)
        .map_err(|e| CommandError::new(format!("创建图片对象失败: {}", e), "IMAGE_ERROR"))?;

    // 设置图片大小适应单元格
    // 目标尺寸适合默认行高约 20 点的单元格
    let target_size = 18.0; // 像素，略小于行高以便居中

    image = image
        .set_scale_to_size(target_size, target_size, true)
        .set_object_movement(rust_xlsxwriter::ObjectMovement::MoveAndSizeWithCells);

    // 计算居中偏移（假设列宽约 60 像素，行高约 26 像素）
    // 水平偏移 = (列宽 - 图片宽) / 2 ≈ (60 - 18) / 2 = 21
    // 垂直偏移 = (行高 - 图片高) / 2 ≈ (26 - 18) / 2 = 4
    let x_offset: u32 = 21;
    let y_offset: u32 = 4;

    // 使用 insert_image_with_offset 插入图片（带偏移，实现居中）
    worksheet
        .insert_image_with_offset(row, col, &image, x_offset, y_offset)
        .map_err(|e| CommandError::new(format!("插入图片失败: {}", e), "IMAGE_ERROR"))?;

    Ok(())
}

/// 嵌入图片到单元格（带自定义尺寸和单元格尺寸用于居中）
pub fn embed_image_to_cell_with_size(
    worksheet: &mut Worksheet,
    row: u32,
    col: u16,
    image_data: &EmbeddedImage,
    img_size: f64,
    cell_width: f64,
    cell_height: f64,
) -> Result<(), CommandError> {
    if image_data.data.is_empty() {
        return Err(CommandError::new("图片数据为空", "IMAGE_ERROR"));
    }

    if image_data.data.len() < 8 {
        return Err(CommandError::new("图片数据太短，无法识别格式", "IMAGE_ERROR"));
    }

    let mut image = Image::new_from_buffer(&image_data.data)
        .map_err(|e| CommandError::new(format!("创建图片对象失败: {}", e), "IMAGE_ERROR"))?;

    image = image
        .set_scale_to_size(img_size, img_size, true)
        .set_object_movement(rust_xlsxwriter::ObjectMovement::MoveAndSizeWithCells);

    // 计算居中偏移
    let x_offset = ((cell_width - img_size) / 2.0).max(0.0) as u32;
    let y_offset = ((cell_height - img_size) / 2.0).max(0.0) as u32;

    worksheet
        .insert_image_with_offset(row, col, &image, x_offset, y_offset)
        .map_err(|e| CommandError::new(format!("插入图片失败: {}", e), "IMAGE_ERROR"))?;

    Ok(())
}
