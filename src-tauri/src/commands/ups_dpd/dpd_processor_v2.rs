use crate::commands::error::CommandError;
use crate::models::ups_dpd::{CellValue, ExcelDataFrame, ExcelRow};
use std::collections::HashMap;
use std::path::Path;
use umya_spreadsheet::*;

// 简化的 hashmap 宏
macro_rules! hashmap {
    ($($key:expr => $val:expr),* $(,)?) => {{
        let mut map = HashMap::new();
        $(map.insert($key, $val);)*
        map
    }};
}

pub struct DpdProcessorV2 {
    logs: Vec<String>,
}

impl DpdProcessorV2 {
    pub fn new() -> Self {
        Self { logs: Vec::new() }
    }

    pub fn get_logs(&self) -> Vec<String> {
        self.logs.clone()
    }

    fn log(&mut self, message: String) {
        println!("{}", message);
        self.logs.push(message);
    }

    /// 处理 DPD 数据 - 使用 umya-spreadsheet 保留模板
    pub fn process_dpd_data(
        &mut self,
        main_data: &ExcelDataFrame,
        detail_data: Option<&ExcelDataFrame>,
        template_path: &Path,
        output_path: &Path,
    ) -> Result<(), CommandError> {
        self.log("开始处理 DPD 数据（使用模板）".to_string());

        // 1. 加载模板文件
        let mut workbook = reader::xlsx::read(template_path)
            .map_err(|e| CommandError::new(format!("无法加载模板: {}", e), "ERROR"))?;

        self.log(format!("成功加载模板: {:?}", template_path));

        // 2. 处理各个工作表
        self.process_list_sheet(&mut workbook, main_data)?;
        self.process_summary_sheet(&mut workbook, main_data)?;

        if let Some(detail) = detail_data {
            self.process_sub_order_sheet(&mut workbook, detail, main_data)?;
        }

        // 3. 保存文件
        writer::xlsx::write(&workbook, output_path)
            .map_err(|e| CommandError::new(format!("保存文件失败: {}", e), "ERROR"))?;

        self.log(format!("DPD 数据处理完成: {:?}", output_path));
        Ok(())
    }

    /// 处理运单清单工作表
    fn process_list_sheet(
        &mut self,
        workbook: &mut Spreadsheet,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理运单清单工作表".to_string());

        // 查找工作表
        let sheet = self.find_sheet(workbook, &["List （运单清单）", "List", "运单清单"])?;
        let sheet_name = sheet.get_name().to_string();

        // 获取表头映射
        let header_mapping = self.get_header_mapping(sheet)?;

        // 查找第一个空行
        let first_empty_row = self.find_first_empty_row(sheet)?;

        // 字段映射
        let field_mappings = Self::get_list_field_mappings();

        // 填充数据
        for (row_idx, row_data) in data.rows.iter().enumerate() {
            let target_row = first_empty_row + row_idx as u32;

            for (data_field, template_field) in &field_mappings {
                if let Some(col_idx) = header_mapping.get(template_field.as_str()) {
                    if let Some(value) = row_data.get(data_field) {
                        let sheet_mut = workbook.get_sheet_by_name_mut(&sheet_name)
                            .ok_or_else(|| CommandError::new("工作表不存在", "ERROR"))?;

                        Self::write_cell_value(sheet_mut, target_row, *col_idx, value)?;
                    }
                }
            }
        }

        self.log(format!("运单清单填充完成，共 {} 行", data.rows.len()));
        Ok(())
    }

    /// 处理总结单工作表（最复杂）
    fn process_summary_sheet(
        &mut self,
        workbook: &mut Spreadsheet,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理总结单工作表".to_string());

        let sheet = self.find_sheet(workbook, &["总结单", "Summary"])?;
        let sheet_name = sheet.get_name().to_string();

        // 配置参数
        const DATA_ROW: u32 = 4;
        const DE_START_COL: u32 = 6;  // F列
        const OTHER_COUNTRIES_START_COL: u32 = 19;  // S列
        const OTHER_COL: u32 = 26;  // Z列
        const TOTAL_COL: u32 = 27;  // AA列

        // 1. 按国家分类数据
        let classified_data = self.classify_countries_data(data)?;

        // 2. 统计 DE 国家的13个特定邮编
        if let Some(de_data) = classified_data.get("DE") {
            self.fill_de_postcode_stats(
                workbook,
                &sheet_name,
                de_data,
                DATA_ROW,
                DE_START_COL,
            )?;
        }

        // 3. 统计其他7个国家（FR, IT, ES, NL, PL, CZ, BE）
        let other_countries = vec!["FR", "IT", "ES", "NL", "PL", "CZ", "BE"];
        let mut total_count = 0i64;

        for (i, country) in other_countries.iter().enumerate() {
            let count = classified_data.get(*country)
                .map(|rows| self.count_pieces(rows))
                .unwrap_or(0);

            let sheet_mut = workbook.get_sheet_by_name_mut(&sheet_name)
                .ok_or_else(|| CommandError::new("工作表不存在", "ERROR"))?;

            let col_num = OTHER_COUNTRIES_START_COL + i as u32;
            Self::write_number(sheet_mut, DATA_ROW, col_num, count as f64)?;

            total_count += count;
            self.log(format!("国家 {}: {} 件", country, count));
        }

        // 4. 统计 Other 类别
        let other_count = classified_data.get("other")
            .map(|rows| self.count_pieces(rows))
            .unwrap_or(0);

        let sheet_mut = workbook.get_sheet_by_name_mut(&sheet_name)
            .ok_or_else(|| CommandError::new("工作表不存在", "ERROR"))?;

        Self::write_number(sheet_mut, DATA_ROW, OTHER_COL, other_count as f64)?;
        total_count += other_count;
        self.log(format!("Other 类别: {} 件", other_count));

        // 5. 计算并填充总计
        // 包括 DE 国家的件数
        if let Some(de_data) = classified_data.get("DE") {
            total_count += self.count_pieces(de_data);
        }

        let sheet_mut = workbook.get_sheet_by_name_mut(&sheet_name)
            .ok_or_else(|| CommandError::new("工作表不存在", "ERROR"))?;

        Self::write_number(sheet_mut, DATA_ROW, TOTAL_COL, total_count as f64)?;
        self.log(format!("总计: {} 件", total_count));

        self.log("总结单填充完成".to_string());
        Ok(())
    }

    /// 填充 DE 国家的13个特定邮编统计
    fn fill_de_postcode_stats(
        &mut self,
        workbook: &mut Spreadsheet,
        sheet_name: &str,
        de_data: &Vec<ExcelRow>,
        data_row: u32,
        start_col: u32,
    ) -> Result<(), CommandError> {
        let de_postcodes = Self::get_de_special_postcodes();

        for (i, postcode) in de_postcodes.iter().enumerate() {
            let count = self.count_postcode_pieces(de_data, postcode);

            let sheet_mut = workbook.get_sheet_by_name_mut(sheet_name)
                .ok_or_else(|| CommandError::new("工作表不存在", "ERROR"))?;

            let col_num = start_col + i as u32;
            Self::write_number(sheet_mut, data_row, col_num, count as f64)?;

            self.log(format!("DE 邮编 {}: {} 件", postcode, count));
        }

        Ok(())
    }

    /// 处理子单号工作表（双数据源）
    fn process_sub_order_sheet(
        &mut self,
        workbook: &mut Spreadsheet,
        detail_data: &ExcelDataFrame,
        main_data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理子单号工作表".to_string());

        let sheet = self.find_sheet(workbook, &["子单号", "Sub Order Number"])?;
        let sheet_name = sheet.get_name().to_string();
        let header_mapping = self.get_header_mapping(sheet)?;
        let first_empty_row = self.find_first_empty_row(sheet)?;

        // 字段映射
        let detail_mappings = Self::get_sub_order_detail_mappings();
        let list_mappings = Self::get_sub_order_list_mappings();

        // 建立 main_data 的客户单号索引
        let mut main_data_index: HashMap<String, &ExcelRow> = HashMap::new();
        for row in &main_data.rows {
            if let Some(customer_no) = row.get("客户单号") {
                let key = customer_no.to_string().trim().to_string();
                main_data_index.insert(key, row);
            }
        }

        // 逐行填充
        for (row_idx, detail_row) in detail_data.rows.iter().enumerate() {
            let target_row = first_empty_row + row_idx as u32;

            // 1. 填充 detail 数据源的字段
            for (data_field, template_field) in &detail_mappings {
                if let Some(col_idx) = header_mapping.get(template_field.as_str()) {
                    if let Some(value) = detail_row.get(data_field) {
                        let sheet_mut = workbook.get_sheet_by_name_mut(&sheet_name)
                            .ok_or_else(|| CommandError::new("工作表不存在", "ERROR"))?;

                        // 确保单号以字符串格式写入
                        let value_to_write = if data_field == "子转单号" {
                            CellValue::String(value.to_string())
                        } else {
                            value.clone()
                        };

                        Self::write_cell_value(sheet_mut, target_row, *col_idx, &value_to_write)?;
                    }
                }
            }

            // 2. 根据客户单号匹配 list 数据源
            if let Some(customer_no) = detail_row.get("客户单号") {
                let key = customer_no.to_string().trim().to_string();

                if let Some(main_row) = main_data_index.get(&key) {
                    for (data_field, template_field) in &list_mappings {
                        if let Some(col_idx) = header_mapping.get(template_field.as_str()) {
                            if let Some(value) = main_row.get(data_field) {
                                let sheet_mut = workbook.get_sheet_by_name_mut(&sheet_name)
                                    .ok_or_else(|| CommandError::new("工作表不存在", "ERROR"))?;

                                // 确保单号以字符串格式写入
                                let value_to_write = if data_field == "转单号" {
                                    CellValue::String(value.to_string())
                                } else {
                                    value.clone()
                                };

                                Self::write_cell_value(sheet_mut, target_row, *col_idx, &value_to_write)?;
                            }
                        }
                    }
                } else {
                    self.log(format!("警告: 未找到客户单号 {} 的匹配行", key));
                }
            }
        }

        self.log(format!("子单号填充完成，共 {} 行", detail_data.rows.len()));
        Ok(())
    }

    // ==================== 辅助方法 ====================

    /// 按国家分类数据
    fn classify_countries_data(&self, data: &ExcelDataFrame) -> Result<HashMap<String, Vec<ExcelRow>>, CommandError> {
        let supported_countries = vec!["DE", "FR", "IT", "ES", "NL", "PL", "CZ", "BE"];
        let de_postcodes = Self::get_de_special_postcodes();

        let mut classified: HashMap<String, Vec<ExcelRow>> = HashMap::new();
        let mut other: Vec<ExcelRow> = Vec::new();

        for row in &data.rows {
            let country = row.get("国家二字码")
                .map(|v| v.to_string().trim().to_uppercase())
                .unwrap_or_default();

            if country.is_empty() {
                continue;
            }

            if country == "DE" {
                // DE 国家特殊处理
                let postcode = row.get("收件人邮编")
                    .map(|v| v.to_string().trim().to_string())
                    .unwrap_or_default();

                if de_postcodes.contains(&postcode.as_str()) {
                    // 13个特定邮编
                    classified.entry("DE".to_string())
                        .or_insert_with(Vec::new)
                        .push(row.clone());
                } else {
                    // DE 其他邮编归入 other
                    other.push(row.clone());
                }
            } else if supported_countries.contains(&country.as_str()) {
                // 其他支持的国家
                classified.entry(country)
                    .or_insert_with(Vec::new)
                    .push(row.clone());
            } else {
                // 不支持的国家归入 other
                other.push(row.clone());
            }
        }

        classified.insert("other".to_string(), other);

        Ok(classified)
    }

    /// 统计指定邮编的件数
    fn count_postcode_pieces(&self, data: &Vec<ExcelRow>, postcode: &str) -> i64 {
        let mut total = 0i64;

        for row in data {
            let row_postcode = row.get("收件人邮编")
                .map(|v| v.to_string().trim().to_string())
                .unwrap_or_default();

            if row_postcode == postcode {
                if let Some(count) = row.get("件数").and_then(|v| v.to_i64()) {
                    total += count;
                }
            }
        }

        total
    }

    /// 统计件数总和
    fn count_pieces(&self, data: &Vec<ExcelRow>) -> i64 {
        let mut total = 0i64;

        for row in data {
            if let Some(count) = row.get("件数").and_then(|v| v.to_i64()) {
                total += count;
            }
        }

        total
    }

    /// 查找工作表
    fn find_sheet<'a>(
        &self,
        workbook: &'a Spreadsheet,
        possible_names: &[&str],
    ) -> Result<&'a Worksheet, CommandError> {
        for name in possible_names {
            if let Some(sheet) = workbook.get_sheet_by_name(name) {
                return Ok(sheet);
            }
        }

        // 如果都没找到，尝试使用第一个工作表
        workbook.get_sheet(&0)
            .ok_or_else(|| CommandError::new("找不到工作表", "ERROR"))
    }

    /// 获取表头映射
    fn get_header_mapping(&self, sheet: &Worksheet) -> Result<HashMap<String, u32>, CommandError> {
        let mut mapping = HashMap::new();

        // 假设表头在第1行
        for col_idx in 1..=50 {
            if let Some(cell) = sheet.get_cell((col_idx, 1)) {
                let value = cell.get_value();
                let header = value.trim();
                if !header.is_empty() {
                    mapping.insert(header.to_string(), col_idx);
                }
            }
        }

        Ok(mapping)
    }

    /// 查找第一个空行
    fn find_first_empty_row(&self, sheet: &Worksheet) -> Result<u32, CommandError> {
        let max_row = sheet.get_highest_row();
        let max_col = sheet.get_highest_column();

        for row in 1..=max_row + 10 {
            let mut is_empty = true;

            for col in 1..=max_col {
                if let Some(cell) = sheet.get_cell((col, row)) {
                    let value = cell.get_value();
                    if !value.trim().is_empty() {
                        is_empty = false;
                        break;
                    }
                }
            }

            if is_empty {
                return Ok(row);
            }
        }

        Ok(max_row + 1)
    }

    /// 写入单元格值
    fn write_cell_value(
        sheet: &mut Worksheet,
        row: u32,
        col: u32,
        value: &CellValue,
    ) -> Result<(), CommandError> {
        match value {
            CellValue::Empty => Ok(()),
            CellValue::String(s) => Self::write_string(sheet, row, col, s),
            CellValue::Number(n) => Self::write_number(sheet, row, col, *n),
            CellValue::Integer(i) => Self::write_number(sheet, row, col, *i as f64),
            CellValue::Boolean(b) => Self::write_string(sheet, row, col, &b.to_string()),
        }
    }

    fn write_string(sheet: &mut Worksheet, row: u32, col: u32, value: &str) -> Result<(), CommandError> {
        sheet.get_cell_mut((col, row)).set_value(value);
        Ok(())
    }

    fn write_number(sheet: &mut Worksheet, row: u32, col: u32, value: f64) -> Result<(), CommandError> {
        sheet.get_cell_mut((col, row)).set_value(value.to_string());
        Ok(())
    }

    // ==================== 配置数据 ====================

    /// DE 国家的13个特定邮编
    fn get_de_special_postcodes() -> Vec<&'static str> {
        vec![
            "4347", "6126", "14656", "21423", "36251",
            "39171", "44145", "47495", "56068", "59368",
            "67227", "75177", "90451"
        ]
    }

    /// 运单清单字段映射
    fn get_list_field_mappings() -> HashMap<String, String> {
        hashmap![
            "客户单号".to_string() => "Remark\n（箱唛 or  FBA ）".to_string(),
            "转单号".to_string() => "Tracking No".to_string(),
            "国家二字码".to_string() => "County".to_string(),
            "件数".to_string() => "PCS".to_string(),
            "收货实重".to_string() => "GW (kg)".to_string(),
            "收货材积重".to_string() => "VW（kg)".to_string(),
            "方数".to_string() => "Cubic Number(CBM)".to_string(),
            "收件人邮编".to_string() => "post Code".to_string()
        ]
    }

    /// 子单号 - detail 数据源字段映射
    fn get_sub_order_detail_mappings() -> HashMap<String, String> {
        hashmap![
            "客户单号".to_string() => "参考号 （必填）".to_string(),
            "子转单号".to_string() => "子单号（必填）".to_string()
        ]
    }

    /// 子单号 - list 数据源字段映射
    fn get_sub_order_list_mappings() -> HashMap<String, String> {
        hashmap![
            "转单号".to_string() => "主单号（必填）".to_string(),
            "收件人公司".to_string() => "公司".to_string(),
            "收件人姓名".to_string() => "收件人".to_string(),
            "方数".to_string() => "方数".to_string()
        ]
    }
}
