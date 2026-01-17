use calamine::{open_workbook, Data, Range, Reader, Xlsx};
use std::path::Path;
use crate::commands::error::CommandError;
use crate::models::excel::MergedRange;

/// Excel 工作簿包装
pub struct ExcelWorkbook {
    workbook: Xlsx<std::io::BufReader<std::fs::File>>,
}

impl ExcelWorkbook {
    /// 打开 Excel 文件
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, CommandError> {
        let workbook: Xlsx<_> = open_workbook(path)
            .map_err(|e| CommandError::new(format!("打开 Excel 文件失败: {}", e), "FILE_ERROR"))?;
        
        Ok(ExcelWorkbook { workbook })
    }

    /// 获取第一个工作表
    pub fn get_first_sheet(&mut self) -> Result<ExcelSheet, CommandError> {
        let sheet_name = self.workbook
            .sheet_names()
            .first()
            .ok_or_else(|| CommandError::new("Excel 文件中没有工作表", "FILE_ERROR"))?
            .clone();
        
        self.get_sheet(&sheet_name)
    }

    /// 根据名称获取工作表
    pub fn get_sheet(&mut self, name: &str) -> Result<ExcelSheet, CommandError> {
        let range = self.workbook
            .worksheet_range(name)
            .map_err(|e| CommandError::new(format!("读取工作表失败: {}", e), "FILE_ERROR"))?;
        
        Ok(ExcelSheet { range })
    }
}

/// Excel 工作表包装
pub struct ExcelSheet {
    range: Range<Data>,
}

impl ExcelSheet {
    /// 获取单元格值
    pub fn get_cell(&self, row: u32, col: u32) -> Option<&Data> {
        self.range.get((row as usize, col as usize))
    }

    /// 获取单元格字符串值
    pub fn get_string(&self, row: u32, col: u32) -> Option<String> {
        self.get_cell(row, col).and_then(|cell| {
            match cell {
                Data::String(s) => Some(s.clone()),
                Data::Float(f) => Some(f.to_string()),
                Data::Int(i) => Some(i.to_string()),
                Data::Bool(b) => Some(b.to_string()),
                Data::Empty => None,
                _ => None,
            }
        })
    }

    /// 获取单元格浮点值
    pub fn get_float(&self, row: u32, col: u32) -> Option<f64> {
        self.get_cell(row, col).and_then(|cell| {
            match cell {
                Data::Float(f) => Some(*f),
                Data::Int(i) => Some(*i as f64),
                Data::String(s) => s.parse::<f64>().ok(),
                _ => None,
            }
        })
    }

    /// 获取行数
    pub fn row_count(&self) -> u32 {
        self.range.height() as u32
    }

    /// 获取列数
    pub fn col_count(&self) -> u32 {
        self.range.width() as u32
    }

    /// 获取合并单元格区域（注意：calamine 不直接支持，这里返回空列表）
    pub fn get_merged_ranges(&self) -> Vec<MergedRange> {
        // calamine 库不直接支持读取合并单元格信息
        // 需要通过其他方式（如解析 XML）来获取
        // 暂时返回空列表，后续实现
        vec![]
    }

    /// 检查单元格是否为空
    pub fn is_empty(&self, row: u32, col: u32) -> bool {
        match self.get_cell(row, col) {
            Some(Data::Empty) | None => true,
            _ => false,
        }
    }

    /// 获取指定行的所有单元格
    pub fn get_row(&self, row: u32) -> Vec<Option<String>> {
        (0..self.col_count())
            .map(|col| self.get_string(row, col))
            .collect()
    }
}
