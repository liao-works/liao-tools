use crate::commands::error::CommandError;
use crate::models::ups_dpd::{CellValue, ExcelDataFrame};
use rust_xlsxwriter::{Workbook, Worksheet};
use std::collections::HashMap;
use std::path::Path;

/// DPD 数据处理器
pub struct DpdProcessor {
    logs: Vec<String>,
}

impl DpdProcessor {
    pub fn new() -> Self {
        DpdProcessor { logs: Vec::new() }
    }

    fn log(&mut self, message: String) {
        println!("{}", message);
        self.logs.push(message);
    }

    pub fn get_logs(&self) -> Vec<String> {
        self.logs.clone()
    }

    /// DPD 支持的国家列表
    fn supported_countries() -> Vec<&'static str> {
        vec!["DE", "FR", "IT", "ES", "NL", "PL", "CZ", "BE"]
    }

    /// 德国特定邮编列表（13个）
    fn de_special_postcodes() -> Vec<&'static str> {
        vec![
            "4347", "6126", "14656", "21423", "36251", "39171", "44145", "47495", "56068",
            "59368", "67227", "75177", "90451",
        ]
    }

    /// DPD 字段映射配置
    fn get_field_mappings() -> HashMap<&'static str, HashMap<&'static str, &'static str>> {
        let mut mappings = HashMap::new();

        // 运单清单映射
        let mut list = HashMap::new();
        list.insert("客户单号", "Remark\n（箱唛 or  FBA ）");
        list.insert("转单号", "Tracking No");
        list.insert("国家二字码", "County");
        list.insert("件数", "PCS");
        list.insert("收货实重", "GW (kg)");
        list.insert("收货材积重", "VW（kg)");
        list.insert("方数", "Cubic Number(CBM)");
        list.insert("收件人邮编", "post Code");
        mappings.insert("运单清单", list);

        // 子单号detail源映射
        let mut sub_order_detail = HashMap::new();
        sub_order_detail.insert("客户单号", "参考号 （必填）");
        sub_order_detail.insert("子转单号", "子单号（必填）");
        mappings.insert("子单号_detail", sub_order_detail);

        // 子单号list源映射
        let mut sub_order_list = HashMap::new();
        sub_order_list.insert("转单号", "主单号（必填）");
        sub_order_list.insert("收件人公司", "公司");
        sub_order_list.insert("收件人姓名", "收件人");
        sub_order_list.insert("方数", "方数");
        mappings.insert("子单号_list", sub_order_list);

        mappings
    }

    /// 处理 DPD 数据
    pub fn process_dpd_data(
        &mut self,
        main_data: &ExcelDataFrame,
        detail_data: Option<&ExcelDataFrame>,
        _template_path: &Path,
        output_path: &Path,
    ) -> Result<(), CommandError> {
        self.log("开始处理 DPD 数据".to_string());

        let mut workbook = Workbook::new();

        // 处理3个工作表
        self.process_list_sheet(&mut workbook, main_data)?;
        self.process_summary_sheet(&mut workbook, main_data)?;

        if let Some(detail) = detail_data {
            self.process_sub_order_sheet(&mut workbook, main_data, detail)?;
        }

        workbook
            .save(output_path)
            .map_err(|e| CommandError::new(format!("保存输出文件失败: {}", e), "ERROR"))?;

        self.log(format!("DPD 数据处理完成: {:?}", output_path));
        Ok(())
    }

    /// 处理运单清单工作表
    fn process_list_sheet(
        &mut self,
        workbook: &mut Workbook,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理运单清单工作表".to_string());

        let mut worksheet = workbook.add_worksheet();
        worksheet
            .set_name("List （运单清单）")
            .map_err(|e| CommandError::new(format!("设置工作表名称失败: {}", e), "ERROR"))?;

        let mappings = Self::get_field_mappings();
        let list_mapping = mappings.get("运单清单").unwrap();

        // 写入表头
        let headers: Vec<&str> = list_mapping.values().copied().collect();
        for (col_idx, header) in headers.iter().enumerate() {
            worksheet
                .write_string(0, col_idx as u16, *header)?;
        }

        // 写入数据
        for (row_idx, row) in data.rows.iter().enumerate() {
            for (data_field, template_field) in list_mapping.iter() {
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

        self.log(format!("运单清单数据填充完成，共 {} 行", data.len()));
        Ok(())
    }

    /// 处理总结单工作表（复杂的分类统计）
    fn process_summary_sheet(
        &mut self,
        workbook: &mut Workbook,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理总结单工作表".to_string());

        let worksheet = workbook.add_worksheet();
        worksheet
            .set_name("总结单")
            .map_err(|e| CommandError::new(format!("设置工作表名称失败: {}", e), "ERROR"))?;

        // 按国家分类数据
        let classified_data = self.classify_countries_data(data)?;

        // 创建表头（第3行，索引2）
        // F列开始：13个德国邮编
        let de_postcodes = Self::de_special_postcodes();
        let mut col_idx = 5; // F列（0-based 是5）
        for &postcode in &de_postcodes {
            worksheet.write_string(2, col_idx, postcode)?;
            col_idx += 1;
        }

        // S列开始：其他7个国家
        col_idx = 18; // S列（0-based 是18）
        let other_countries = vec!["FR", "IT", "ES", "NL", "PL", "CZ", "BE"];
        for &country in &other_countries {
            worksheet.write_string(2, col_idx, country)?;
            col_idx += 1;
        }

        // Z列：Other
        worksheet.write_string(2, 25, "Other")?;

        // AA列：Total
        worksheet.write_string(2, 26, "Total")?;

        // 填充数据（第4行，索引3）
        let data_row = 3u32;

        // 填充德国邮编统计
        col_idx = 5;
        if let Some(de_data) = classified_data.get("DE") {
            let de_stats = self.count_de_postcodes(de_data, &de_postcodes)?;
            for postcode in &de_postcodes {
                let count = de_stats.get(*postcode).unwrap_or(&0);
                worksheet.write_number(data_row, col_idx, *count as f64)?;
                col_idx += 1;
            }
        } else {
            // 如果没有德国数据，填充0
            for _ in &de_postcodes {
                worksheet.write_number(data_row, col_idx, 0.0)?;
                col_idx += 1;
            }
        }

        // 填充其他国家统计
        col_idx = 18;
        for country in &other_countries {
            let count = if let Some(country_data) = classified_data.get(*country) {
                self.count_packages(country_data)?
            } else {
                0
            };
            worksheet.write_number(data_row, col_idx, count as f64)?;
            col_idx += 1;
        }

        // 填充Other类别统计
        let other_count = if let Some(other_data) = classified_data.get("other") {
            self.count_packages(other_data)?
        } else {
            0
        };
        worksheet.write_number(data_row, 25, other_count as f64)?;

        // 计算总计
        let total_count: i64 = classified_data
            .values()
            .map(|data| self.count_packages(data).unwrap_or(0))
            .sum();
        worksheet.write_number(data_row, 26, total_count as f64)?;

        self.log("总结单数据填充完成".to_string());
        Ok(())
    }

    /// 处理子单号工作表（双数据源匹配）
    fn process_sub_order_sheet(
        &mut self,
        workbook: &mut Workbook,
        main_data: &ExcelDataFrame,
        detail_data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理子单号工作表".to_string());

        let mut worksheet = workbook.add_worksheet();
        worksheet
            .set_name("子单号")
            .map_err(|e| CommandError::new(format!("设置工作表名称失败: {}", e), "ERROR"))?;

        // 写入表头
        worksheet.write_string(0, 0, "参考号 （必填）")?;
        worksheet.write_string(0, 1, "子单号（必填）")?;
        worksheet.write_string(0, 2, "主单号（必填）")?;
        worksheet.write_string(0, 3, "公司")?;
        worksheet.write_string(0, 4, "收件人")?;
        worksheet.write_string(0, 5, "方数")?;

        // 创建主数据的客户单号索引（用于快速查找）
        let mut main_index: HashMap<String, usize> = HashMap::new();
        for (idx, row) in main_data.rows.iter().enumerate() {
            if let Some(customer_no) = row.get("客户单号") {
                main_index.insert(customer_no.to_string(), idx);
            }
        }

        // 遍历明细表数据
        for (row_idx, detail_row) in detail_data.rows.iter().enumerate() {
            let row_num = (row_idx + 1) as u32;

            // 从detail源获取数据
            if let Some(customer_no) = detail_row.get("客户单号") {
                worksheet.write_string(row_num, 0, &customer_no.to_string())?;

                // 从list源匹配数据
                if let Some(&main_idx) = main_index.get(&customer_no.to_string()) {
                    let main_row = &main_data.rows[main_idx];

                    if let Some(tracking_no) = main_row.get("转单号") {
                        worksheet.write_string(row_num, 2, &tracking_no.to_string())?;
                    }

                    if let Some(company) = main_row.get("收件人公司") {
                        worksheet.write_string(row_num, 3, &company.to_string())?;
                    }

                    if let Some(consignee) = main_row.get("收件人姓名") {
                        worksheet.write_string(row_num, 4, &consignee.to_string())?;
                    }

                    if let Some(cubic) = main_row.get("方数") {
                        self.write_cell_value(&mut worksheet, row_num, 5, cubic)?;
                    }
                }
            }

            if let Some(sub_tracking_no) = detail_row.get("子转单号") {
                worksheet.write_string(row_num, 1, &sub_tracking_no.to_string())?;
            }
        }

        self.log(format!(
            "子单号数据填充完成，共 {} 行",
            detail_data.len()
        ));
        Ok(())
    }

    /// 按国家分类数据
    fn classify_countries_data(
        &self,
        data: &ExcelDataFrame,
    ) -> Result<HashMap<String, ExcelDataFrame>, CommandError> {
        let supported = Self::supported_countries();
        let de_postcodes = Self::de_special_postcodes();

        let mut classified: HashMap<String, ExcelDataFrame> = HashMap::new();

        // 初始化所有分类
        for country in &supported {
            classified.insert(country.to_string(), ExcelDataFrame::new(data.columns.clone()));
        }
        classified.insert("other".to_string(), ExcelDataFrame::new(data.columns.clone()));

        // 分类数据
        for row in &data.rows {
            let country_code = row
                .get("国家二字码")
                .map(|v| v.to_string().trim().to_uppercase())
                .unwrap_or_default();

            if country_code.is_empty() || country_code == "NAN" {
                continue;
            }

            if country_code == "DE" {
                // 德国数据需要进一步判断邮编
                let zipcode = row
                    .get("收件人邮编")
                    .map(|v| v.to_string().trim().to_string())
                    .unwrap_or_default();

                if de_postcodes.contains(&zipcode.as_str()) {
                    // 特定邮编归入DE分类
                    classified.get_mut("DE").unwrap().add_row(row.clone());
                } else {
                    // 非特定邮编归入other
                    classified.get_mut("other").unwrap().add_row(row.clone());
                }
            } else if supported.contains(&country_code.as_str()) {
                // 其他支持的国家
                classified
                    .get_mut(&country_code)
                    .unwrap()
                    .add_row(row.clone());
            } else {
                // 不支持的国家归入other
                classified.get_mut("other").unwrap().add_row(row.clone());
            }
        }

        Ok(classified)
    }

    /// 统计德国特定邮编的件数
    fn count_de_postcodes(
        &self,
        de_data: &ExcelDataFrame,
        postcodes: &[&str],
    ) -> Result<HashMap<String, i64>, CommandError> {
        let mut counts = HashMap::new();

        for postcode in postcodes {
            counts.insert(postcode.to_string(), 0);
        }

        for row in &de_data.rows {
            let zipcode = row
                .get("收件人邮编")
                .map(|v| v.to_string().trim().to_string())
                .unwrap_or_default();

            if let Some(count) = counts.get_mut(zipcode.as_str()) {
                let packages = row
                    .get("件数")
                    .and_then(|v| v.to_i64())
                    .unwrap_or(0);
                *count += packages;
            }
        }

        Ok(counts)
    }

    /// 统计件数
    fn count_packages(&self, data: &ExcelDataFrame) -> Result<i64, CommandError> {
        let mut total = 0i64;

        for row in &data.rows {
            if let Some(packages) = row.get("件数").and_then(|v| v.to_i64()) {
                total += packages;
            }
        }

        Ok(total)
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
