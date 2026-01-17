use crate::commands::error::CommandError;
use crate::models::ups_dpd::{CellValue, ExcelDataFrame, ExcelRow, CountryStats, ZipcodeStats};
use std::collections::HashMap;
use std::path::Path;
use umya_spreadsheet::*;

// 简化的 hashmap 宏 - 必须在使用前定义
macro_rules! hashmap {
    ($($key:expr => $val:expr),* $(,)?) => {{
        let mut map = HashMap::new();
        $(map.insert($key, $val);)*
        map
    }};
}

pub struct UpsProcessorV2 {
    logs: Vec<String>,
}

impl UpsProcessorV2 {
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

    /// 处理 UPS 数据 - 使用 umya-spreadsheet 保留模板
    pub fn process_ups_data(
        &mut self,
        main_data: &ExcelDataFrame,
        detail_data: Option<&ExcelDataFrame>,
        template_path: &Path,
        output_path: &Path,
    ) -> Result<(), CommandError> {
        self.log("开始处理 UPS 数据（使用模板）".to_string());

        // 1. 加载模板文件
        let mut workbook = reader::xlsx::read(template_path)
            .map_err(|e| CommandError::new(format!("无法加载模板: {}", e), "ERROR"))?;

        self.log(format!("成功加载模板: {:?}", template_path));

        // 2. 处理各个工作表
        self.process_summary_sheet(&mut workbook, main_data)?;
        self.process_waybill_sheet(&mut workbook, main_data)?;
        self.process_statistics_sheet(&mut workbook, main_data)?;
        self.process_german_zipcode_sheet(&mut workbook, main_data)?;

        if let Some(detail) = detail_data {
            self.process_sub_order_sheet(&mut workbook, detail)?;
        }

        // 3. 保存文件
        writer::xlsx::write(&workbook, output_path)
            .map_err(|e| CommandError::new(format!("保存文件失败: {}", e), "ERROR"))?;

        self.log(format!("UPS 数据处理完成: {:?}", output_path));
        Ok(())
    }

    /// 处理总结单工作表
    fn process_summary_sheet(
        &mut self,
        workbook: &mut Spreadsheet,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理总结单工作表".to_string());

        // 查找工作表
        let sheet = self.find_sheet(workbook, &["总结单", "Summary"])?;
        let sheet_name = sheet.get_name().to_string();

        // 获取表头映射
        let header_mapping = self.get_header_mapping(sheet)?;
        self.log(format!("表头映射: {:?}", header_mapping));

        // 查找第一个空行
        let first_empty_row = self.find_first_empty_row(sheet)?;
        self.log(format!("第一个空行: {}", first_empty_row));

        // 字段映射
        let field_mappings = Self::get_summary_field_mappings();

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

        self.log(format!("总结单填充完成，共 {} 行", data.rows.len()));
        Ok(())
    }

    /// 处理运单信息工作表
    fn process_waybill_sheet(
        &mut self,
        workbook: &mut Spreadsheet,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理运单信息工作表".to_string());

        let sheet = self.find_sheet(workbook, &["运单信息", "Waybill"])?;
        let sheet_name = sheet.get_name().to_string();
        let header_mapping = self.get_header_mapping(sheet)?;
        let first_empty_row = self.find_first_empty_row(sheet)?;

        let field_mappings = Self::get_waybill_field_mappings();

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

        self.log(format!("运单信息填充完成，共 {} 行", data.rows.len()));
        Ok(())
    }

    /// 处理统计工作表（按国家分组）
    fn process_statistics_sheet(
        &mut self,
        workbook: &mut Spreadsheet,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理统计工作表".to_string());

        // 1. 按国家分组统计
        let stats = self.group_by_country(data)?;

        // 2. 查找工作表
        let sheet = self.find_sheet(workbook, &["统计", "Statistics"])?;
        let sheet_name = sheet.get_name().to_string();
        let header_mapping = self.get_header_mapping(sheet)?;
        let first_empty_row = self.find_first_empty_row(sheet)?;

        // 3. 字段映射
        let field_mapping = hashmap![
            "country" => "Destination",
            "package_count" => "Package",
            "gross_weight" => "G.W",
            "volume_weight" => "V.W"
        ];

        // 4. 排序并填充
        let mut stats_vec: Vec<_> = stats.values().collect();
        stats_vec.sort_by(|a, b| a.country_code.cmp(&b.country_code));

        for (row_idx, stat) in stats_vec.iter().enumerate() {
            let target_row = first_empty_row + row_idx as u32;
            let sheet_mut = workbook.get_sheet_by_name_mut(&sheet_name)
                .ok_or_else(|| CommandError::new("工作表不存在", "ERROR"))?;

            // 国家
            if let Some(col) = header_mapping.get("Destination") {
                Self::write_string(sheet_mut, target_row, *col, &stat.country_code)?;
            }
            // 件数
            if let Some(col) = header_mapping.get("Package") {
                Self::write_number(sheet_mut, target_row, *col, stat.package_count as f64)?;
            }
            // 实重
            if let Some(col) = header_mapping.get("G.W") {
                Self::write_number(sheet_mut, target_row, *col, stat.gross_weight)?;
            }
            // 材重
            if let Some(col) = header_mapping.get("V.W") {
                Self::write_number(sheet_mut, target_row, *col, stat.volume_weight)?;
            }
        }

        self.log(format!("统计数据填充完成，共 {} 个国家", stats_vec.len()));
        Ok(())
    }

    /// 处理德国邮编工作表
    fn process_german_zipcode_sheet(
        &mut self,
        workbook: &mut Spreadsheet,
        data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理德国邮编工作表".to_string());

        // 1. 筛选德国数据
        let de_data = self.filter_by_country(data, "DE")?;

        // 2. 按邮编分组统计
        let zipcode_stats = self.group_by_zipcode(&de_data)?;

        // 3. 查找工作表
        let sheet = self.find_sheet(workbook, &["德国邮编", "German Zipcode"])?;
        let sheet_name = sheet.get_name().to_string();
        let header_mapping = self.get_header_mapping(sheet)?;
        let first_empty_row = self.find_first_empty_row(sheet)?;

        // 4. 排序并填充
        let mut stats_vec: Vec<_> = zipcode_stats.values().collect();
        stats_vec.sort_by(|a, b| a.zipcode.cmp(&b.zipcode));

        for (row_idx, stat) in stats_vec.iter().enumerate() {
            let target_row = first_empty_row + row_idx as u32;
            let sheet_mut = workbook.get_sheet_by_name_mut(&sheet_name)
                .ok_or_else(|| CommandError::new("工作表不存在", "ERROR"))?;

            // 邮编
            if let Some(col) = header_mapping.get("zipcode") {
                Self::write_string(sheet_mut, target_row, *col, &stat.zipcode)?;
            }
            // 件数
            if let Some(col) = header_mapping.get("PCS") {
                Self::write_number(sheet_mut, target_row, *col, stat.package_count as f64)?;
            }
            // 实重
            if let Some(col) = header_mapping.get("GW") {
                Self::write_number(sheet_mut, target_row, *col, stat.gross_weight)?;
            }
            // 材重
            if let Some(col) = header_mapping.get("VW") {
                Self::write_number(sheet_mut, target_row, *col, stat.volume_weight)?;
            }
            // 国家
            if let Some(col) = header_mapping.get("country") {
                Self::write_string(sheet_mut, target_row, *col, "DE")?;
            }
        }

        self.log(format!("德国邮编填充完成，共 {} 个邮编", stats_vec.len()));
        Ok(())
    }

    /// 处理子单号工作表
    fn process_sub_order_sheet(
        &mut self,
        workbook: &mut Spreadsheet,
        detail_data: &ExcelDataFrame,
    ) -> Result<(), CommandError> {
        self.log("处理子单号工作表".to_string());

        let sheet = self.find_sheet(workbook, &["子单号", "Sub Order Number"])?;
        let sheet_name = sheet.get_name().to_string();
        let header_mapping = self.get_header_mapping(sheet)?;
        let first_empty_row = self.find_first_empty_row(sheet)?;

        let field_mappings = Self::get_sub_order_field_mappings();

        for (row_idx, row_data) in detail_data.rows.iter().enumerate() {
            let target_row = first_empty_row + row_idx as u32;

            for (data_field, template_field) in &field_mappings {
                if let Some(col_idx) = header_mapping.get(template_field.as_str()) {
                    if let Some(value) = row_data.get(data_field) {
                        let sheet_mut = workbook.get_sheet_by_name_mut(&sheet_name)
                            .ok_or_else(|| CommandError::new("工作表不存在", "ERROR"))?;

                        // 确保子单号以字符串格式写入
                        let value_to_write = if data_field == "子转单号" {
                            CellValue::String(value.to_string())
                        } else {
                            value.clone()
                        };

                        Self::write_cell_value(sheet_mut, target_row, *col_idx, &value_to_write)?;
                    }
                }
            }
        }

        self.log(format!("子单号填充完成，共 {} 行", detail_data.rows.len()));
        Ok(())
    }

    // ==================== 辅助方法 ====================

    /// 查找工作表（支持多个可能的名称）
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

    /// 获取表头映射（表头名 -> 列索引）
    fn get_header_mapping(&self, sheet: &Worksheet) -> Result<HashMap<String, u32>, CommandError> {
        let mut mapping = HashMap::new();

        // 假设表头在第1行，尝试读取前50列
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

    /// 按国家分组统计
    fn group_by_country(&self, data: &ExcelDataFrame) -> Result<HashMap<String, CountryStats>, CommandError> {
        let mut stats: HashMap<String, CountryStats> = HashMap::new();

        for row in &data.rows {
            let country = row.get("国家二字码")
                .map(|v| v.to_string().trim().to_uppercase())
                .filter(|s| !s.is_empty() && s != "NAN")
                .unwrap_or_default();

            if country.is_empty() {
                continue;
            }

            let stat = stats.entry(country.clone()).or_insert_with(|| CountryStats {
                country_code: country.clone(),
                package_count: 0,
                gross_weight: 0.0,
                volume_weight: 0.0,
            });

            // 累加件数
            if let Some(count) = row.get("件数").and_then(|v| v.to_i64()) {
                stat.package_count += count;
            }

            // 累加实重
            if let Some(weight) = row.get("收货实重").and_then(|v| v.to_f64()) {
                stat.gross_weight += weight;
            }

            // 累加材重
            if let Some(weight) = row.get("收货材积重").and_then(|v| v.to_f64()) {
                stat.volume_weight += weight;
            }
        }

        Ok(stats)
    }

    /// 筛选指定国家的数据
    fn filter_by_country(&self, data: &ExcelDataFrame, country_code: &str) -> Result<ExcelDataFrame, CommandError> {
        let country_upper = country_code.to_uppercase();
        let filtered_rows: Vec<ExcelRow> = data.rows.iter()
            .filter(|row| {
                row.get("国家二字码")
                    .map(|v| v.to_string().trim().to_uppercase() == country_upper)
                    .unwrap_or(false)
            })
            .cloned()
            .collect();

        Ok(ExcelDataFrame {
            columns: data.columns.clone(),
            rows: filtered_rows,
        })
    }

    /// 按邮编分组统计
    fn group_by_zipcode(&self, data: &ExcelDataFrame) -> Result<HashMap<String, ZipcodeStats>, CommandError> {
        let mut stats: HashMap<String, ZipcodeStats> = HashMap::new();

        for row in &data.rows {
            let zipcode = row.get("收件人邮编")
                .map(|v| v.to_string().trim().to_string())
                .filter(|s| !s.is_empty() && s != "nan")
                .unwrap_or_default();

            if zipcode.is_empty() {
                continue;
            }

            let stat = stats.entry(zipcode.clone()).or_insert_with(|| ZipcodeStats {
                zipcode: zipcode.clone(),
                package_count: 0,
                gross_weight: 0.0,
                volume_weight: 0.0,
            });

            if let Some(count) = row.get("件数").and_then(|v| v.to_i64()) {
                stat.package_count += count;
            }

            if let Some(weight) = row.get("收货实重").and_then(|v| v.to_f64()) {
                stat.gross_weight += weight;
            }

            if let Some(weight) = row.get("收货材积重").and_then(|v| v.to_f64()) {
                stat.volume_weight += weight;
            }
        }

        Ok(stats)
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
        // umya-spreadsheet 需要将数字转为字符串
        sheet.get_cell_mut((col, row)).set_value(value.to_string());
        Ok(())
    }

    // ==================== 字段映射 ====================

    fn get_summary_field_mappings() -> HashMap<String, String> {
        hashmap![
            "转单号".to_string() => "Tracking Number".to_string(),
            "件数".to_string() => "Packages".to_string(),
            "收货实重".to_string() => "G.W".to_string(),
            "收货材积重".to_string() => "V.G".to_string(),
            "收件人邮编".to_string() => "ZIP code".to_string(),
            "国家二字码".to_string() => "country".to_string()
        ]
    }

    fn get_waybill_field_mappings() -> HashMap<String, String> {
        hashmap![
            "客户单号".to_string() => "参考号\n（Reference NO)".to_string(),
            "件数".to_string() => "件数\n(PCS)".to_string(),
            "收货实重".to_string() => "实重\n(Kg)".to_string(),
            "收货材积重".to_string() => "材重\n(Kg)".to_string(),
            "国家二字码".to_string() => "目的地\n(Destination)".to_string(),
            "转单号".to_string() => "UPS主运单号\n(Tracking Number)".to_string(),
            "柜号".to_string() => "提单号（集装箱/空运）".to_string()
        ]
    }

    fn get_sub_order_field_mappings() -> HashMap<String, String> {
        hashmap![
            "客户单号".to_string() => "参考号\n（Reference NO)".to_string(),
            "子转单号".to_string() => "UPS 子单号\n(Tracking Number)".to_string()
        ]
    }
}
