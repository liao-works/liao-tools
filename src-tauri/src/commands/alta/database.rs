use crate::core::database as core_db;
use crate::models::alta::{DatabaseInfo, ForbiddenItem};
use anyhow::{Context, Result};
use chrono::Local;
use log::{debug, info};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

/// 数据库管理器
pub struct DatabaseManager {
    conn: Connection,
}

impl DatabaseManager {
    /// 创建新的数据库管理器
    pub fn new(db_path: &Path) -> Result<Self> {
        // 使用 core 的数据库工具创建连接
        let conn = core_db::create_connection(db_path)
            .context("Failed to create database connection")?;

        let manager = Self { conn };
        manager.create_tables()?;

        Ok(manager)
    }

    /// 创建数据库表
    fn create_tables(&self) -> Result<()> {
        // 创建禁运商品表
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS forbidden_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hs_code TEXT NOT NULL,
                hs_code_4 TEXT,
                hs_code_6 TEXT,
                hs_code_8 TEXT,
                description TEXT,
                additional_info TEXT,
                source_url TEXT,
                created_at TEXT,
                updated_at TEXT
            )",
            [],
        ).context("Failed to create forbidden_items table")?;

        // 使用 core 的工具批量创建索引
        let indexes = [
            "CREATE INDEX IF NOT EXISTS idx_hs_code ON forbidden_items(hs_code)",
            "CREATE INDEX IF NOT EXISTS idx_hs_code_4 ON forbidden_items(hs_code_4)",
            "CREATE INDEX IF NOT EXISTS idx_hs_code_6 ON forbidden_items(hs_code_6)",
            "CREATE INDEX IF NOT EXISTS idx_hs_code_8 ON forbidden_items(hs_code_8)",
        ];
        core_db::create_indexes(&self.conn, &indexes)?;

        // 创建更新历史表
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS update_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                update_time TEXT NOT NULL,
                items_count INTEGER,
                status TEXT,
                error_message TEXT
            )",
            [],
        ).context("Failed to create update_history table")?;

        Ok(())
    }

    /// 更新禁运商品数据（清空后重新插入）
    pub fn update_forbidden_items(&self, items: Vec<ForbiddenItem>) -> Result<usize> {
        let tx = self.conn.unchecked_transaction()?;

        // 清空旧数据
        tx.execute("DELETE FROM forbidden_items", [])?;

        // 插入新数据
        let now = Local::now().to_rfc3339();
        let mut inserted = 0;

        for item in &items {
            tx.execute(
                "INSERT INTO forbidden_items (
                    hs_code, hs_code_4, hs_code_6, hs_code_8,
                    description, additional_info, source_url,
                    created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    item.hs_code,
                    item.hs_code_4,
                    item.hs_code_6,
                    item.hs_code_8,
                    item.description,
                    item.additional_info,
                    item.source_url,
                    now,
                    now
                ],
            )?;
            inserted += 1;
        }

        // 记录更新历史
        tx.execute(
            "INSERT INTO update_history (update_time, items_count, status) VALUES (?1, ?2, ?3)",
            params![now, inserted, "成功"],
        )?;

        tx.commit()?;

        info!("成功更新 {} 条禁运数据", inserted);
        Ok(inserted)
    }

    /// 根据HS编码搜索禁运商品
    pub fn search_by_hs_code(
        &self,
        hs_code: &str,
        match_length: Option<u8>,
    ) -> Result<Vec<ForbiddenItem>> {
        let query = match match_length {
            Some(4) => {
                let prefix = &hs_code[0..hs_code.len().min(4)];
                format!(
                    "SELECT * FROM forbidden_items WHERE hs_code_4 = '{}' LIMIT 100",
                    prefix
                )
            }
            Some(6) => {
                let prefix = &hs_code[0..hs_code.len().min(6)];
                format!(
                    "SELECT * FROM forbidden_items WHERE hs_code_6 = '{}' LIMIT 100",
                    prefix
                )
            }
            Some(8) => {
                let prefix = &hs_code[0..hs_code.len().min(8)];
                format!(
                    "SELECT * FROM forbidden_items WHERE hs_code_8 = '{}' LIMIT 100",
                    prefix
                )
            }
            _ => {
                // 完全匹配
                format!(
                    "SELECT * FROM forbidden_items WHERE hs_code = '{}' LIMIT 100",
                    hs_code
                )
            }
        };

        debug!("执行查询: {}", query);

        let mut stmt = self.conn.prepare(&query)?;
        let items = stmt
            .query_map([], |row| {
                Ok(ForbiddenItem {
                    id: row.get(0)?,
                    hs_code: row.get(1)?,
                    hs_code_4: row.get(2)?,
                    hs_code_6: row.get(3)?,
                    hs_code_8: row.get(4)?,
                    description: row.get(5)?,
                    additional_info: row.get(6)?,
                    source_url: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(items)
    }

    /// 获取最后更新时间
    pub fn get_last_update_time(&self) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT update_time FROM update_history 
             WHERE status = '成功' 
             ORDER BY update_time DESC 
             LIMIT 1",
        )?;

        let result = stmt.query_row([], |row| row.get(0)).optional()?;

        Ok(result)
    }

    /// 获取禁运商品总数
    pub fn get_total_count(&self) -> Result<i64> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM forbidden_items", [], |row| {
                row.get(0)
            })?;

        Ok(count)
    }

    /// 获取数据库信息
    pub fn get_database_info(&self, db_path: &Path) -> Result<DatabaseInfo> {
        let total_items = self.get_total_count()?;
        let last_update = self.get_last_update_time()?;
        
        let db_size = if db_path.exists() {
            std::fs::metadata(db_path)?.len()
        } else {
            0
        };

        Ok(DatabaseInfo {
            total_items,
            last_update,
            db_size,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_database_creation() {
        let temp_file = NamedTempFile::new().unwrap();
        let db = DatabaseManager::new(temp_file.path()).unwrap();
        
        // 验证表是否创建
        let count = db.get_total_count().unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_insert_and_search() {
        let temp_file = NamedTempFile::new().unwrap();
        let db = DatabaseManager::new(temp_file.path()).unwrap();

        let items = vec![ForbiddenItem {
            id: None,
            hs_code: "123456".to_string(),
            hs_code_4: "1234".to_string(),
            hs_code_6: "123456".to_string(),
            hs_code_8: "123456".to_string(),
            description: "Test Item".to_string(),
            additional_info: "Info".to_string(),
            source_url: "https://example.com".to_string(),
            created_at: None,
        }];

        db.update_forbidden_items(items).unwrap();

        let results = db.search_by_hs_code("123456", Some(4)).unwrap();
        assert_eq!(results.len(), 1);
    }
}
