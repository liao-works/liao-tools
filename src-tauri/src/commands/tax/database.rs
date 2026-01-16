use crate::core::database as core_db;
use crate::models::tax::TaxTariff;
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::path::PathBuf;
use tauri::Manager;

/// Tax数据库操作结构
pub struct TaxDatabase {
    conn: Connection,
}

impl TaxDatabase {
    /// 创建新的数据库实例
    pub fn new(app_handle: &tauri::AppHandle) -> Result<Self> {
        let db_path = Self::get_db_path(app_handle)?;
        
        // 使用 core 的数据库工具创建连接
        let conn = core_db::create_connection(&db_path)
            .context("Failed to create database connection")?;
        
        let db = Self { conn };
        db.create_tables()?;
        
        Ok(db)
    }
    
    /// 获取数据库路径
    fn get_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .context("Failed to get app data directory")?;
        
        Ok(app_data_dir.join("tariffs.db"))
    }
    
    /// 创建表结构
    fn create_tables(&self) -> Result<()> {
        // 创建tariffs表
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS tariffs (
                code TEXT PRIMARY KEY,
                description TEXT,
                rate TEXT,
                url TEXT,
                north_ireland_rate TEXT,
                north_ireland_url TEXT,
                other_rate TEXT,
                last_updated DATETIME
            )",
            [],
        )
        .context("Failed to create tariffs table")?;
        
        // 使用 core 的工具批量创建索引
        let indexes = [
            "CREATE INDEX IF NOT EXISTS idx_code ON tariffs(code)",
        ];
        core_db::create_indexes(&self.conn, &indexes)?;
        
        // 创建错误记录表
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS scrape_errors (
                code TEXT PRIMARY KEY,
                error_message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )
        .context("Failed to create scrape_errors table")?;
        
        Ok(())
    }
    
    /// 精确查询单个税率
    pub fn get_tariff(&self, code: &str) -> Result<Option<TaxTariff>> {
        let mut stmt = self.conn.prepare(
            "SELECT code, description, rate, url, north_ireland_rate, 
                    north_ireland_url, other_rate, last_updated 
             FROM tariffs 
             WHERE code = ?1",
        )?;
        
        let mut rows = stmt.query(params![code])?;
        
        if let Some(row) = rows.next()? {
            Ok(Some(TaxTariff {
                code: row.get(0)?,
                description: row.get(1)?,
                rate: row.get(2)?,
                url: row.get(3)?,
                north_ireland_rate: row.get(4)?,
                north_ireland_url: row.get(5)?,
                other_rate: row.get(6)?,
                last_updated: row.get(7)?,
                similarity: None,
            }))
        } else {
            Ok(None)
        }
    }
    
    /// 获取所有税率记录
    pub fn get_all_tariffs(&self) -> Result<Vec<TaxTariff>> {
        let mut stmt = self.conn.prepare(
            "SELECT code, description, rate, url, north_ireland_rate, 
                    north_ireland_url, other_rate, last_updated 
             FROM tariffs",
        )?;
        
        let rows = stmt.query_map([], |row| {
            Ok(TaxTariff {
                code: row.get(0)?,
                description: row.get(1)?,
                rate: row.get(2)?,
                url: row.get(3)?,
                north_ireland_rate: row.get(4)?,
                north_ireland_url: row.get(5)?,
                other_rate: row.get(6)?,
                last_updated: row.get(7)?,
                similarity: None,
            })
        })?;
        
        let mut tariffs = Vec::new();
        for tariff in rows {
            tariffs.push(tariff?);
        }
        
        Ok(tariffs)
    }
    
    /// 获取记录总数
    pub fn get_record_count(&self) -> Result<i64> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM tariffs", [], |row| row.get(0))?;
        Ok(count)
    }
    
    /// 检查数据库是否有数据
    pub fn has_data(&self) -> Result<bool> {
        let count = self.get_record_count()?;
        Ok(count > 0)
    }
    
    /// 检查数据库并返回友好错误信息
    pub fn ensure_has_data(&self) -> Result<()> {
        if !self.has_data()? {
            anyhow::bail!("数据库为空，请先在「数据更新」标签页下载税率数据");
        }
        Ok(())
    }
    
    /// 添加单条记录
    pub fn add_tariff(&self, tariff: &TaxTariff) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO tariffs 
             (code, description, rate, url, north_ireland_rate, 
              north_ireland_url, other_rate, last_updated)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
            params![
                tariff.code,
                tariff.description,
                tariff.rate,
                tariff.url,
                tariff.north_ireland_rate,
                tariff.north_ireland_url,
                tariff.other_rate,
            ],
        )?;
        Ok(())
    }
    
    /// 批量添加记录
    pub fn add_tariffs_batch(&self, tariffs: &[TaxTariff]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        
        for tariff in tariffs {
            tx.execute(
                "INSERT OR REPLACE INTO tariffs 
                 (code, description, rate, url, north_ireland_rate, 
                  north_ireland_url, other_rate, last_updated)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
                params![
                    tariff.code,
                    tariff.description,
                    tariff.rate,
                    tariff.url,
                    tariff.north_ireland_rate,
                    tariff.north_ireland_url,
                    tariff.other_rate,
                ],
            )?;
        }
        
        tx.commit()?;
        Ok(())
    }
    
    /// 部分更新字段
    pub fn update_tariff_fields(
        &self,
        code: &str,
        rate: Option<&str>,
        north_ireland_rate: Option<&str>,
        description: Option<&str>,
    ) -> Result<()> {
        // 构建动态 SQL
        let mut updates = Vec::new();
        
        if rate.is_some() {
            updates.push("rate = ?");
        }
        
        if north_ireland_rate.is_some() {
            updates.push("north_ireland_rate = ?");
        }
        
        if description.is_some() {
            updates.push("description = ?");
        }
        
        if updates.is_empty() {
            return Ok(()); // 没有需要更新的字段
        }
        
        // 添加 last_updated
        updates.push("last_updated = datetime('now')");
        
        let sql = format!(
            "UPDATE tariffs SET {} WHERE code = ?",
            updates.join(", ")
        );
        
        // 使用 rusqlite::params! 宏来构建参数
        match (rate, north_ireland_rate, description) {
            (Some(r), Some(nir), Some(d)) => {
                self.conn.execute(&sql, params![r, nir, d, code])?;
            }
            (Some(r), Some(nir), None) => {
                self.conn.execute(&sql, params![r, nir, code])?;
            }
            (Some(r), None, Some(d)) => {
                self.conn.execute(&sql, params![r, d, code])?;
            }
            (None, Some(nir), Some(d)) => {
                self.conn.execute(&sql, params![nir, d, code])?;
            }
            (Some(r), None, None) => {
                self.conn.execute(&sql, params![r, code])?;
            }
            (None, Some(nir), None) => {
                self.conn.execute(&sql, params![nir, code])?;
            }
            (None, None, Some(d)) => {
                self.conn.execute(&sql, params![d, code])?;
            }
            (None, None, None) => {
                // 已经在前面检查过了，这里不会到达
                unreachable!()
            }
        }
        
        Ok(())
    }
    
    /// 清空所有记录（用于数据更新）
    pub fn clear_all(&self) -> Result<()> {
        self.conn.execute("DELETE FROM tariffs", [])?;
        Ok(())
    }
}
