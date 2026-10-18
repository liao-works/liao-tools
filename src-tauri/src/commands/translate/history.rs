use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use tauri::Manager;

use crate::core::database as core_db;
use crate::models::translate::{HistoryEntry, HistoryRecord};

/// 历史上限，超出按最旧清理
pub const HISTORY_LIMIT: i64 = 500;

/// 翻译历史数据库（app_data_dir/translate_history.db）
pub struct TranslateHistory {
    conn: Connection,
}

impl TranslateHistory {
    pub fn new(app_handle: &tauri::AppHandle) -> Result<Self> {
        let dir = app_handle.path().app_data_dir().context("获取应用数据目录失败")?;
        std::fs::create_dir_all(&dir).context("创建应用数据目录失败")?;
        Self::open(&dir.join("translate_history.db"))
    }

    pub fn open(db_path: &std::path::Path) -> Result<Self> {
        let conn = core_db::create_connection(db_path).context("创建历史库连接失败")?;
        let db = Self { conn };
        db.create_tables()?;
        Ok(db)
    }

    fn create_tables(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS translate_history (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
                mode         TEXT    NOT NULL,
                source_lang  TEXT,
                target_lang  TEXT,
                tone         TEXT,
                provider     TEXT    NOT NULL,
                model        TEXT    NOT NULL,
                source_text  TEXT    NOT NULL,
                result_text  TEXT    NOT NULL
            )",
            [],
        )?;
        core_db::create_indexes(
            &self.conn,
            &["CREATE INDEX IF NOT EXISTS idx_th_created ON translate_history(id DESC)"],
        )?;
        Ok(())
    }

    pub fn insert(&self, record: &HistoryRecord) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO translate_history
             (mode, source_lang, target_lang, tone, provider, model, source_text, result_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                record.mode,
                record.source_lang,
                record.target_lang,
                record.tone,
                record.provider,
                record.model,
                record.source_text,
                record.result_text,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn list(&self, limit: i64, offset: i64) -> Result<Vec<HistoryEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, created_at, mode, source_lang, target_lang, tone,
                    provider, model, source_text, result_text
             FROM translate_history
             ORDER BY id DESC
             LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map(params![limit, offset], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                created_at: row.get(1)?,
                mode: row.get(2)?,
                source_lang: row.get(3)?,
                target_lang: row.get(4)?,
                tone: row.get(5)?,
                provider: row.get(6)?,
                model: row.get(7)?,
                source_text: row.get(8)?,
                result_text: row.get(9)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    pub fn delete(&self, id: i64) -> Result<usize> {
        Ok(self.conn.execute("DELETE FROM translate_history WHERE id = ?1", params![id])?)
    }

    pub fn clear(&self) -> Result<usize> {
        Ok(self.conn.execute("DELETE FROM translate_history", [])?)
    }

    /// 按 HISTORY_LIMIT 清理最旧记录，返回删除数
    pub fn enforce_limit(&self) -> Result<usize> {
        self.enforce_limit_to(HISTORY_LIMIT)
    }

    pub fn enforce_limit_to(&self, max_rows: i64) -> Result<usize> {
        let removed = self.conn.execute(
            "DELETE FROM translate_history WHERE id NOT IN
             (SELECT id FROM translate_history ORDER BY id DESC LIMIT ?1)",
            params![max_rows],
        )?;
        Ok(removed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn db() -> (TempDir, TranslateHistory) {
        let dir = TempDir::new().unwrap();
        let db = TranslateHistory::open(&dir.path().join("t.db")).unwrap();
        (dir, db)
    }

    fn record(text: &str) -> HistoryRecord {
        HistoryRecord {
            mode: "translate".into(),
            source_lang: Some("auto".into()),
            target_lang: Some("en".into()),
            tone: Some("natural".into()),
            provider: "deepseek".into(),
            model: "deepseek-chat".into(),
            source_text: text.into(),
            result_text: format!("translated-{text}"),
        }
    }

    #[test]
    fn insert_returns_id_and_list_reads_back() {
        let (_d, db) = db();
        let id = db.insert(&record("你好")).unwrap();
        assert!(id > 0);
        let rows = db.list(10, 0).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].source_text, "你好");
        assert_eq!(rows[0].result_text, "translated-你好");
        assert_eq!(rows[0].provider, "deepseek");
        assert!(!rows[0].created_at.is_empty());
    }

    #[test]
    fn list_orders_newest_first_and_paginates() {
        let (_d, db) = db();
        db.insert(&record("a")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1100));
        db.insert(&record("b")).unwrap();
        let rows = db.list(10, 0).unwrap();
        assert_eq!(rows[0].source_text, "b");
        let page = db.list(1, 1).unwrap();
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].source_text, "a");
    }

    #[test]
    fn delete_and_clear() {
        let (_d, db) = db();
        let id = db.insert(&record("x")).unwrap();
        assert_eq!(db.delete(id).unwrap(), 1);
        db.insert(&record("y")).unwrap();
        assert!(db.clear().unwrap() >= 1);
        assert!(db.list(10, 0).unwrap().is_empty());
    }

    #[test]
    fn enforce_limit_keeps_newest() {
        let (_d, db) = db();
        for i in 0..6 {
            db.insert(&record(&i.to_string())).unwrap();
        }
        let removed = db.enforce_limit_to(4).unwrap();
        assert_eq!(removed, 2);
        let rows = db.list(10, 0).unwrap();
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[0].source_text, "5");
    }
}
