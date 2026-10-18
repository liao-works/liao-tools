use crate::commands::tax::database::TaxDatabase;
use crate::commands::tax::query::TaxQuery;
use crate::models::tax::BatchResult;
use anyhow::{Context, Result};
use calamine::{open_workbook, Data, Reader, Xlsx};
use rust_xlsxwriter::{Format, Workbook};
use serde_json::Value;

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
                if let Some(code) = Self::parse_commodity_code(cell) {
                    codes.push(code);
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
    
    /// Excel frequently stores a 10-digit commodity code in a numeric cell.
    /// Preserve leading zeros when converting valid integers; reject fractions.
    /// Text cells retain their exact content for normalisation by TaxQuery.
    pub(crate) fn parse_commodity_code(value: &Data) -> Option<String> {
        match value {
            Data::String(s) => {
                let code = s.trim();
                if code.is_empty() { None } else { Some(code.to_string()) }
            }
            Data::Int(n) if *n >= 0 && *n <= 9_999_999_999 =>
                Some(format!("{:010}", n)),
            Data::Float(n) if n.is_finite() && *n >= 0.0
                && *n <= 9_999_999_999.0 && n.fract() == 0.0 =>
                Some(format!("{:010}", *n as u64)),
            _ => None,
        }
    }

    /// 将完整税率选项写入独立明细工作表，避免主表丢失条件/特殊用途数据。
    fn write_rate_option_details(
        workbook: &mut Workbook,
        results: &[(String, Option<crate::models::tax::TaxTariff>)],
        header_format: &Format,
    ) -> Result<()> {
        let sheet = workbook.add_worksheet();
        sheet.set_name("税率条件明细")?;
        let headers = [
            "商品编码", "地区", "措施类型", "措施类型说明", "适用地理范围",
            "地理区域编码(JSON)", "税率/税额表达式", "全部表达式(JSON)", "表达式解析状态",
            "附加代码", "附加代码说明", "适用条件", "条件关联ID(JSON)",
            "附加代码关联ID(JSON)", "未解析关联项(JSON)", "排除地区",
            "适用判定", "中国适用", "生效状态", "生效日期", "截止日期", "来源措施ID",
        ];
        for (col, header) in headers.iter().enumerate() {
            sheet.write_with_format(0, col as u16, *header, header_format)?;
        }
        let mut row_num = 1u32;
        for (code, tariff_opt) in results {
            let Some(tariff) = tariff_opt else { continue };
            let Some(raw) = tariff.rate_options.as_deref() else { continue };
            let Ok(Value::Array(options)) = serde_json::from_str::<Value>(raw) else { continue };
            for option in options {
                let get = |name: &str| option.get(name).and_then(Value::as_str).unwrap_or("");
                let get_json = |name: &str| option.get(name).map(Value::to_string).unwrap_or_default();
                let get_bool = |name: &str| match option.get(name).and_then(Value::as_bool) {
                    Some(true) => "是",
                    Some(false) => "否",
                    None => "",
                };
                let geography_ids = get_json("geography_ids");
                let expression_options = get_json("expression_options");
                let condition_ids = get_json("condition_ids");
                let additional_code_ids = get_json("additional_code_ids");
                let unresolved = get_json("unresolved_relationships");
                let values = [
                    code.as_str(), get("region"), get("measure_type"), get("measure_type_description"),
                    get("geography_description"), geography_ids.as_str(), get("expression"),
                    expression_options.as_str(), get("expression_resolution"), get("additional_code"),
                    get("additional_description"), get("conditions"), condition_ids.as_str(),
                    additional_code_ids.as_str(), unresolved.as_str(), get("excluded_areas"),
                    get("applicability"), get_bool("china_applicable"), get("effective_status"),
                    get("effective_start"), get("effective_end"), get("source_id"),
                ];
                for (col, value) in values.iter().enumerate() {
                    sheet.write(row_num, col as u16, *value)?;
                }
                row_num += 1;
            }
        }
        for col in 0..headers.len() as u16 {
            sheet.set_column_width(col, 24)?;
        }
        Ok(())
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
        
        // 写入表头（移除描述列，添加新税率列）
        let headers = vec![
            "商品编码",
            "英国税率",
            "英国URL",
            "北爱尔兰税率",
            "北爱尔兰URL",
            "反倾销（英国GB）",
            "反补贴（英国GB）",
            "反倾销（北爱XI）",
            "反补贴（北爱XI）",
            "英国条件/特殊税率",
            "北爱条件/特殊税率",
            "查询状态",
            "英国数据状态",
            "北爱数据状态",
            "英国来源版本",
            "北爱来源版本",
        ];

        for (col, header) in headers.iter().enumerate() {
            worksheet.write_with_format(0, col as u16, *header, &header_format)?;
        }

        // 写入数据（移除描述列，添加新税率列）
        for (row, (code, tariff_opt)) in results.iter().enumerate() {
            let row_num = (row + 1) as u32;

            worksheet.write(row_num, 0, code)?;

            if let Some(tariff) = tariff_opt {
                worksheet.write(row_num, 1, &tariff.rate)?;
                worksheet.write(row_num, 2, &tariff.url)?;
                worksheet.write(
                    row_num,
                    3,
                    tariff.north_ireland_rate.as_deref().unwrap_or(""),
                )?;
                worksheet.write(
                    row_num,
                    4,
                    tariff.north_ireland_url.as_deref().unwrap_or(""),
                )?;
                worksheet.write(
                    row_num,
                    5,
                    tariff.anti_dumping_rate.as_deref().unwrap_or(""),
                )?;
                worksheet.write(
                    row_num,
                    6,
                    tariff.countervailing_rate.as_deref().unwrap_or(""),
                )?;
                worksheet.write(row_num, 7, tariff.ni_anti_dumping_rate.as_deref().unwrap_or(""))?;
                worksheet.write(row_num, 8, tariff.ni_countervailing_rate.as_deref().unwrap_or(""))?;
                let option_summary = |region: &str| -> String {
                    let Ok(Value::Array(options)) = serde_json::from_str::<Value>(
                        tariff.rate_options.as_deref().unwrap_or("[]")) else { return String::new() };
                    options.iter()
                        .filter(|o| o.get("region").and_then(Value::as_str) == Some(region))
                        .filter(|o| o.get("applicability").and_then(Value::as_str) != Some("default"))
                        .filter_map(|o| {
                            let expr=o.get("expression").and_then(Value::as_str).unwrap_or("");
                            let code=o.get("additional_code").and_then(Value::as_str).unwrap_or("");
                            let cond=o.get("conditions").and_then(Value::as_str).unwrap_or("");
                            let mut parts=Vec::new();
                            if !expr.is_empty() { parts.push(expr.to_string()); }
                            if !code.is_empty() { parts.push(format!("附加代码 {}",code)); }
                            if !cond.is_empty() { parts.push(format!("条件 {}",cond)); }
                            if parts.is_empty() { None } else { Some(parts.join("；")) }
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                };
                worksheet.write(row_num, 9, option_summary("GB"))?;
                worksheet.write(row_num, 10, option_summary("XI"))?;
                worksheet.write(row_num, 11, "成功")?;
                worksheet.write(row_num, 12, tariff.uk_rate_status.as_deref().unwrap_or(""))?;
                worksheet.write(row_num, 13, tariff.ni_rate_status.as_deref().unwrap_or(""))?;
                worksheet.write(row_num, 14, tariff.uk_source_version.as_deref().unwrap_or(""))?;
                worksheet.write(row_num, 15, tariff.ni_source_version.as_deref().unwrap_or(""))?;
            } else {
                worksheet.write(row_num, 11, "未找到")?;
            }
        }

        // GB 与北爱 XI 的附加税单独导出，避免混淆
        for col in 0..16 {
            worksheet.set_column_width(col, 20)?;
        }
        
        Self::write_rate_option_details(&mut workbook, results, &header_format)?;

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

#[cfg(test)]
mod commodity_code_tests {
    use super::*;

    #[test]
    fn excel_numeric_codes_keep_leading_zero() {
        assert_eq!(TaxExcelProcessor::parse_commodity_code(&Data::Int(101210000)),
                   Some("0101210000".to_string()));
        assert_eq!(TaxExcelProcessor::parse_commodity_code(&Data::Float(101210000.0)),
                   Some("0101210000".to_string()));
    }

    #[test]
    fn excel_fractional_code_is_not_rounded() {
        assert_eq!(TaxExcelProcessor::parse_commodity_code(&Data::Float(101210000.5)), None);
        assert_eq!(TaxExcelProcessor::parse_commodity_code(&Data::String("0101210000".into())),
                   Some("0101210000".into()));
    }
}
