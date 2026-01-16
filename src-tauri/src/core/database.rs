use rusqlite::{Connection, Result};
use std::path::Path;

/// 通用数据库连接管理

/// 确保数据库目录存在
pub fn ensure_db_directory(db_path: &Path) -> std::io::Result<()> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

/// 创建 SQLite 连接
pub fn create_connection(db_path: &Path) -> Result<Connection> {
    ensure_db_directory(db_path)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    Connection::open(db_path)
}

/// 批量执行索引创建
pub fn create_indexes(conn: &Connection, indexes: &[&str]) -> Result<()> {
    for index_sql in indexes {
        conn.execute(index_sql, [])?;
    }
    Ok(())
}

/// 检查表是否存在
pub fn table_exists(conn: &Connection, table_name: &str) -> Result<bool> {
    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?1"
    )?;
    
    let exists = stmt.exists([table_name])?;
    Ok(exists)
}
