use crate::commands::error::CommandError;
use crate::models::ups_dpd::{CellValue, CountryStats, ExcelDataFrame, ZipcodeStats};
use rust_xlsxwriter::{Workbook, Worksheet};
use std::collections::HashMap;
use std::path::Path;

/// UPS 数据处理器
pub struct UpsProcessor {
    logs: Vec<String>,
}

impl UpsProcessor {
    pub fn new() -> Self {
        UpsProcessor { logs: Vec::new() }
    }

    fn log(&mut self, message: String) {
        println!("{}", message);
        self.logs.push(message);
    }

    pub fn get_logs(&self) -> Vec<String> {
        self.logs.clone()
    }

    /// UPS 字段映射配置
    fn get_field_mappings() -> HashMap<&'static str, HashMap<&'static str, &'static str>> {
        let mut mappings = HashMap::new();

        // 总结单映射
        let mut summary = HashMap::new();
        summary.insert("转单号", "Tracking Number");
        summary.insert("件数", "Packages");
        summary.insert("收货实重", "G.W");
        summary.insert("收货材积重", "V.G");
        summary.insert("收件人邮编", "ZIP code");
        summary.insert("国家二字码", "country");
        mappings.insert("总结单", summary);

        // 运单信息映射
        let mut waybill = HashMap::new();
        waybill.insert("客户单号", "参考号\n（Reference NO)");
        waybill.insert("件数", "件数\n(PCS)");
        waybill.insert("收货实重", "实重\n(Kg)");
        waybill.insert("收货材积重", "材重\n(Kg)");
        waybill.insert("国家二字码", "目的地\n(Destination)");
        waybill.insert("转单号", "UPS主运单号\n(Tracking Number)");
        waybill.insert("柜号", "提单号（集装箱/空运）");
        mappings.insert("运单信息", waybill);

        // 统计映射
        let mut statistics = HashMap::new();
        statistics.insert("国家二字码", "Destination");
        statistics.insert("件数", "Package");
        statistics.insert("收货实重", "G.W");
        statistics.insert("收货材积重", "V.W");
        mappings.insert("统计", statistics);

        // 德国邮编映射
        let mut german = HashMap::new();
        german.insert("收件人邮编", "zipcode");
        german.insert("件数", "PCS");
        german.insert("收货实重", "GW");
        german.insert("收货材积重", "VW");
        german.insert("country", "country");
        mappings.insert("德国邮编", german);

        // 子单号映射
        let mut sub_order = HashMap::new();
        sub_order.insert("客户单号", "参考号\n（Reference NO)");
        sub_order.insert("子转单号", "UPS 子单号\n(Tracking Number)");
        mappings.insert("子单号", sub_order);

        mappings
    }

    /// 处理 UPS 数据
    pub fn process_ups_data(
        &mut self,
        main_data: &ExcelDataFrame,
        detail_data: Option<&ExcelDataFrame>,
        _template_path: &Path,
        output_path: &Path,
    ) -> Result<(), CommandError> {
        self.log("开始处理 UPS 数据".to_string());

        // 使用 rust_xlsxwriter 打开模板文件
        // 注意：rust_xlsxwriter 不支持直接编辑现有文件，需要复制内容
        // 这里简化处理，实际需要使用 calamine 读取模板，然后用 rust_xlsxwriter 写入

        let mut workbook = Workbook::new();

        // 处理5个工作表
        self.process_summary_sheet(&mut workbook, main_data)?;
        self.process_waybill_sheet(&mut workbook, main_data)?;
        self.process_statistics_sheet(&mut workbook, main_data)?;
        self.process_german_zipcode_sheet(&mut workbook, main_data)?;

        if let Some(detail) = detail_data {
            self.process_sub_order_sheet(&mut workbook, detail)?;
        }

        workbook
            .save(output_path)
            .map_err(|e| CommandError::new(format!("保存输出文件失败: {}", e), "ERROR"))?;

        self.log(format!("UPS 数据处理完成: {:?}", output_path));
        Ok(())
    }

    /// 处理总结单工作表
    fn process_summary_sheet(
        &mut self,
        workbook: &mut Workbook,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理总结单工作表".to_string());

        let mut worksheet = workbook.add_worksheet();
        worksheet
            .set_name("总结单")
            .map_err(|e| CommandError::new(format!("设置工作表名称失败: {}", e), "ERROR"))?;

        let mappings = Self::get_field_mappings();
        let summary_mapping = mappings.get("总结单").unwrap();

        // 写入表头
        let headers: Vec<&str> = summary_mapping.values().copied().collect();
        for (col_idx, header) in headers.iter().enumerate() {
            worksheet
                .write_string(0, col_idx as u16, *header)?;
        }

        // 写入数据
        for (row_idx, row) in data.rows.iter().enumerate() {
            for (data_field, template_field) in summary_mapping.iter() {
                if let Some(value) = row.get(data_field) {
                    if let Some(col_idx) = headers.iter().position(|&h| h == *template_field) {
                        self.write_cell_value(
                            &mut worksheet,
                            (row_idx + 1) as u32,
                            col_idx as u16,
                            value,
                        )?;
                    }
                }
            }
        }

        self.log(format!("总结单数据填充完成，共 {} 行", data.len()));
        Ok(())
    }

    /// 处理运单信息工作表
    fn process_waybill_sheet(
        &mut self,
        workbook: &mut Workbook,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理运单信息工作表".to_string());

        let mut worksheet = workbook.add_worksheet();
        worksheet
            .set_name("运单信息")
            .map_err(|e| CommandError::new(format!("设置工作表名称失败: {}", e), "ERROR"))?;

        let mappings = Self::get_field_mappings();
        let waybill_mapping = mappings.get("运单信息").unwrap();

        // 写入表头
        let headers: Vec<&str> = waybill_mapping.values().copied().collect();
        for (col_idx, header) in headers.iter().enumerate() {
            worksheet
                .write_string(0, col_idx as u16, *header)?;
        }

        // 写入数据
        for (row_idx, row) in data.rows.iter().enumerate() {
            for (data_field, template_field) in waybill_mapping.iter() {
                if let Some(value) = row.get(data_field) {
                    if let Some(col_idx) = headers.iter().position(|&h| h == *template_field) {
                        self.write_cell_value(
                            &mut worksheet,
                            (row_idx + 1) as u32,
                            col_idx as u16,
                            value,
                        )?;
                    }
                }
            }
        }

        self.log(format!("运单信息数据填充完成，共 {} 行", data.len()));
        Ok(())
    }

    /// 处理统计工作表（按国家分组统计）
    fn process_statistics_sheet(
        &mut self,
        workbook: &mut Workbook,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理统计工作表".to_string());

        // 按国家分组统计
        let stats = self.group_by_country(data)?;

        let worksheet = workbook.add_worksheet();
        worksheet
            .set_name("统计")
            .map_err(|e| CommandError::new(format!("设置工作表名称失败: {}", e), "ERROR"))?;

        // 写入表头
        worksheet.write_string(0, 0, "Destination")?;
        worksheet.write_string(0, 1, "Package")?;
        worksheet.write_string(0, 2, "G.W")?;
        worksheet.write_string(0, 3, "V.W")?;

        // 写入统计数据
        let mut sorted_stats: Vec<_> = stats.values().collect();
        sorted_stats.sort_by(|a, b| a.country_code.cmp(&b.country_code));

        for (row_idx, stat) in sorted_stats.iter().enumerate() {
            let row = (row_idx + 1) as u32;
            worksheet.write_string(row, 0, &stat.country_code)?;
            worksheet.write_number(row, 1, stat.package_count as f64)?;
            worksheet.write_number(row, 2, stat.gross_weight)?;
            worksheet.write_number(row, 3, stat.volume_weight)?;
        }

        self.log(format!("统计数据填充完成，共 {} 个国家", stats.len()));
        Ok(())
    }

    /// 处理德国邮编工作表
    fn process_german_zipcode_sheet(
        &mut self,
        workbook: &mut Workbook,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理德国邮编工作表".to_string());

        // 筛选德国数据并按邮编统计
        let stats = self.group_by_german_zipcode(data)?;

        let worksheet = workbook.add_worksheet();
        worksheet
            .set_name("德国邮编")
            .map_err(|e| CommandError::new(format!("设置工作表名称失败: {}", e), "ERROR"))?;

        // 写入表头
        worksheet.write_string(0, 0, "zipcode")?;
        worksheet.write_string(0, 1, "PCS")?;
        worksheet.write_string(0, 2, "GW")?;
        worksheet.write_string(0, 3, "VW")?;
        worksheet.write_string(0, 4, "country")?;

        // 写入统计数据
        let mut sorted_stats: Vec<_> = stats.values().collect();
        sorted_stats.sort_by(|a, b| a.zipcode.cmp(&b.zipcode));

        for (row_idx, stat) in sorted_stats.iter().enumerate() {
            let row = (row_idx + 1) as u32;
            worksheet.write_string(row, 0, &stat.zipcode)?;
            worksheet.write_number(row, 1, stat.package_count as f64)?;
            worksheet.write_number(row, 2, stat.gross_weight)?;
            worksheet.write_number(row, 3, stat.volume_weight)?;
            worksheet.write_string(row, 4, "DE")?;
        }

        self.log(format!(
            "德国邮编数据填充完成，共 {} 个邮编",
            stats.len()
        ));
        Ok(())
    }

    /// 处理子单号工作表
    fn process_sub_order_sheet(
        &mut self,
        workbook: &mut Workbook,
        detail_data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理子单号工作表".to_string());

        let mut worksheet = workbook.add_worksheet();
        worksheet
            .set_name("子单号")
            .map_err(|e| CommandError::new(format!("设置工作表名称失败: {}", e), "ERROR"))?;

        // 写入表头
        worksheet.write_string(0, 0, "参考号\n（Reference NO)")?;
        worksheet.write_string(0, 1, "UPS 子单号\n(Tracking Number)")?;

        // 写入数据
        for (row_idx, row) in detail_data.rows.iter().enumerate() {
            let row_num = (row_idx + 1) as u32;

            if let Some(customer_no) = row.get("客户单号") {
                self.write_cell_value(&mut worksheet, row_num, 0, customer_no)?;
            }

            if let Some(sub_tracking_no) = row.get("子转单号") {
                // 确保子转单号以文本格式写入
                worksheet.write_string(row_num, 1, &sub_tracking_no.to_string())?;
            }
        }

        self.log(format!(
            "子单号数据填充完成，共 {} 行",
            detail_data.len()
        ));
        Ok(())
    }

    /// 按国家分组统计
    fn group_by_country(
        &self,
        data: &ExcelDataFrame,
    ) -> Result<HashMap<String, CountryStats>, CommandError> {
        let mut stats: HashMap<String, CountryStats> = HashMap::new();

        for row in &data.rows {
            // 获取国家代码
            let country_code = row
                .get("国家二字码")
                .map(|v| v.to_string().trim().to_uppercase())
                .unwrap_or_default();

            if country_code.is_empty() || country_code == "NAN" || country_code == "NONE" {
                continue;
            }

            // 获取数值
            let packages = row
                .get("件数")
                .and_then(|v| v.to_i64())
                .unwrap_or(0);

            let gross_weight = row
                .get("收货实重")
                .and_then(|v| v.to_f64())
                .unwrap_or(0.0);

            let volume_weight = row
                .get("收货材积重")
                .and_then(|v| v.to_f64())
                .unwrap_or(0.0);

            // 累加统计
            stats
                .entry(country_code.clone())
                .or_insert_with(|| CountryStats::new(country_code))
                .add(packages, gross_weight, volume_weight);
        }

        Ok(stats)
    }

    /// 按德国邮编分组统计
    fn group_by_german_zipcode(
        &self,
        data: &ExcelDataFrame,
    ) -> Result<HashMap<String, ZipcodeStats>, CommandError> {
        let mut stats: HashMap<String, ZipcodeStats> = HashMap::new();

        for row in &data.rows {
            // 只处理德国数据
            let country_code = row
                .get("国家二字码")
                .map(|v| v.to_string().trim().to_uppercase())
                .unwrap_or_default();

            if country_code != "DE" {
                continue;
            }

            // 获取邮编
            let zipcode = row
                .get("收件人邮编")
                .map(|v| v.to_string().trim().to_string())
                .unwrap_or_default();

            if zipcode.is_empty() || zipcode == "NAN" || zipcode == "NONE" {
                continue;
            }

            // 获取数值
            let packages = row
                .get("件数")
                .and_then(|v| v.to_i64())
                .unwrap_or(0);

            let gross_weight = row
                .get("收货实重")
                .and_then(|v| v.to_f64())
                .unwrap_or(0.0);

            let volume_weight = row
                .get("收货材积重")
                .and_then(|v| v.to_f64())
                .unwrap_or(0.0);

            // 累加统计
            stats
                .entry(zipcode.to_string())
                .or_insert_with(|| ZipcodeStats::new(zipcode.to_string()))
                .add(packages, gross_weight, volume_weight);
        }

        Ok(stats)
    }

    /// 写入单元格值
    fn write_cell_value(
        &self,
        worksheet: &mut Worksheet,
        row: u32,
        col: u16,
        value: &CellValue,
    ) -> Result<(), CommandError> {
        match value {
            CellValue::Empty => Ok(()),
            CellValue::String(s) => {
                worksheet.write_string(row, col, s)?;
                Ok(())
            }
            CellValue::Number(n) => {
                worksheet.write_number(row, col, *n)?;
                Ok(())
            }
            CellValue::Integer(i) => {
                worksheet.write_number(row, col, *i as f64)?;
                Ok(())
            }
            CellValue::Boolean(b) => {
                worksheet.write_boolean(row, col, *b)?;
                Ok(())
            }
        }
    }
}
