use crate::models::revcal::{RevCalProduct, RevCalQueryResult};
use anyhow::Context;
use calamine::{open_workbook, DataType, Reader, Xlsx};
use rust_xlsxwriter::{Format, Workbook};

/// 合并模式列：与官方 Étape 1 表格对齐（Dimensions du produit + Prix）
const HEADERS_MERGED: [&str; 7] = [
    "查询码",
    "状态",
    "ASIN",
    "商品名称",
    "Dimensions du produit",
    "Prix",
    "错误信息",
];

/// 拆分模式列：尺寸拆为长/宽/高/重量（数值列）
const HEADERS_SPLIT: [&str; 12] = [
    "查询码",
    "状态",
    "ASIN",
    "商品名称",
    "长",
    "宽",
    "高",
    "尺寸单位",
    "重量",
    "重量单位",
    "Prix",
    "错误信息",
];

/// 将批量查询结果写入 Excel。
/// split_dimensions=true 时尺寸拆分为长/宽/高/重量数值列，否则输出官方合并格式字符串。
pub fn write_results(
    output_path: &str,
    results: &[RevCalQueryResult],
    split_dimensions: bool,
) -> anyhow::Result<()> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    let header_format = Format::new()
        .set_bold()
        .set_background_color(rust_xlsxwriter::Color::RGB(0xD3D3D3));
    let headers: &[&str] = if split_dimensions {
        &HEADERS_SPLIT
    } else {
        &HEADERS_MERGED
    };
    for (col, header) in headers.iter().enumerate() {
        worksheet.write_with_format(0, col as u16, *header, &header_format)?;
    }

    let last_col = headers.len() as u16 - 1;
    let mut row: u32 = 1;
    for result in results {
        let (status, error) = if let Some(err) = &result.error {
            ("查询失败", Some(err.as_str()))
        } else if result.found() {
            ("成功", None)
        } else {
            ("未找到", None)
        };

        if result.products.is_empty() {
            worksheet.write(row, 0, &result.code)?;
            worksheet.write(row, 1, status)?;
            if let Some(err) = error {
                worksheet.write(row, last_col, err)?;
            }
            row += 1;
        } else {
            for product in &result.products {
                write_product_row(worksheet, row, &result.code, status, product, error, split_dimensions)?;
                row += 1;
            }
        }
    }

    let widths: [(u16, u16); 12] = [
        (0, 14), (1, 10), (2, 14), (3, 50), (4, 10), (5, 10), (6, 10),
        (7, 12), (8, 10), (9, 12), (10, 10), (11, 30),
    ];
    for (col, width) in widths.iter().take(headers.len()) {
        worksheet.set_column_width(*col, *width)?;
    }

    workbook
        .save(output_path)
        .with_context(|| format!("保存 Excel 失败: {}", output_path))?;
    Ok(())
}

fn write_product_row(
    worksheet: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    code: &str,
    status: &str,
    product: &RevCalProduct,
    error: Option<&str>,
    split_dimensions: bool,
) -> anyhow::Result<()> {
    worksheet.write(row, 0, code)?;
    worksheet.write(row, 1, status)?;
    worksheet.write(row, 2, &product.asin)?;
    worksheet.write(row, 3, &product.title)?;

    if split_dimensions {
        write_opt_num(worksheet, row, 4, product.length)?;
        write_opt_num(worksheet, row, 5, product.width)?;
        write_opt_num(worksheet, row, 6, product.height)?;
        write_opt_text(worksheet, row, 7, &product.dimension_unit)?;
        write_opt_num(worksheet, row, 8, product.weight)?;
        write_opt_text(worksheet, row, 9, &product.weight_unit)?;
        write_opt_num(worksheet, row, 10, product.price)?;
    } else {
        let dims = format_dimensions_official(product);
        if dims.is_empty() {
            worksheet.write(row, 4, "")?;
        } else {
            worksheet.write(row, 4, &dims)?;
        }
        write_opt_num(worksheet, row, 5, product.price)?;
    }

    if let Some(err) = error {
        let last_col = if split_dimensions { 11 } else { 6 };
        worksheet.write(row, last_col, err)?;
    }
    Ok(())
}

fn write_opt_text(
    worksheet: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    col: u16,
    value: &Option<String>,
) -> anyhow::Result<()> {
    if let Some(v) = value {
        worksheet.write(row, col, v)?;
    }
    Ok(())
}

fn write_opt_num(
    worksheet: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    col: u16,
    value: Option<f64>,
) -> anyhow::Result<()> {
    if let Some(v) = value {
        worksheet.write_number(row, col, v)?;
    }
    Ok(())
}

/// 合并模式下的单位文案（法语，与官方页面一致；未知单位原样返回）
fn unit_fr<'a>(unit: &'a Option<String>) -> &'a str {
    match unit.as_deref() {
        Some("centimeters") => "centimètres",
        Some("kilograms") => "kilogrammes",
        Some("inches") => "pouces",
        Some("pounds") => "livres",
        Some("grams") => "grammes",
        Some("millimeters") => "millimètres",
        Some(other) => other,
        None => "",
    }
}

/// 官方合并格式：`20,2 X 30,3 X 35 centimètres 4,85 kilogrammes`
/// （逗号小数、" X " 分隔、法语单位；数据缺失时返回空字符串）
pub fn format_dimensions_official(p: &RevCalProduct) -> String {
    let dims = match (p.length, p.width, p.height) {
        (Some(l), Some(w), Some(h)) => format!(
            "{} X {} X {} {}",
            fr_num(l),
            fr_num(w),
            fr_num(h),
            unit_fr(&p.dimension_unit)
        ),
        _ => String::new(),
    };
    let weight = match p.weight {
        Some(wt) => format!("{} {}", fr_num(wt), unit_fr(&p.weight_unit)),
        None => String::new(),
    };
    match (dims.is_empty(), weight.is_empty()) {
        (false, false) => format!("{} {}", dims, weight),
        (false, true) => dims,
        (true, false) => weight,
        (true, true) => String::new(),
    }
}

/// 法语数字格式：最多 2 位小数，小数点用逗号
fn fr_num(n: f64) -> String {
    let rounded = (n * 100.0).round() / 100.0;
    let mut s = rounded.to_string();
    if let Some(pos) = s.find('.') {
        s.replace_range(pos..pos + 1, ",");
    }
    s
}

/// 从 Excel 第一列读取查询码（跳过首行表头，过滤空白行）
pub fn read_codes(input_path: &str) -> anyhow::Result<Vec<String>> {
    let mut workbook: Xlsx<_> =
        open_workbook(input_path).with_context(|| format!("无法打开文件: {}", input_path))?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .context("文件中没有工作表")?
        .clone();
    let range = workbook
        .worksheet_range(&sheet_name)
        .context("读取工作表失败")?;

    let mut codes = Vec::new();
    for row in range.rows().skip(1) {
        if let Some(cell) = row.first() {
            if let Some(code) = cell.as_string() {
                let code = code.trim().to_string();
                if !code.is_empty() {
                    codes.push(code);
                }
            }
        }
    }
    Ok(codes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::revcal::{RevCalProduct, RevCalQueryResult};
    use calamine::{open_workbook, Reader, Xlsx};

    fn product(asin: &str, price: f64) -> RevCalProduct {
        RevCalProduct {
            asin: asin.to_string(),
            title: format!("商品 {}", asin),
            brand: Some("品牌A".to_string()),
            image_url: None,
            product_link: None,
            length: Some(20.2),
            width: Some(30.3),
            height: Some(35.0),
            dimension_unit: Some("centimeters".to_string()),
            weight: Some(4.85),
            weight_unit: Some("kilograms".to_string()),
            price: Some(price),
            currency: Some("GBP".to_string()),
            fee_category: None,
            sales_rank: None,
            sales_rank_context: None,
            reviews_count: None,
            rating: None,
            offer_count: None,
        }
    }

    fn temp_path(tag: &str) -> String {
        let dir = std::env::temp_dir();
        let name = format!(
            "revcal_test_{}_{}.xlsx",
            tag,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        dir.join(name).to_string_lossy().to_string()
    }

    fn read_row(path: &str, row: u32) -> Vec<String> {
        let mut wb: Xlsx<_> = open_workbook(path).expect("应能打开导出文件");
        let sheet = wb.sheet_names().first().unwrap().clone();
        let range = wb.worksheet_range(&sheet).expect("应能读取工作表");
        range
            .rows()
            .nth(row as usize)
            .expect("行应存在")
            .iter()
            .map(|c| c.to_string())
            .collect()
    }

    #[test]
    fn export_merged_mode_matches_official_columns() {
        let results = vec![RevCalQueryResult {
            code: "B0GD7VRN9V".to_string(),
            products: vec![product("B0GD7VRN9V", 69.99)],
            error: None,
        }];
        let path = temp_path("merged");
        write_results(&path, &results, false).expect("导出应成功");

        let header = read_row(&path, 0);
        assert_eq!(header, vec!["查询码", "状态", "ASIN", "商品名称", "Dimensions du produit", "Prix", "错误信息"]);

        // 官方合并格式：20,2 X 30,3 X 35 centimètres 4,85 kilogrammes
        let row = read_row(&path, 1);
        assert_eq!(row[0], "B0GD7VRN9V");
        assert_eq!(row[1], "成功");
        assert_eq!(row[2], "B0GD7VRN9V");
        assert_eq!(row[4], "20,2 X 30,3 X 35 centimètres 4,85 kilogrammes");
        assert_eq!(row[5], "69.99");
    }

    #[test]
    fn export_split_mode_separates_dimensions() {
        let results = vec![RevCalQueryResult {
            code: "B0GD7VRN9V".to_string(),
            products: vec![product("B0GD7VRN9V", 69.99)],
            error: None,
        }];
        let path = temp_path("split");
        write_results(&path, &results, true).expect("导出应成功");

        let header = read_row(&path, 0);
        assert_eq!(header, vec!["查询码", "状态", "ASIN", "商品名称", "长", "宽", "高", "尺寸单位", "重量", "重量单位", "Prix", "错误信息"]);

        let row = read_row(&path, 1);
        assert_eq!(row[4], "20.2");
        assert_eq!(row[5], "30.3");
        assert_eq!(row[6], "35");
        assert_eq!(row[7], "centimeters");
        assert_eq!(row[8], "4.85");
        assert_eq!(row[9], "kilograms");
        assert_eq!(row[10], "69.99");
    }

    #[test]
    fn export_writes_notfound_and_error_rows() {
        let results = vec![
            RevCalQueryResult {
                code: "NOTFOUND1".to_string(),
                products: vec![],
                error: None,
            },
            RevCalQueryResult {
                code: "BROKEN1".to_string(),
                products: vec![],
                error: Some("网络错误".to_string()),
            },
        ];
        let path = temp_path("status");
        write_results(&path, &results, false).expect("导出应成功");

        let row1 = read_row(&path, 1);
        assert_eq!(row1[0], "NOTFOUND1");
        assert_eq!(row1[1], "未找到");

        let row2 = read_row(&path, 2);
        assert_eq!(row2[0], "BROKEN1");
        assert_eq!(row2[1], "查询失败");
        assert_eq!(row2[6], "网络错误");
    }

    #[test]
    fn export_handles_multiple_products_per_code() {
        let results = vec![RevCalQueryResult {
            code: "keyword".to_string(),
            products: vec![product("A1", 1.0), product("A2", 2.0)],
            error: None,
        }];
        let path = temp_path("multi");
        write_results(&path, &results, false).expect("导出应成功");
        let row1 = read_row(&path, 1);
        assert_eq!(row1[0], "keyword");
        assert_eq!(row1[2], "A1");
        let row2 = read_row(&path, 2);
        assert_eq!(row2[0], "keyword");
        assert_eq!(row2[2], "A2");
    }

    #[test]
    fn read_codes_skips_header_and_blank_rows() {
        let path = temp_path("codes");
        let mut wb = Workbook::new();
        let ws = wb.add_worksheet();
        ws.write(0, 0, "编码").unwrap();
        ws.write(1, 0, "B0GD7VRN9V").unwrap();
        ws.write(2, 0, "   ").unwrap();
        ws.write(3, 0, "B09B9615X2").unwrap();
        wb.save(&path).unwrap();

        let codes = read_codes(&path).expect("读取应成功");
        assert_eq!(codes, vec!["B0GD7VRN9V", "B09B9615X2"]);
    }

    #[test]
    fn read_codes_trims_whitespace() {
        let path = temp_path("trim");
        let mut wb = Workbook::new();
        let ws = wb.add_worksheet();
        ws.write(0, 0, "编码").unwrap();
        ws.write(1, 0, "  B0GD7VRN9V  ").unwrap();
        wb.save(&path).unwrap();

        let codes = read_codes(&path).expect("读取应成功");
        assert_eq!(codes, vec!["B0GD7VRN9V"]);
    }

    #[test]
    fn read_codes_rejects_missing_file() {
        assert!(read_codes("/nonexistent/nope.xlsx").is_err());
    }
}
