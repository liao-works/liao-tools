use crate::core::database as core_db;
use crate::models::alta::{DatabaseInfo, ForbiddenItem};
use anyhow::{Context, Result};
use chrono::Local;
use log::{debug, info};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

// ============================================================================
// 数据库版本常量
// ============================================================================

/// 数据库版本管理
pub mod db_version {
    /// 初始版本（旧数据）
    pub const V1: i32 = 1;

    /// 新版本（支持复杂 HS 编码）
    pub const V2: i32 = 2;

    /// 当前目标版本
    pub const CURRENT: i32 = V2;
}

// ============================================================================
// 数据库管理器
// ============================================================================

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

        // 先创建表（如果不存在）
        manager.create_tables()?;

        // 执行迁移（如果需要）
        MigrationManager::migrate(&manager.conn)?;

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
            // 检查是否有新字段（v2+）
            let has_new_columns = MigrationManager::column_exists(&self.conn, "forbidden_items", "raw_text");

            if has_new_columns {
                // 使用 v2+ 的 SQL（包含新字段）
                tx.execute(
                    "INSERT INTO forbidden_items (
                        hs_code, hs_code_4, hs_code_6, hs_code_8,
                        description, additional_info, source_url,
                        created_at, updated_at, raw_text, has_exceptions
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        item.hs_code,
                        item.hs_code_4,
                        item.hs_code_6,
                        item.hs_code_8,
                        item.description,
                        item.additional_info,
                        item.source_url,
                        now,
                        now,
                        item.raw_text,
                        item.has_exceptions.map(|b| if b { 1 } else { 0 }),
                    ],
                )?;
            } else {
                // 使用 v1 的 SQL（向后兼容）
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
            }
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

        // 检查是否有新字段
        let has_new_columns = MigrationManager::column_exists(&self.conn, "forbidden_items", "raw_text");

        debug!("是否有新字段 (raw_text): {}", has_new_columns);

        let items = if has_new_columns {
            // v2+: 包含新字段
            // 列顺序：id(0), hs_code(1), hs_code_4(2), hs_code_6(3), hs_code_8(4),
            //         description(5), additional_info(6), source_url(7), created_at(8),
            //         updated_at(9), raw_text(10), has_exceptions(11)
            stmt.query_map([], |row| {
                let raw_text: Option<String> = row.get(10).ok();
                let has_exceptions_val: i32 = row.get(11).unwrap_or(0);

                debug!("查询到记录 - hs_code: {:?}, raw_text: {:?}, has_exceptions: {}",
                    row.get::<_, String>(1),
                    raw_text,
                    has_exceptions_val
                );

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
                    raw_text,
                    has_exceptions: Some(has_exceptions_val == 1),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        } else {
            // v1: 旧字段
            stmt.query_map([], |row| {
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
                    raw_text: None,
                    has_exceptions: None,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };

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

// ============================================================================
// 迁移管理器
// ============================================================================

/// 迁移管理器
pub struct MigrationManager;

impl MigrationManager {
    /// 检查并执行必要的迁移
    pub fn migrate(conn: &Connection) -> Result<()> {
        // 确保版本表存在
        Self::create_version_table(conn)?;

        let current_version = Self::get_current_version(conn)?;
        let target_version = db_version::CURRENT;

        if current_version < target_version {
            info!("数据库迁移: v{} → v{}", current_version, target_version);

            // 按顺序执行迁移
            if current_version < 2 {
                Self::migrate_v1_to_v2(conn)?;
            }

            // 更新版本号
            Self::set_version(conn, target_version, "支持复杂 HS 编码格式")?;

            info!("数据库迁移完成");
        } else {
            debug!("数据库已是最新版本 v{}", current_version);
        }

        Ok(())
    }

    /// 创建版本管理表
    fn create_version_table(conn: &Connection) -> Result<()> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS database_version (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL UNIQUE,
                version_name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )",
            [],
        )?;
        Ok(())
    }

    /// 获取当前数据库版本
    fn get_current_version(conn: &Connection) -> Result<i32> {
        let mut stmt = conn.prepare(
            "SELECT version FROM database_version ORDER BY version DESC LIMIT 1"
        )?;

        let version = stmt.query_row([], |row| row.get(0)).optional()?;

        match version {
            Some(v) => Ok(v),
            None => Ok(1), // 旧数据库，默认为 v1
        }
    }

    /// 设置数据库版本
    fn set_version(conn: &Connection, version: i32, version_name: &str) -> Result<()> {
        let now = Local::now().to_rfc3339();
        conn.execute(
            "INSERT INTO database_version (version, version_name, applied_at) VALUES (?1, ?2, ?3)",
            params![version, version_name, now]
        )?;
        Ok(())
    }

    /// v1 → v2 迁移：添加新字段
    fn migrate_v1_to_v2(conn: &Connection) -> Result<()> {
        info!("执行 v1 → v2 迁移...");

        // 添加新列（SQLite 不支持 IF NOT EXISTS，需要先检查）
        let columns_to_add = [
            ("raw_text", "TEXT"),
            ("has_exceptions", "INTEGER DEFAULT 0"),
        ];

        for (column, col_type) in &columns_to_add {
            if !Self::column_exists(conn, "forbidden_items", column) {
                let sql = format!("ALTER TABLE forbidden_items ADD COLUMN {} {}", column, col_type);
                conn.execute(&sql, [])?;
                info!("添加列: {}", column);
            } else {
                debug!("列已存在，跳过: {}", column);
            }
        }

        // 回填旧数据
        Self::backfill_v1_data(conn)?;

        Ok(())
    }

    /// 检查列是否存在
    fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
        let sql = format!("PRAGMA table_info({})", table);

        match conn.prepare(&sql) {
            Ok(mut stmt) => {
                let mut exists = false;
                let mut rows = stmt.query([]).unwrap();
                while let Ok(Some(row)) = rows.next() {
                    let col_name: String = row.get(1).unwrap_or_default();
                    if col_name == column {
                        exists = true;
                        break;
                    }
                }
                exists
            }
            Err(_) => false,
        }
    }

    /// 回填旧数据（标记为无例外）
    fn backfill_v1_data(conn: &Connection) -> Result<()> {
        info!("回填旧数据...");

        conn.execute(
            "UPDATE forbidden_items SET has_exceptions = 0 WHERE has_exceptions IS NULL",
            [],
        )?;

        Ok(())
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
            raw_text: None,
            has_exceptions: None,
        }];

        db.update_forbidden_items(items).unwrap();

        let results = db.search_by_hs_code("123456", Some(4)).unwrap();
        assert_eq!(results.len(), 1);
    }
}
