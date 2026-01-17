use crate::commands::error::CommandError;
use crate::models::excel::{MergedRange, ProcessConfig, ProcessResponse};
use super::merge_parser::{self, CellStyle, SheetMetadata, EmbeddedImage};
use super::reader::{ExcelWorkbook, ExcelSheet};
use super::writer::{ExcelWriter, CellValue, StyledCellValue, create_format_with_style, create_weight_format, write_cell, set_row_height, set_column_width, embed_image_to_cell};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// 处理 Excel 文件的主函数
pub fn process_excel_file(
    file_path: &str,
    config: &ProcessConfig,
) -> Result<ProcessResponse, CommandError> {
    let mut logs = Vec::new();
    logs.push(format!("开始处理文件: {}", file_path));
    logs.push(format!("处理类型: {:?}", config.process_type));

    // 1. 打开源文件
    let mut workbook = ExcelWorkbook::open(file_path)?;
    logs.push("成功打开 Excel 文件".to_string());

    // 2. 读取第一个工作表
    let sheet = workbook.get_first_sheet()?;
    logs.push(format!("读取工作表，共 {} 行 {} 列", sheet.row_count(), sheet.col_count()));

    // 2.5. 读取工作表元数据（合并单元格、列宽等）
    let metadata = merge_parser::parse_sheet_metadata(file_path)?;
    logs.push(format!("检测到 {} 个合并单元格区域", metadata.merged_ranges.len()));
    if metadata.cell_images.len() > 0 {
        logs.push(format!("检测到 {} 个图片", metadata.cell_images.len()));
    }
    if !metadata.converted_images.is_empty() {
        logs.push(format!("✓ 自动转换了 {} 个图片格式: {}",
            metadata.converted_images.len(),
            metadata.converted_images.join(", ")));
    }
    if !metadata.unsupported_images.is_empty() {
        logs.push(format!("⚠️ 跳过 {} 个无法处理的图片: {}",
            metadata.unsupported_images.len(),
            metadata.unsupported_images.join(", ")));
    }

    // 3. 处理数据
    let processed_data = process_sheet(&sheet, &metadata, config, &mut logs)?;

    // 4. 生成输出文件路径
    let output_path = generate_output_path(file_path)?;
    logs.push(format!("输出文件路径: {}", output_path.display()));

    // 5. 写入新文件（包含列宽信息）
    write_processed_data(&output_path, &processed_data, &metadata, config, &mut logs)?;
    logs.push("成功写入处理后的文件".to_string());

    Ok(ProcessResponse {
        success: true,
        output_path: output_path.to_string_lossy().to_string(),
        message: "处理完成".to_string(),
        logs,
    })
}

/// 处理工作表数据
fn process_sheet(
    sheet: &ExcelSheet,
    metadata: &SheetMetadata,
    config: &ProcessConfig,
    logs: &mut Vec<String>,
) -> Result<Vec<Vec<StyledCellValue>>, CommandError> {
    let mut result = Vec::new();
    let row_count = sheet.row_count();
    let col_count = sheet.col_count();
    let merged_ranges = &metadata.merged_ranges;

    // 预计算所有重量列合并区域的分配值
    let weight_col = config.weight_column as u32 - 1;
    let weight_distributions = precompute_weight_distributions(sheet, merged_ranges, weight_col, logs);

    for row_idx in 0..row_count {
        // 检查第一列是否为空，如果为空则跳过
        if sheet.is_empty(row_idx, 0) {
            logs.push(format!("第 {} 行第一列为空，停止处理", row_idx + 1));
            break;
        }

        let mut row_data = Vec::new();

        for col_idx in 0..col_count {
            // 获取原始单元格样式
            let style = metadata.cell_styles.get(&(row_idx, col_idx)).cloned();

            // 检查是否有图片
            let image = metadata.cell_images.get(&(row_idx, col_idx)).cloned();

            // 检查是否有公式
            let formula = metadata.cell_formulas.get(&(row_idx, col_idx)).cloned();

            // 检查当前单元格是否在合并区域内
            if let Some(merged_range) = find_merged_range(row_idx, col_idx, merged_ranges) {
                // 处理合并单元格
                let styled_value = process_merged_cell(
                    sheet,
                    row_idx,
                    col_idx,
                    merged_range,
                    config,
                    &weight_distributions,
                    style,
                    formula,
                    image.clone(),
                    metadata,
                    logs,
                )?;
                row_data.push(styled_value);
            } else {
                // 普通单元格
                if let Some(img) = image {
                    row_data.push(StyledCellValue::with_image(CellValue::Empty, style, img));
                } else if let Some(f) = formula {
                    // 如果是 DISPIMG 公式但没有找到图片，跳过公式
                    if f.contains("DISPIMG") {
                        row_data.push(StyledCellValue::new(CellValue::Empty, style));
                    } else {
                        row_data.push(StyledCellValue::new(CellValue::Formula(f), style));
                    }
                } else {
                    // 否则使用值
                    let value = sheet.get_string(row_idx, col_idx);
                    row_data.push(StyledCellValue::new(CellValue::from_string(value), style));
                }
            }
        }

        result.push(row_data);
    }

    logs.push(format!("处理完成，共 {} 行数据", result.len()));
    Ok(result)
}

/// 预计算所有重量列合并区域的分配值
/// 返回 HashMap: (row, col) -> 分配的重量值
fn precompute_weight_distributions(
    sheet: &ExcelSheet,
    merged_ranges: &[MergedRange],
    weight_col: u32,
    _logs: &mut Vec<String>,
) -> HashMap<(u32, u32), f64> {
    let mut distributions = HashMap::new();

    // 找出所有包含重量列的合并区域
    for merged_range in merged_ranges {
        if merged_range.start_col <= weight_col && weight_col <= merged_range.end_col {
            // 获取合并单元格的总重量
            let total_weight = sheet
                .get_float(merged_range.start_row, merged_range.start_col)
                .unwrap_or(0.0);

            // 计算数量列（重量列的前一列）
            let quantity_col = weight_col - 1;

            // 统计所有行的总数量
            let mut total_quantity = 0.0;
            for r in merged_range.start_row..=merged_range.end_row {
                let qty = sheet.get_float(r, quantity_col).unwrap_or(0.0);
                total_quantity += qty;
            }

            if total_quantity == 0.0 {
                // 所有行都设为0
                for r in merged_range.start_row..=merged_range.end_row {
                    distributions.insert((r, weight_col), 0.0);
                }
                continue;
            }

            // 计算单位重量
            let unit_weight = total_weight / total_quantity;

            // 为每一行计算分配的重量
            for r in merged_range.start_row..=merged_range.end_row {
                let current_quantity = sheet.get_float(r, quantity_col).unwrap_or(0.0);
                let row_weight = (unit_weight * current_quantity * 100.0).round() / 100.0;
                distributions.insert((r, weight_col), row_weight);
            }
        }
    }

    distributions
}

/// 查找单元格所在的合并区域
fn find_merged_range(row: u32, col: u32, merged_ranges: &[MergedRange]) -> Option<&MergedRange> {
    merged_ranges.iter().find(|range| range.contains(row, col))
}

/// 处理合并单元格
fn process_merged_cell(
    sheet: &ExcelSheet,
    row_idx: u32,
    col_idx: u32,
    merged_range: &MergedRange,
    config: &ProcessConfig,
    weight_distributions: &HashMap<(u32, u32), f64>,
    current_style: Option<CellStyle>,
    current_formula: Option<String>,
    current_image: Option<EmbeddedImage>,
    metadata: &SheetMetadata,
    _logs: &mut Vec<String>,
) -> Result<StyledCellValue, CommandError> {
    let weight_col = config.weight_column as u32 - 1; // 转换为从0开始的索引
    let box_col = config.box_column as u32 - 1;

    // 获取合并区域起始单元格的样式（作为默认样式）
    let merge_start_style = metadata.cell_styles
        .get(&(merged_range.start_row, merged_range.start_col))
        .cloned()
        .or(current_style.clone());

    // 重量列：使用预计算的分配值，并强制使用0.00格式
    if col_idx == weight_col {
        if let Some(&weight) = weight_distributions.get(&(row_idx, col_idx)) {
            return Ok(StyledCellValue::weight(weight, merge_start_style));
        }
        // 如果没有预计算值，使用原值
        let value = sheet.get_float(row_idx, col_idx).unwrap_or(0.0);
        return Ok(StyledCellValue::weight(value, merge_start_style));
    }

    // 箱子列：第一行保留原值，其他行为0
    if col_idx == box_col {
        let style = metadata.cell_styles.get(&(merged_range.start_row, col_idx)).cloned();
        if row_idx == merged_range.start_row {
            // 从合并单元格的原始位置读取箱子数量
            let value = sheet.get_float(merged_range.start_row, col_idx);
            return Ok(StyledCellValue::new(CellValue::from_string(value.map(|v| v.to_string())), style));
        } else {
            // 其他行为0
            return Ok(StyledCellValue::new(CellValue::Integer(0), style));
        }
    }

    // 检查是否有图片
    if let Some(img) = current_image {
        return Ok(StyledCellValue::with_image(CellValue::Empty, current_style, img));
    }

    // 检查合并区域起始单元格是否有图片
    if let Some(start_img) = metadata.cell_images.get(&(merged_range.start_row, merged_range.start_col)) {
        return Ok(StyledCellValue::with_image(CellValue::Empty, merge_start_style, start_img.clone()));
    }

    // 其他列：检查公式（但跳过 DISPIMG）
    if let Some(formula) = current_formula {
        if !formula.contains("DISPIMG") {
            return Ok(StyledCellValue::new(CellValue::Formula(formula), current_style));
        }
    }

    // 检查合并区域起始单元格是否有公式
    if let Some(start_formula) = metadata.cell_formulas.get(&(merged_range.start_row, merged_range.start_col)) {
        if !start_formula.contains("DISPIMG") {
            return Ok(StyledCellValue::new(CellValue::Formula(start_formula.clone()), merge_start_style));
        }
    }

    // 使用合并单元格的值
    let value = sheet.get_string(merged_range.start_row, merged_range.start_col);
    Ok(StyledCellValue::new(CellValue::from_string(value), merge_start_style))
}

/// 写入处理后的数据
fn write_processed_data(
    output_path: &Path,
    data: &[Vec<StyledCellValue>],
    metadata: &merge_parser::SheetMetadata,
    _config: &ProcessConfig,
    logs: &mut Vec<String>,
) -> Result<(), CommandError> {
    let mut writer = ExcelWriter::new()?;
    let worksheet = writer.add_worksheet("Sheet1")?;

    // 统计数据中有多少个单元格包含图片
    let image_count: usize = data.iter()
        .flat_map(|row| row.iter())
        .filter(|cell| cell.image.is_some())
        .count();

    if image_count > 0 {
        logs.push(format!("发现 {} 个图片待嵌入", image_count));
    }

    // 设置列宽
    let col_count = data.first().map(|r| r.len()).unwrap_or(0);
    for col in 0..col_count {
        let width = metadata.column_widths
            .get(&(col as u32))
            .copied()
            .unwrap_or(metadata.default_column_width);
        set_column_width(worksheet, col as u16, width)?;
    }

    for (row_idx, row_data) in data.iter().enumerate() {
        // 设置行高为 20
        set_row_height(worksheet, row_idx as u32, 20.0)?;

        for (col_idx, styled_value) in row_data.iter().enumerate() {
            // 如果有图片，嵌入图片
            if let Some(ref image) = styled_value.image {
                // 验证图片数据
                if image.data.is_empty() || image.data.len() < 8 {
                    continue;
                }

                // 使用 catch_unwind 防止 panic
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    embed_image_to_cell(worksheet, row_idx as u32, col_idx as u16, image)
                }));

                if let Ok(Err(e)) = result {
                    logs.push(format!("嵌入图片失败 ({}, {}): {}", row_idx + 1, col_idx + 1, e.message));
                }
                continue;
            }

            // 根据是否是重量单元格选择格式
            let format = if styled_value.is_weight_cell {
                create_weight_format(styled_value.style.as_ref())
            } else {
                create_format_with_style(styled_value.style.as_ref())
            };

            write_cell(
                worksheet,
                row_idx as u32,
                col_idx as u16,
                &styled_value.value,
                &format,
            )?;
        }
    }

    logs.push("保存文件...".to_string());
    writer.save(output_path)?;

    Ok(())
}

/// 生成输出文件路径
fn generate_output_path(input_path: &str) -> Result<PathBuf, CommandError> {
    let path = Path::new(input_path);

    let parent = path.parent()
        .ok_or_else(|| CommandError::new("无法获取文件目录", "FILE_ERROR"))?;

    let stem = path.file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| CommandError::new("无法获取文件名", "FILE_ERROR"))?;

    let extension = path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("xlsx");

    let output_name = format!("{}_拆分表.{}", stem, extension);
    Ok(parent.join(output_name))
}
