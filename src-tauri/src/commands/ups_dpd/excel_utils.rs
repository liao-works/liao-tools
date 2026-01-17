use crate::commands::error::CommandError;
use crate::models::ups_dpd::{CellValue, ExcelDataFrame, ExcelRow};
use calamine::{open_workbook_auto, Reader};
use rust_xlsxwriter::Worksheet;
use std::collections::HashMap;
use std::path::Path;

/// 从 Excel 文件读取数据
pub fn read_excel_file(
    file_path: &Path,
    sheet_index: usize,
) -> Result<ExcelDataFrame, CommandError> {
    let mut workbook = open_workbook_auto(file_path)
        .map_err(|e| CommandError::new(format!("无法打开 Excel 文件: {}", e), "ERROR"))?;

    let sheet_names = workbook.sheet_names().to_vec();

    if sheet_index >= sheet_names.len() {
        return Err(CommandError::new(
            format!(
                "工作表索引 {} 超出范围（共 {} 个工作表）",
                sheet_index,
                sheet_names.len()
            ),
            "ERROR"
        ));
    }

    let sheet_name = &sheet_names[sheet_index];

    let range = workbook
        .worksheet_range(sheet_name)
        .map_err(|e| CommandError::new(format!("无法读取工作表: {}", e), "ERROR"))?;

    // 获取表头（第一行）
    let mut columns = Vec::new();
    if let Some(first_row) = range.rows().next() {
        for cell in first_row {
            columns.push(datatype_to_string(cell));
        }
    } else {
        return Err(CommandError::new("工作表为空", "ERROR"));
    }

    let mut dataframe = ExcelDataFrame::new(columns.clone());

    // 读取数据行（跳过表头）
    for row_data in range.rows().skip(1) {
        let mut row = ExcelRow::new();

        for (col_idx, cell) in row_data.iter().enumerate() {
            if col_idx < columns.len() {
                let column_name = &columns[col_idx];
                let value = datatype_to_cellvalue(cell);
                row.set(column_name.clone(), value);
            }
        }

        dataframe.add_row(row);
    }

    Ok(dataframe)
}

/// 将 DataType 转换为字符串
fn datatype_to_string(data: &calamine::Data) -> String {
    match data {
        calamine::Data::Empty => String::new(),
        calamine::Data::String(s) => s.clone(),
        calamine::Data::Float(f) => f.to_string(),
        calamine::Data::Int(i) => i.to_string(),
        calamine::Data::Bool(b) => b.to_string(),
        calamine::Data::DateTime(dt) => dt.to_string(),
        calamine::Data::Error(e) => format!("Error: {:?}", e),
        calamine::Data::DateTimeIso(dt) => dt.to_string(),
        calamine::Data::DurationIso(d) => d.to_string(),
    }
}

/// 将 DataType 转换为 CellValue
fn datatype_to_cellvalue(data: &calamine::Data) -> CellValue {
    match data {
        calamine::Data::Empty => CellValue::Empty,
        calamine::Data::String(s) => CellValue::String(s.clone()),
        calamine::Data::Float(f) => CellValue::Number(*f),
        calamine::Data::Int(i) => CellValue::Integer(*i),
        calamine::Data::Bool(b) => CellValue::Boolean(*b),
        calamine::Data::DateTime(dt) => CellValue::String(dt.to_string()),
        calamine::Data::Error(e) => CellValue::String(format!("Error: {:?}", e)),
        calamine::Data::DateTimeIso(dt) => CellValue::String(dt.to_string()),
        calamine::Data::DurationIso(d) => CellValue::String(d.to_string()),
    }
}

/// 获取工作簿的所有工作表名称
pub fn get_sheet_names(file_path: &Path) -> Result<Vec<String>, CommandError> {
    let workbook = open_workbook_auto(file_path)
        .map_err(|e| CommandError::new(format!("无法打开 Excel 文件: {}", e), "ERROR"))?;

    Ok(workbook.sheet_names().to_vec())
}

/// 查找工作表中的表头行并建立列映射
pub fn get_header_column_mapping(
    file_path: &Path,
    sheet_name: &str,
    header_row: usize,
) -> Result<HashMap<String, usize>, CommandError> {
    let mut workbook = open_workbook_auto(file_path)
        .map_err(|e| CommandError::new(format!("无法打开 Excel 文件: {}", e), "ERROR"))?;

    let range = workbook
        .worksheet_range(sheet_name)
        .map_err(|e| CommandError::new(format!("无法读取工作表: {}", e), "ERROR"))?;

    let mut mapping = HashMap::new();

    if let Some(row_data) = range.rows().nth(header_row) {
        for (col_idx, cell) in row_data.iter().enumerate() {
            let header = datatype_to_string(cell).trim().to_string();
            if !header.is_empty() {
                mapping.insert(header, col_idx);
            }
        }
    }

    Ok(mapping)
}

/// 查找工作表中第一个完全空白的行
pub fn find_first_empty_row(
    file_path: &Path,
    sheet_name: &str,
) -> Result<usize, CommandError> {
    let mut workbook = open_workbook_auto(file_path)
        .map_err(|e| CommandError::new(format!("无法打开 Excel 文件: {}", e), "ERROR"))?;

    let range = workbook
        .worksheet_range(sheet_name)
        .map_err(|e| CommandError::new(format!("无法读取工作表: {}", e), "ERROR"))?;

    for (row_idx, row_data) in range.rows().enumerate() {
        let is_empty = row_data.iter().all(|cell| matches!(cell, calamine::Data::Empty));
        if is_empty {
            return Ok(row_idx);
        }
    }

    // 如果没有找到空行，返回最后一行的下一行
    Ok(range.height())
}

/// 将 CellValue 写入工作表
pub fn write_cell_value(
    worksheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: &CellValue,
) -> Result<(), CommandError> {
    match value {
        CellValue::Empty => Ok(()),
        CellValue::String(s) => worksheet
            .write_string(row, col, s)
            .map_err(|e| CommandError::new(format!("写入字符串失败: {}", e), "ERROR"))
            .map(|_| ()),
        CellValue::Number(n) => worksheet
            .write_number(row, col, *n)
            .map_err(|e| CommandError::new(format!("写入数字失败: {}", e), "ERROR"))
            .map(|_| ()),
        CellValue::Integer(i) => worksheet
            .write_number(row, col, *i as f64)
            .map_err(|e| CommandError::new(format!("写入整数失败: {}", e), "ERROR"))
            .map(|_| ()),
        CellValue::Boolean(b) => worksheet
            .write_boolean(row, col, *b)
            .map_err(|e| CommandError::new(format!("写入布尔值失败: {}", e), "ERROR"))
            .map(|_| ()),
    }
}

/// 按指定列分组统计
pub fn group_by_column(
    dataframe: &ExcelDataFrame,
    group_column: &str,
    sum_columns: &[&str],
) -> Result<HashMap<String, HashMap<String, f64>>, CommandError> {
    let mut groups: HashMap<String, HashMap<String, f64>> = HashMap::new();

    for row in &dataframe.rows {
        // 获取分组键
        let group_key = row
            .get(group_column)
            .ok_or_else(|| {
                CommandError::new(format!("找不到分组列: {}", group_column), "ERROR")
            })?
            .to_string()
            .trim()
            .to_uppercase();

        if group_key.is_empty() || group_key == "NAN" || group_key == "NONE" {
            continue;
        }

        // 获取或创建该分组的统计数据
        let stats = groups.entry(group_key).or_insert_with(HashMap::new);

        // 累加各个列的值
        for &col in sum_columns {
            if let Some(cell_value) = row.get(col) {
                if let Some(num) = cell_value.to_f64() {
                    *stats.entry(col.to_string()).or_insert(0.0) += num;
                }
            }
        }
    }

    Ok(groups)
}

/// 筛选数据帧
pub fn filter_dataframe(
    dataframe: &ExcelDataFrame,
    filter_column: &str,
    filter_value: &str,
) -> Result<ExcelDataFrame, CommandError> {
    let mut filtered = ExcelDataFrame::new(dataframe.columns.clone());

    let filter_value_upper = filter_value.trim().to_uppercase();

    for row in &dataframe.rows {
        if let Some(cell_value) = row.get(filter_column) {
            let cell_str = cell_value.to_string().trim().to_uppercase();
            if cell_str == filter_value_upper {
                filtered.add_row(row.clone());
            }
        }
    }

    Ok(filtered)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_datatype_conversion() {
        let dt = DataType::String("test".to_string());
        assert_eq!(datatype_to_string(&dt), "test");

        let cv = datatype_to_cellvalue(&dt);
        assert_eq!(cv.to_string(), "test");
    }

    #[test]
    fn test_empty_dataframe() {
        let df = ExcelDataFrame::new(vec!["col1".to_string(), "col2".to_string()]);
        assert_eq!(df.len(), 0);
        assert!(df.is_empty());
    }
}
