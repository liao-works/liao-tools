//! 轨迹查询结果导出 Excel。

use crate::models::tracking::TrackingRow;
use anyhow::{Context, Result};
use rust_xlsxwriter::{Format, Workbook};

pub fn export_results(rows: &[TrackingRow], output_path: &str) -> Result<()> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    let header_format = Format::new()
        .set_bold()
        .set_background_color(rust_xlsxwriter::Color::RGB(0xD3D3D3));

    let headers = [
        "运单号",
        "承运商",
        "状态",
        "子状态",
        "最新事件时间",
        "最新事件",
        "位置",
        "运输天数",
        "预计送达",
        "查询备注",
    ];
    for (col, header) in headers.iter().enumerate() {
        worksheet.write_with_format(0, col as u16, *header, &header_format)?;
    }

    for (index, row) in rows.iter().enumerate() {
        let row_num = (index + 1) as u32;
        worksheet.write(row_num, 0, &row.number)?;
        worksheet.write(row_num, 1, row.carrier.as_str())?;
        worksheet.write(row_num, 2, row.status.as_str())?;
        worksheet.write(row_num, 3, row.sub_status.as_str())?;
        worksheet.write(row_num, 4, row.latest_event_time.as_str())?;
        worksheet.write(row_num, 5, row.latest_event_description.as_str())?;
        worksheet.write(row_num, 6, row.latest_event_location.as_str())?;
        match row.transit_days {
            Some(days) => {
                worksheet.write(row_num, 7, days)?;
            }
            None => {
                worksheet.write(row_num, 7, "")?;
            }
        }
        worksheet.write(row_num, 8, row.estimated_delivery.as_str())?;
        worksheet.write(row_num, 9, row.error.as_deref().unwrap_or(""))?;
    }

    for col in 0..headers.len() as u16 {
        worksheet.set_column_width(col, 18)?;
    }
    worksheet.set_column_width(5, 40)?;
    worksheet.set_column_width(9, 32)?;

    workbook
        .save(output_path)
        .context("Failed to save output Excel file")?;
    Ok(())
}
