//! 体积 / 计费重的 Excel 批量试算。
//!
//! 输入模板列：名称(可选) | 长 | 宽 | 高 | 件数 | 实重。
//! 尺寸单位、重量单位与体积重系数为全局参数，在调用时统一设置。

use crate::commands::cbm::{self, estimate_containers};
use crate::models::cbm::{CbmBatchParams, CbmBatchResult, CbmPackage, CbmPackageResult};
use anyhow::{Context, Result};
use calamine::{open_workbook, Data, Reader, Xlsx};
use rust_xlsxwriter::{Format, Workbook};

pub struct CbmExcelProcessor;

pub const TEMPLATE_HEADERS: [&str; 6] = ["名称（可选）", "长", "宽", "高", "件数", "实重"];

impl CbmExcelProcessor {
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

        worksheet.write(1, 0, "纸箱 A")?;
        worksheet.write(1, 1, 120.0)?;
        worksheet.write(1, 2, 80.0)?;
        worksheet.write(1, 3, 100.0)?;
        worksheet.write(1, 4, 10)?;
        worksheet.write(1, 5, 150.0)?;
        worksheet.write(2, 0, "木箱 B")?;
        worksheet.write(2, 1, 1.0)?;
        worksheet.write(2, 2, 1.0)?;
        worksheet.write(2, 3, 1.0)?;
        worksheet.write(2, 4, 4)?;
        worksheet.write(2, 5, 220.0)?;

        for col in 0..TEMPLATE_HEADERS.len() as u16 {
            worksheet.set_column_width(col, 16)?;
        }

        worksheet.write(4, 0, "说明：")?;
        worksheet.write(5, 0, "1. 长 / 宽 / 高为单件尺寸，必须大于 0；件数留空按 1 件，实重留空按 0")?;
        worksheet.write(6, 0, "2. 尺寸单位（cm/m/in/ft）、重量单位（kg/g/lb）与体积重系数在批量试算时统一设置")?;
        worksheet.write(7, 0, "3. 体积重系数：空运 6000、国际快递 5000、海运拼箱 1000（cm³/kg）")?;
        worksheet.write(8, 0, "4. 删除示例数据后开始填写")?;

        workbook
            .save(output_path)
            .context("Failed to save template file")?;
        Ok(())
    }

    pub fn process_batch<F>(
        input_path: &str,
        output_path: &str,
        params: &CbmBatchParams,
        mut progress_callback: F,
    ) -> Result<CbmBatchResult>
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

        struct InputRow {
            line: usize,
            name: String,
            length: Option<f64>,
            width: Option<f64>,
            height: Option<f64>,
            quantity: Option<f64>,
            weight: Option<f64>,
        }

        let mut rows: Vec<InputRow> = Vec::new();
        for (row_index, row) in range.rows().enumerate().skip(1) {
            let name = row.first()
                .and_then(|cell| match cell {
                    Data::String(s) => Some(s.trim().to_string()),
                    _ => None,
                })
                .unwrap_or_default();
            let has_numbers = row.iter().skip(1).any(|cell| !matches!(cell, Data::Empty));
            if name.is_empty() && !has_numbers {
                continue; // 整行为空
            }
            rows.push(InputRow {
                line: row_index + 1,
                name,
                length: Self::parse_number(row.get(1)),
                width: Self::parse_number(row.get(2)),
                height: Self::parse_number(row.get(3)),
                quantity: Self::parse_number(row.get(4)),
                weight: Self::parse_number(row.get(5)),
            });
        }

        let total = rows.len();
        let mut outcomes: Vec<(usize, String, Result<CbmPackageResult, String>)> = Vec::new();
        for (index, row) in rows.iter().enumerate() {
            progress_callback(index + 1, total);
            let pkg = CbmPackage {
                name: row.name.clone(),
                length: row.length.unwrap_or(0.0),
                width: row.width.unwrap_or(0.0),
                height: row.height.unwrap_or(0.0),
                length_unit: params.length_unit.clone(),
                weight: row.weight.unwrap_or(0.0),
                weight_unit: params.weight_unit.clone(),
                quantity: row.quantity.unwrap_or(1.0),
            };
            let outcome = cbm::calc_package(&pkg, params.divisor)
                .map_err(|err| format!("第{}行：{}", row.line, err));
            outcomes.push((row.line, row.name.clone(), outcome));
        }

        let success = outcomes.iter().filter(|(_, _, o)| o.is_ok()).count();
        let errors: Vec<String> = outcomes
            .iter()
            .filter_map(|(_, _, o)| o.as_ref().err().cloned())
            .collect();

        Self::write_results(output_path, params, &outcomes)?;

        Ok(CbmBatchResult {
            total,
            success,
            failed: total - success,
            errors,
            output_path: output_path.to_string(),
        })
    }

    fn parse_number(value: Option<&Data>) -> Option<f64> {
        match value? {
            Data::Float(n) if n.is_finite() => Some(*n),
            Data::Int(n) => Some(*n as f64),
            Data::String(s) => s.trim().parse::<f64>().ok().filter(|n| n.is_finite()),
            _ => None,
        }
    }

    fn write_results(
        output_path: &str,
        params: &CbmBatchParams,
        outcomes: &[(usize, String, Result<CbmPackageResult, String>)],
    ) -> Result<()> {
        let mut workbook = Workbook::new();
        let worksheet = workbook.add_worksheet();
        worksheet.set_name("试算结果")?;

        let header_format = Format::new()
            .set_bold()
            .set_background_color(rust_xlsxwriter::Color::RGB(0xD3D3D3));

        let headers = [
            "行号",
            "名称",
            "尺寸(cm)",
            "件数",
            "单件体积(m³)",
            "总体积(m³)",
            "总实重(kg)",
            "体积重(kg)",
            "计费重(kg)",
            "计费方式",
            "备注",
        ];
        for (col, header) in headers.iter().enumerate() {
            worksheet.write_with_format(0, col as u16, *header, &header_format)?;
        }

        let mut total_volume = 0.0;
        let mut total_actual = 0.0;
        let mut total_volumetric = 0.0;
        let mut total_chargeable = 0.0;
        let mut row_num = 1u32;
        for (line, name, outcome) in outcomes {
            match outcome {
                Ok(result) => {
                    let piece_volume = if result.quantity > 0.0 {
                        result.total_volume_cbm / result.quantity
                    } else {
                        0.0
                    };
                    worksheet.write(row_num, 0, *line as u32)?;
                    worksheet.write(row_num, 1, name.as_str())?;
                    worksheet.write(
                        row_num,
                        2,
                        format!(
                            "{:.1} × {:.1} × {:.1}",
                            result.length_cm, result.width_cm, result.height_cm
                        ),
                    )?;
                    worksheet.write(row_num, 3, result.quantity)?;
                    worksheet.write(row_num, 4, piece_volume)?;
                    worksheet.write(row_num, 5, result.total_volume_cbm)?;
                    worksheet.write(row_num, 6, result.total_actual_weight_kg)?;
                    worksheet.write(row_num, 7, result.volumetric_weight_kg)?;
                    worksheet.write(row_num, 8, result.chargeable_weight_kg)?;
                    worksheet.write(row_num, 9, result.charge_basis.as_str())?;
                    row_num += 1;
                    total_volume += result.total_volume_cbm;
                    total_actual += result.total_actual_weight_kg;
                    total_volumetric += result.volumetric_weight_kg;
                    total_chargeable += result.chargeable_weight_kg;
                }
                Err(err) => {
                    worksheet.write(row_num, 0, *line as u32)?;
                    worksheet.write(row_num, 1, name.as_str())?;
                    worksheet.write(row_num, 10, err)?;
                    row_num += 1;
                }
            }
        }
        for col in 0..headers.len() as u16 {
            worksheet.set_column_width(col, 16)?;
        }

        // 汇总页：合计与柜型估算
        let summary = workbook.add_worksheet();
        summary.set_name("试算汇总")?;
        let charge_basis = if total_actual >= total_volumetric { "实重" } else { "体积重" };
        let summary_rows: [(&str, String); 6] = [
            ("体积重系数(cm³/kg)", format!("{}", params.divisor)),
            ("总体积(m³)", format!("{total_volume:.3}")),
            ("总实重(kg)", format!("{total_actual:.2}")),
            ("体积重(kg)", format!("{total_volumetric:.2}")),
            ("计费重(kg)", format!("{total_chargeable:.2}")),
            ("计费方式", charge_basis.to_string()),
        ];
        for (row, (label, value)) in summary_rows.iter().enumerate() {
            summary.write(row as u32, 0, *label)?;
            summary.write(row as u32, 1, value.as_str())?;
        }
        let containers = estimate_containers(total_volume, total_actual);
        summary.write(8, 0, "柜型估算（参考值，实际以船公司/路线限重为准）")?;
        let container_headers = ["柜型", "内尺寸", "容积(m³)", "参考载重(kg)", "按体积需柜", "按重需柜", "建议柜数"];
        for (col, header) in container_headers.iter().enumerate() {
            summary.write_with_format(9, col as u16, *header, &header_format)?;
        }
        for (row, container) in containers.iter().enumerate() {
            let sheet_row = (10 + row) as u32;
            summary.write(sheet_row, 0, container.name.as_str())?;
            summary.write(sheet_row, 1, container.internal.as_str())?;
            summary.write(sheet_row, 2, container.capacity_cbm)?;
            summary.write(sheet_row, 3, container.payload_kg)?;
            summary.write(sheet_row, 4, container.containers_by_volume)?;
            summary.write(sheet_row, 5, container.containers_by_weight)?;
            summary.write(sheet_row, 6, container.containers_needed)?;
        }
        for col in 0..container_headers.len() as u16 {
            summary.set_column_width(col, 22)?;
        }

        workbook
            .save(output_path)
            .context("Failed to save output Excel file")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_numeric_cell_types() {
        assert_eq!(CbmExcelProcessor::parse_number(Some(&Data::Float(2.5))), Some(2.5));
        assert_eq!(CbmExcelProcessor::parse_number(Some(&Data::Int(7))), Some(7.0));
        assert_eq!(CbmExcelProcessor::parse_number(Some(&Data::String(" 12 ".into()))), Some(12.0));
        assert_eq!(CbmExcelProcessor::parse_number(Some(&Data::String("x".into()))), None);
        assert_eq!(CbmExcelProcessor::parse_number(Some(&Data::Empty)), None);
        assert_eq!(CbmExcelProcessor::parse_number(None), None);
    }
}
