//! 关税成本试算的 Excel 批量处理。
//!
//! 输入模板列：商品编码 | 货值 | 运费 | 保险费 | 计税数量。
//! 金额按请求参数中的币种填写，目的地 / 中国原产 / 汇率 / VAT 为全局参数。

use crate::commands::tax::calc::{self, CalcBatchParams, CalcBatchResult, CalcRequest};
use crate::commands::tax::database::TaxDatabase;
use crate::commands::tax::excel::TaxExcelProcessor;
use anyhow::{Context, Result};
use calamine::{open_workbook, Data, Reader, Xlsx};
use rust_xlsxwriter::{Format, Workbook};

pub struct CalcExcelProcessor;

/// 模板列定义（输入文件与生成模板共用）
pub const TEMPLATE_HEADERS: [&str; 5] = ["商品编码", "货值", "运费", "保险费", "计税数量"];

impl CalcExcelProcessor {
    pub fn generate_template(output_path: &str) -> Result<()> {
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();

        let header_format = Format::new()
            .set_bold()
            .set_background_color(rust_xlsxwriter::Color::RGB(0x4472C4))
            .set_font_color(rust_xlsxwriter::Color::White);

        for (col, header) in TEMPLATE_HEADERS.iter().enumerate() {
            worksheet.write_with_format(0, col as u16, *header, &header_format)?;
        }

        worksheet.write(1, 0, "0101210000")?;
        worksheet.write(1, 1, 10000.0)?;
        worksheet.write(1, 2, 1200.0)?;
        worksheet.write(1, 3, 50.0)?;
        worksheet.write(2, 0, "0201100000")?;
        worksheet.write(2, 1, 25000.0)?;

        for col in 0..TEMPLATE_HEADERS.len() as u16 {
            worksheet.set_column_width(col, 18)?;
        }

        worksheet.write(4, 0, "说明：")?;
        worksheet.write(5, 0, "1. 「商品编码」填写 10 位海关编码，可含空格或连字符")?;
        worksheet.write(6, 0, "2. 金额按试算时选择的币种填写（默认 GBP），运费与保险费可留空")?;
        worksheet.write(7, 0, "3. 「计税数量」仅当税率表达式含按量计税（如 GBP/100kg）时必填，单位须与表达式一致（如 500kg 填 5）")?;
        worksheet.write(8, 0, "4. 目的地（GB/XI）、中国原产、汇率、VAT 率在批量试算时统一设置")?;
        worksheet.write(9, 0, "5. 删除示例数据后开始填写")?;

        workbook
            .save(output_path)
            .context("Failed to save template file")?;
        Ok(())
    }

    pub fn process_batch<F>(
        db: &TaxDatabase,
        input_path: &str,
        output_path: &str,
        params: &CalcBatchParams,
        mut progress_callback: F,
    ) -> Result<CalcBatchResult>
    where
        F: FnMut(usize, usize),
    {
        let mut workbook: Xlsx<_> =
            open_workbook(input_path).context("Failed to open input Excel file")?;
        let sheet_name = workbook
            .sheet_names()
            .first()
            .context("No sheets found in workbook")?
            .clone();
        let range = workbook
            .worksheet_range(&sheet_name)
            .context("Failed to read sheet")?;

        let mut rows: Vec<(String, CalcBatchRow)> = Vec::new();
        let mut parse_errors: Vec<String> = Vec::new();
        for (row_index, row) in range.rows().enumerate().skip(1) {
            let Some(code) = row.first().and_then(TaxExcelProcessor::parse_commodity_code) else {
                continue;
            };
            let line = (row_index + 1) as usize;
            let goods_value = match Self::parse_optional_number(row.get(1)) {
                Some(value) => value,
                None => {
                    parse_errors.push(format!("第{line}行：编码 {code} 缺少有效的「货值」"));
                    continue;
                }
            };
            rows.push((
                code.clone(),
                CalcBatchRow {
                    line,
                    code,
                    goods_value,
                    freight: Self::parse_optional_number(row.get(2)),
                    insurance: Self::parse_optional_number(row.get(3)),
                    quantity: Self::parse_optional_number(row.get(4)),
                },
            ));
        }

        let total = rows.len();
        let mut success = 0;
        let mut errors = parse_errors;
        let mut outcomes: Vec<(CalcBatchRow, Result<calc::CalcResult, String>)> = Vec::new();

        for (index, (code, row)) in rows.iter().enumerate() {
            progress_callback(index + 1, total);
            let request = CalcRequest {
                code: code.clone(),
                destination: params.destination.clone(),
                china_origin: params.china_origin,
                goods_value: row.goods_value,
                freight: row.freight.unwrap_or(0.0),
                insurance: row.insurance.unwrap_or(0.0),
                quantity: row.quantity,
                currency: params.currency.clone(),
                exchange_rate: params.exchange_rate,
                vat_rate: params.vat_rate,
            };
            let outcome = calc::estimate(db, &request);
            if outcome.is_ok() {
                success += 1;
            } else {
                errors.push(format!("第{}行：编码 {} - {}", row.line, code, outcome.as_ref().unwrap_err()));
            }
            outcomes.push((row.clone(), outcome));
        }

        Self::write_results(output_path, params, &outcomes)?;

        Ok(CalcBatchResult {
            total,
            success,
            failed: total - success,
            errors,
            output_path: output_path.to_string(),
        })
    }

    /// Excel 数值单元格兼容文本数字；空单元格返回 None
    fn parse_optional_number(value: Option<&Data>) -> Option<f64> {
        match value? {
            Data::Float(n) if n.is_finite() => Some(*n),
            Data::Int(n) => Some(*n as f64),
            Data::String(s) => s.trim().parse::<f64>().ok().filter(|n| n.is_finite()),
            _ => None,
        }
    }

    fn write_results(
        output_path: &str,
        params: &CalcBatchParams,
        outcomes: &[(CalcBatchRow, Result<calc::CalcResult, String>)],
    ) -> Result<()> {
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();
        worksheet.set_name("试算结果")?;

        let header_format = Format::new()
            .set_bold()
            .set_background_color(rust_xlsxwriter::Color::RGB(0xD3D3D3));

        let currency = params.currency.to_uppercase();
        let headers: Vec<String> = [
            "行号".to_string(),
            "商品编码".to_string(),
            "商品描述".to_string(),
            format!("货值({currency})"),
            format!("运费({currency})"),
            format!("保险费({currency})"),
            "完税价值CIF(GBP)".to_string(),
            "关税表达式".to_string(),
            "基础关税(GBP)".to_string(),
            "反倾销(GBP)".to_string(),
            "反补贴(GBP)".to_string(),
            "进口VAT(GBP)".to_string(),
            "税费合计(GBP)".to_string(),
            "综合税率%".to_string(),
            "试算状态".to_string(),
            "备注".to_string(),
        ]
        .into_iter()
        .collect();
        for (col, header) in headers.iter().enumerate() {
            worksheet.write_with_format(0, col as u16, header.as_str(), &header_format)?;
        }

        let mut row_num = 1u32;
        for (row, outcome) in outcomes {
            match outcome {
                Ok(result) => {
                    let mut notes: Vec<String> = result
                        .lines
                        .iter()
                        .filter(|l| !l.computable)
                        .map(|l| format!("{}：{}", l.label, l.note))
                        .collect();
                    notes.extend(result.warnings.iter().cloned());
                    let status = if result.fully_computed { "完成" } else { "部分完成" };
                    let base_amount = result
                        .lines
                        .iter()
                        .find(|l| l.label == "基础关税")
                        .and_then(|l| l.amount);
                    // 本地无措施记录时计 0；有记录却无法试算时显式标注
                    let remedy_amount = |label: &str| -> Option<f64> {
                        match result.lines.iter().find(|l| l.label == label) {
                            None => Some(0.0),
                            Some(line) => line.amount,
                        }
                    };
                    let amounts: [(u16, Option<f64>); 5] = [
                        (8, base_amount),
                        (9, remedy_amount("反倾销税")),
                        (10, remedy_amount("反补贴税")),
                        (11, result.vat_total),
                        (12, result.grand_total),
                    ];
                    worksheet.write(row_num, 0, row.line as u32)?;
                    worksheet.write(row_num, 1, &result.code)?;
                    worksheet.write(row_num, 2, result.description.as_deref().unwrap_or(""))?;
                    worksheet.write(row_num, 3, row.goods_value)?;
                    if let Some(v) = row.freight { worksheet.write(row_num, 4, v)?; }
                    if let Some(v) = row.insurance { worksheet.write(row_num, 5, v)?; }
                    worksheet.write(row_num, 6, result.customs_value)?;
                    worksheet.write(row_num, 7, &result.expression)?;
                    for (col, value) in amounts {
                        match value {
                            Some(v) => {
                                worksheet.write(row_num, col, v)?;
                            }
                            None => {
                                worksheet.write(row_num, col, "无法试算")?;
                            }
                        }
                    }
                    match result.total_rate_effective {
                        Some(rate) => {
                            worksheet.write(row_num, 13, rate)?;
                        }
                        None => {
                            worksheet.write(row_num, 13, "无法试算")?;
                        }
                    }
                    worksheet.write(row_num, 14, status)?;
                    worksheet.write(row_num, 15, notes.join("；"))?;
                }
                Err(err) => {
                    worksheet.write(row_num, 0, row.line as u32)?;
                    worksheet.write(row_num, 1, &row.code)?;
                    worksheet.write(row_num, 14, "无法试算")?;
                    worksheet.write(row_num, 15, err)?;
                }
            }
            row_num += 1;
        }

        for col in 0..headers.len() as u16 {
            worksheet.set_column_width(col, 18)?;
        }
        worksheet.set_column_width(7, 28)?;
        worksheet.set_column_width(15, 48)?;

        workbook
            .save(output_path)
            .context("Failed to save output Excel file")?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct CalcBatchRow {
    line: usize,
    code: String,
    goods_value: f64,
    freight: Option<f64>,
    insurance: Option<f64>,
    quantity: Option<f64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_numeric_cell_types() {
        assert_eq!(CalcExcelProcessor::parse_optional_number(Some(&Data::Float(12.5))), Some(12.5));
        assert_eq!(CalcExcelProcessor::parse_optional_number(Some(&Data::Int(3))), Some(3.0));
        assert_eq!(CalcExcelProcessor::parse_optional_number(Some(&Data::String(" 99 ".into()))), Some(99.0));
        assert_eq!(CalcExcelProcessor::parse_optional_number(Some(&Data::String("abc".into()))), None);
        assert_eq!(CalcExcelProcessor::parse_optional_number(Some(&Data::Empty)), None);
        assert_eq!(CalcExcelProcessor::parse_optional_number(None), None);
    }
}
