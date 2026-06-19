use crate::core::database as core_db;
use crate::models::update_history::{ChangeDetail, ChangeRecord, SessionSummary};
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use tauri::Manager;

/// 变更历史数据库（独立于 tariffs.db / alta_cache.db）
pub struct HistoryDatabase {
    conn: Connection,
}

impl HistoryDatabase {
    /// 从 app_handle 打开（路径：app_data_dir/update_history.db），自动建表
    pub fn new(app_handle: &tauri::AppHandle) -> Result<Self> {
        let dir = app_handle
            .path()
            .app_data_dir()
            .context("Failed to get app data directory")?;
        std::fs::create_dir_all(&dir).context("Failed to create app data directory")?;
        let db_path = dir.join("update_history.db");
        Self::open(&db_path)
    }

    /// 从指定路径打开（测试用）
    pub fn open(db_path: &std::path::Path) -> Result<Self> {
        let conn = core_db::create_connection(db_path)
            .context("Failed to create update_history connection")?;
        let db = Self { conn };
        db.create_tables()?;
        Ok(db)
    }

    fn create_tables(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS change_log (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id   TEXT    NOT NULL,
                module       TEXT    NOT NULL,
                update_type  TEXT    NOT NULL,
                version_from TEXT,
                version_to   TEXT,
                timestamp    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                code         TEXT    NOT NULL,
                field        TEXT,
                old_value    TEXT,
                new_value    TEXT,
                change_type  TEXT    NOT NULL
            )",
            [],
        )?;
        core_db::create_indexes(
            &self.conn,
            &[
                "CREATE INDEX IF NOT EXISTS idx_cl_session ON change_log(session_id)",
                "CREATE INDEX IF NOT EXISTS idx_cl_module_ts ON change_log(module, timestamp)",
            ],
        )?;
        Ok(())
    }

    /// 插入一次更新的全部变更行（事务批量）
    pub fn insert_changes(&self, records: &[ChangeRecord]) -> Result<()> {
        if records.is_empty() {
            return Ok(());
        }
        let tx = self.conn.unchecked_transaction()?;
        for r in records {
            tx.execute(
                "INSERT INTO change_log
                 (session_id, module, update_type, version_from, version_to,
                  code, field, old_value, new_value, change_type)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    r.session_id, r.module, r.update_type,
                    r.version_from, r.version_to,
                    r.code, r.field, r.old_value, r.new_value, r.change_type,
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// 查询历史列表（按 module 过滤，可选；按时间倒序）
    pub fn list_sessions(&self, module: Option<&str>, limit: i64) -> Result<Vec<SessionSummary>> {
        let sql = if module.is_some() {
            "SELECT session_id, module, update_type, version_to,
                    (SELECT timestamp FROM change_log c2 WHERE c2.session_id = c1.session_id LIMIT 1) AS ts,
                    COUNT(*) AS cnt
             FROM change_log c1
             WHERE module = ?1
             GROUP BY session_id
             ORDER BY ts DESC
             LIMIT ?2"
        } else {
            "SELECT session_id, module, update_type, version_to,
                    (SELECT timestamp FROM change_log c2 WHERE c2.session_id = c1.session_id LIMIT 1) AS ts,
                    COUNT(*) AS cnt
             FROM change_log c1
             GROUP BY session_id
             ORDER BY ts DESC
             LIMIT ?1"
        };

        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<SessionSummary> {
            Ok(SessionSummary {
                session_id: row.get(0)?,
                module: row.get(1)?,
                update_type: row.get(2)?,
                version_to: row.get(3)?,
                timestamp: row.get(4)?,
                change_count: row.get(5)?,
            })
        };

        let mut stmt = self.conn.prepare(sql)?;
        let rows = if let Some(m) = module {
            stmt.query_map(params![m, limit], map_row)?
        } else {
            stmt.query_map(params![limit], map_row)?
        };
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    /// 查询某次更新的明细
    pub fn get_details(&self, session_id: &str) -> Result<Vec<ChangeDetail>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, module, update_type, version_from, version_to,
                    timestamp, code, field, old_value, new_value, change_type
             FROM change_log
             WHERE session_id = ?1
             ORDER BY id",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            Ok(ChangeDetail {
                id: row.get(0)?,
                session_id: row.get(1)?,
                module: row.get(2)?,
                update_type: row.get(3)?,
                version_from: row.get(4)?,
                version_to: row.get(5)?,
                timestamp: row.get(6)?,
                code: row.get(7)?,
                field: row.get(8)?,
                old_value: row.get(9)?,
                new_value: row.get(10)?,
                change_type: row.get(11)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    /// 清理历史（before 为 None 则清空全部）
    pub fn clear(&self, before: Option<&str>) -> Result<usize> {
        let affected = if let Some(ts) = before {
            self.conn.execute(
                "DELETE FROM change_log WHERE timestamp < ?1",
                params![ts],
            )?
        } else {
            self.conn.execute("DELETE FROM change_log", [])?
        };
        Ok(affected)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    fn empty_db() -> (NamedTempFile, HistoryDatabase) {
        let f = NamedTempFile::new().unwrap();
        let db = HistoryDatabase::open(f.path()).unwrap();
        (f, db)
    }

    fn rec(session: &str, module: &str, code: &str, field: Option<&str>,
           old: Option<&str>, new: Option<&str>, ct: &str) -> ChangeRecord {
        ChangeRecord {
            session_id: session.into(), module: module.into(),
            update_type: "full".into(), version_from: None, version_to: Some("data-2".into()),
            code: code.into(), field: field.map(Into::into),
            old_value: old.map(Into::into), new_value: new.map(Into::into),
            change_type: ct.into(),
        }
    }

    #[test]
    fn test_insert_and_list_sessions() {
        let (_f, db) = empty_db();
        db.insert_changes(&[
            rec("s1", "tax", "01010101", Some("rate"), Some("5%"), Some("6%"), "modified"),
            rec("s1", "tax", "02020202", None, None, None, "added"),
            rec("s2", "alta", "0303", None, None, None, "added"),
        ]).unwrap();

        let sessions = db.list_sessions(None, 100).unwrap();
        assert_eq!(sessions.len(), 2);
        let s1 = sessions.iter().find(|s| s.session_id == "s1").unwrap();
        assert_eq!(s1.change_count, 2);
        assert_eq!(s1.module, "tax");

        let tax_only = db.list_sessions(Some("tax"), 100).unwrap();
        assert_eq!(tax_only.len(), 1);
    }

    #[test]
    fn test_get_details() {
        let (_f, db) = empty_db();
        db.insert_changes(&[
            rec("s1", "tax", "01010101", Some("rate"), Some("5%"), Some("6%"), "modified"),
        ]).unwrap();
        let details = db.get_details("s1").unwrap();
        assert_eq!(details.len(), 1);
        assert_eq!(details[0].code, "01010101");
        assert_eq!(details[0].field.as_deref(), Some("rate"));
    }

    #[test]
    fn test_clear() {
        let (_f, db) = empty_db();
        db.insert_changes(&[rec("s1", "tax", "01010101", None, None, None, "added")]).unwrap();
        let n = db.clear(None).unwrap();
        assert_eq!(n, 1);
        assert!(db.list_sessions(None, 100).unwrap().is_empty());
    }

    #[test]
    fn test_insert_empty_is_noop() {
        let (_f, db) = empty_db();
        db.insert_changes(&[]).unwrap();
        assert!(db.list_sessions(None, 100).unwrap().is_empty());
    }
}
