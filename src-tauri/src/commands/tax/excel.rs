use crate::commands::tax::database::TaxDatabase;
use crate::commands::tax::query::TaxQuery;
use crate::models::tax::BatchResult;
use anyhow::{Context, Result};
use calamine::{open_workbook, DataType, Reader, Xlsx};
use rust_xlsxwriter::{Format, Workbook};

/// Excel批量处理器
pub struct TaxExcelProcessor;

impl TaxExcelProcessor {
    /// 处理Excel文件批量查询
    pub fn process_batch<F>(
        db: &TaxDatabase,
        input_path: &str,
        output_path: &str,
        mut progress_callback: F,
    ) -> Result<BatchResult>
    where
        F: FnMut(usize, usize),
    {
        // 读取输入文件
        let mut workbook: Xlsx<_> = open_workbook(input_path)
            .context("Failed to open input Excel file")?;
        
        let sheet_name = workbook
            .sheet_names()
            .first()
            .context("No sheets found in workbook")?
            .clone();
        
        let range = workbook
            .worksheet_range(&sheet_name)
            .context("Failed to read sheet")?;
        
        // 收集所有编码（跳过标题行）
        let mut codes = Vec::new();
        for row in range.rows().skip(1) {
            if let Some(cell) = row.first() {
                if let Some(code) = cell.as_string() {
                    codes.push(code.trim().to_string());
                }
            }
        }
        
        let total = codes.len();
        let mut success = 0;
        let mut errors = Vec::new();
        let mut results: Vec<(String, Option<crate::models::tax::TaxTariff>)> = Vec::new();
        
        // 查询每个编码
        for (index, code) in codes.iter().enumerate() {
            progress_callback(index + 1, total);
            
            match TaxQuery::exact_search(db, code) {
                Ok(Some(tariff)) => {
                    results.push((code.to_string(), Some(tariff)));
                    success += 1;
                }
                Ok(None) => {
                    results.push((code.to_string(), None));
                    errors.push(format!("第{}行：编码 {} 未找到", index + 2, code));
                }
                Err(e) => {
                    results.push((code.to_string(), None));
                    errors.push(format!("第{}行：查询失败 - {}", index + 2, e));
                }
            }
        }
        
        // 写入输出文件
        Self::write_results(output_path, &results)?;
        
        Ok(BatchResult {
            total,
            success,
            errors,
            output_path: output_path.to_string(),
        })
    }
    
    /// 写入查询结果到Excel
    fn write_results(
        output_path: &str,
        results: &[(String, Option<crate::models::tax::TaxTariff>)],
    ) -> Result<()> {
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();
        
        // 设置表头格式
        let header_format = Format::new()
            .set_bold()
            .set_background_color(rust_xlsxwriter::Color::RGB(0xD3D3D3));
        
        // 写入表头
        let headers = vec![
            "商品编码",
            "商品描述",
            "英国税率",
            "英国URL",
            "北爱尔兰税率",
            "北爱尔兰URL",
            "查询状态",
        ];
        
        for (col, header) in headers.iter().enumerate() {
            worksheet.write_with_format(0, col as u16, *header, &header_format)?;
        }
        
        // 写入数据
        for (row, (code, tariff_opt)) in results.iter().enumerate() {
            let row_num = (row + 1) as u32;
            
            worksheet.write(row_num, 0, code)?;
            
            if let Some(tariff) = tariff_opt {
                worksheet.write(row_num, 1, tariff.description.as_deref().unwrap_or(""))?;
                worksheet.write(row_num, 2, &tariff.rate)?;
                worksheet.write(row_num, 3, &tariff.url)?;
                worksheet.write(
                    row_num,
                    4,
                    tariff.north_ireland_rate.as_deref().unwrap_or(""),
                )?;
                worksheet.write(
                    row_num,
                    5,
                    tariff.north_ireland_url.as_deref().unwrap_or(""),
                )?;
                worksheet.write(row_num, 6, "成功")?;
            } else {
                worksheet.write(row_num, 6, "未找到")?;
            }
        }
        
        // 自动调整列宽
        for col in 0..7 {
            worksheet.set_column_width(col, 20)?;
        }
        
        workbook
            .save(output_path)
            .context("Failed to save output Excel file")?;
        
        Ok(())
    }
    
    /// 生成Excel模板
    pub fn generate_template(output_path: &str) -> Result<()> {
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();
        
        // 设置表头格式
        let header_format = Format::new()
            .set_bold()
            .set_background_color(rust_xlsxwriter::Color::RGB(0x4472C4))
            .set_font_color(rust_xlsxwriter::Color::White);
        
        // 写入表头
        worksheet.write_with_format(0, 0, "商品编码", &header_format)?;
        
        // 写入示例数据
        worksheet.write(1, 0, "0101210000")?;
        worksheet.write(2, 0, "0201100000")?;
        worksheet.write(3, 0, "0301110000")?;
        
        // 设置列宽
        worksheet.set_column_width(0, 20)?;
        
        // 添加说明
        worksheet.write(5, 0, "说明：")?;
        worksheet.write(6, 0, "1. 在「商品编码」列填入要查询的10位海关编码")?;
        worksheet.write(7, 0, "2. 可以添加多行编码进行批量查询")?;
        worksheet.write(8, 0, "3. 删除示例数据后开始填写")?;
        
        workbook
            .save(output_path)
            .context("Failed to save template file")?;
        
        Ok(())
    }
}
