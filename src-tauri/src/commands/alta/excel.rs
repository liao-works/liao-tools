use super::matcher::HSCodeMatcher;
use crate::models::alta::ExcelStats;
use anyhow::{Context, Result};
use calamine::{open_workbook, Reader, Xlsx};
use log::info;
use rust_xlsxwriter::{Color, Format, Workbook};
use std::path::Path;
use std::sync::{Arc, Mutex};

/// Excel处理器
pub struct ExcelProcessor {
    matcher: Arc<Mutex<HSCodeMatcher>>,
}

impl ExcelProcessor {
    /// 创建新的Excel处理器
    pub fn new(matcher: Arc<Mutex<HSCodeMatcher>>) -> Self {
        Self { matcher }
    }

    /// 查找"HS Code"列的索引
    fn find_hs_code_column(&self, headers: &[String]) -> Option<usize> {
        for (idx, header) in headers.iter().enumerate() {
            let header_lower = header.to_lowercase();
            if header_lower.contains("hs")
                || header_lower.contains("code")
                || header_lower.contains("海关")
                || header_lower.contains("编码")
                || header_lower.contains("商品编码")
            {
                info!("找到HS Code列: 第{}列 ({})", idx + 1, header);
                return Some(idx);
            }
        }
        None
    }

    /// 处理Excel文件
    pub fn process_excel(
        &self,
        input_path: &Path,
        output_path: &Path,
        match_length: Option<u8>,
    ) -> Result<ExcelStats> {
        info!("开始处理Excel: {:?}", input_path);

        // 读取输入文件
        let mut workbook: Xlsx<_> =
            open_workbook(input_path).context("Failed to open Excel file")?;

        // 获取第一个工作表
        let sheet_name = workbook
            .sheet_names()
            .first()
            .context("No sheets found in workbook")?
            .clone();

        let range = workbook
            .worksheet_range(&sheet_name)
            .context("Failed to get worksheet range")?;

        // 读取数据
        let mut rows: Vec<Vec<String>> = Vec::new();
        for row in range.rows() {
            let row_data: Vec<String> = row.iter().map(|cell| cell.to_string()).collect();
            rows.push(row_data);
        }

        if rows.is_empty() {
            anyhow::bail!("Excel文件没有数据");
        }

        // 查找HS Code列
        let headers = &rows[0];
        let hs_col = self
            .find_hs_code_column(headers)
            .context("未找到'HS Code'列")?;

        // 创建输出工作簿
        let mut output_workbook = Workbook::new();
        let worksheet = output_workbook.add_worksheet();

        // 定义样式
        let red_format = Format::new()
            .set_background_color(Color::RGB(0xFF0000))
            .set_font_color(Color::RGB(0xFFFFFF))
            .set_bold();

        let bold_format = Format::new().set_bold();

        worksheet.write_string_with_format(0, 0, "HS Code", &bold_format)?;
        worksheet.write_string_with_format(0, 1, "禁运状态", &bold_format)?;

        // 统计信息
        let mut stats = ExcelStats {
            total: 0,
            forbidden: 0,
            safe: 0,
            invalid: 0,
            output_path: output_path.to_string_lossy().to_string(),
        };

        // 处理数据行（跳过表头）
        for (row_idx, row_data) in rows.iter().enumerate().skip(1) {
            // 获取HS编码并匹配
            let hs_code = row_data[hs_col].trim();
            let matcher = self.matcher.lock().unwrap();
            let match_result = matcher.match_code(hs_code, match_length)?;
            drop(matcher); // 释放锁

            stats.total += 1;

            if match_result.is_forbidden {
                stats.forbidden += 1;
                worksheet.write_string_with_format(row_idx as u32, 0, hs_code, &red_format)?;
                worksheet.write_string_with_format(row_idx as u32, 1, "禁运", &red_format)?;
            } else if match_result.match_type == "无效编码"
                || match_result.match_type.starts_with("编码长度不足")
            {
                stats.invalid += 1;
                worksheet.write_string(row_idx as u32, 0, hs_code)?;
                worksheet.write_string(row_idx as u32, 1, &match_result.match_type)?;
            } else {
                stats.safe += 1;
                worksheet.write_string(row_idx as u32, 0, hs_code)?;
                worksheet.write_string(row_idx as u32, 1, "正常")?;
            }
        }

        // 保存文件
        output_workbook
            .save(output_path)
            .context("Failed to save output Excel file")?;

        info!("处理完成，结果已保存到: {:?}", output_path);
        info!(
            "统计: 总计={}, 禁运={}, 正常={}, 无效={}",
            stats.total, stats.forbidden, stats.safe, stats.invalid
        );

        Ok(stats)
    }

    /// 验证Excel文件是否有效
    pub fn validate_excel_file(&self, file_path: &Path) -> Result<()> {
        // 检查文件是否存在
        if !file_path.exists() {
            anyhow::bail!("文件不存在");
        }

        // 检查文件扩展名
        let ext = file_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        if ext != "xlsx" && ext != "xls" {
            anyhow::bail!("不支持的文件格式，请使用.xlsx或.xls文件");
        }

        // 尝试打开文件
        let mut workbook: Xlsx<_> = open_workbook(file_path).context("无法打开Excel文件")?;

        let sheet_name = workbook
            .sheet_names()
            .first()
            .context("Excel文件没有工作表")?
            .clone();

        let range = workbook
            .worksheet_range(&sheet_name)
            .context("无法读取工作表")?;

        // 检查是否有数据
        if range.get_size().0 < 2 {
            anyhow::bail!("Excel文件没有数据行");
        }

        // 检查是否有HS Code列
        let headers: Vec<String> = range
            .rows()
            .next()
            .context("无法读取表头")?
            .iter()
            .map(|cell| cell.to_string())
            .collect();

        if self.find_hs_code_column(&headers).is_none() {
            anyhow::bail!("未找到'HS Code'列，请确保表头包含该列");
        }

        Ok(())
    }

    /// 获取Excel文件信息
    pub fn get_excel_info(&self, file_path: &Path) -> Result<serde_json::Value> {
        let mut workbook: Xlsx<_> = open_workbook(file_path)?;

        let sheet_name = workbook
            .sheet_names()
            .first()
            .context("No sheets found")?
            .clone();

        let range = workbook.worksheet_range(&sheet_name)?;
        let size = range.get_size();

        let headers: Vec<String> = range
            .rows()
            .next()
            .context("No headers")?
            .iter()
            .map(|cell| cell.to_string())
            .collect();

        Ok(serde_json::json!({
            "file_name": file_path.file_name().and_then(|s| s.to_str()).unwrap_or(""),
            "sheet_name": sheet_name,
            "total_rows": size.0 - 1, // 减去表头
            "total_columns": size.1,
            "has_hs_code": self.find_hs_code_column(&headers).is_some(),
        }))
    }

    /// 生成Excel模板
    pub fn generate_template(output_path: &Path) -> Result<()> {
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();

        let bold_format = Format::new().set_bold();

        let headers = vec!["HS Code"];
        for (idx, header) in headers.iter().enumerate() {
            worksheet.write_string_with_format(0, idx as u16, *header, &bold_format)?;
        }

        worksheet.write_string(1, 0, "0101210000")?;

        workbook.save(output_path)?;

        info!("模板已生成: {:?}", output_path);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::database::DatabaseManager;
    #[allow(unused_imports)]
    use super::matcher::HSCodeMatcher;
    #[allow(unused_imports)]
    use super::*;
    #[allow(unused_imports)]
    use std::sync::{Arc, Mutex};
    #[allow(unused_imports)]
    use tempfile::NamedTempFile;

    #[test]
    fn test_generate_template() {
        let temp_file = NamedTempFile::new().unwrap();
        let result = ExcelProcessor::generate_template(temp_file.path());
        assert!(result.is_ok());
    }
}
