use chrono::{Duration as ChronoDuration, Local};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::Manager;

/// 各工具的使用统计：查询次数、查询数据量（编码数）、处理数据量（行/文件数）、
/// 处理时长。数据只存在本地 usage_stats.db，用于周/月视图的汇总展示。

fn open_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App data directory: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("usage_stats.db")).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tool TEXT NOT NULL,
            action TEXT NOT NULL,
            items INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            day TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_events_day ON usage_events(day);
        CREATE INDEX IF NOT EXISTS idx_usage_events_tool ON usage_events(tool);
        PRAGMA journal_mode = WAL;",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn local_day(date: chrono::NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

#[derive(Debug, Deserialize)]
pub struct UsageEventInput {
    pub tool: String,
    /// 'query'（查询，items = 编码数）或 'process'（文件处理，items = 行/文件数）
    pub action: String,
    #[serde(default)]
    pub items: i64,
    #[serde(default)]
    pub duration_ms: i64,
}

#[tauri::command]
pub async fn usage_record(app: tauri::AppHandle, event: UsageEventInput) -> Result<(), String> {
    // 归一化：未知动作按查询对待之外，统一约束取值，避免脏数据破坏汇总口径
    let action = match event.action.as_str() {
        "process" => "process",
        _ => "query",
    };
    let tool = event.tool.trim().to_lowercase();
    if tool.is_empty() {
        return Err("tool is required".to_string());
    }

    let conn = open_db(&app)?;
    let now = Local::now();
    conn.execute(
        "INSERT INTO usage_events (tool, action, items, duration_ms, created_at, day)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            tool,
            action,
            event.items.max(0),
            event.duration_ms.max(0),
            now.timestamp(),
            local_day(now.date_naive()),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct UsageDayRow {
    pub day: String,
    pub queries: i64,
    pub query_items: i64,
    pub process_items: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Serialize)]
pub struct UsageToolRow {
    pub tool: String,
    pub queries: i64,
    pub query_items: i64,
    pub process_items: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Serialize)]
pub struct UsageSummary {
    pub range: String,
    pub days: Vec<UsageDayRow>,
    pub tools: Vec<UsageToolRow>,
    pub total_queries: i64,
    pub total_query_items: i64,
    pub total_process_items: i64,
    pub total_duration_ms: i64,
}

fn range_days(range: &str) -> i64 {
    match range {
        "month" => 30,
        _ => 7,
    }
}

#[tauri::command]
pub async fn usage_summary(app: tauri::AppHandle, range: String) -> Result<UsageSummary, String> {
    let range_name = if range == "month" { "month" } else { "week" };
    let days_count = range_days(range_name);

    let conn = open_db(&app)?;
    let today = Local::now().date_naive();
    let start_day = local_day(today - ChronoDuration::days(days_count - 1));
    let end_day = local_day(today);

    // 按天汇总；没有数据的日子由下面的补零逻辑填充，保证图表连续
    let mut stmt = conn
        .prepare(
            "SELECT day,
                    COALESCE(SUM(CASE WHEN action = 'query' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN action = 'query' THEN items ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN action != 'query' THEN items ELSE 0 END), 0),
                    COALESCE(SUM(duration_ms), 0)
             FROM usage_events
             WHERE day >= ?1 AND day <= ?2
             GROUP BY day",
        )
        .map_err(|e| e.to_string())?;
    let mut day_map: std::collections::HashMap<String, UsageDayRow> =
        std::collections::HashMap::new();
    let rows = stmt
        .query_map(rusqlite::params![start_day, end_day], |row| {
            Ok(UsageDayRow {
                day: row.get(0)?,
                queries: row.get(1)?,
                query_items: row.get(2)?,
                process_items: row.get(3)?,
                duration_ms: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        day_map.insert(row.day.clone(), row);
    }
    drop(stmt);

    // 工具维度汇总
    let mut stmt = conn
        .prepare(
            "SELECT tool,
                    COALESCE(SUM(CASE WHEN action = 'query' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN action = 'query' THEN items ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN action != 'query' THEN items ELSE 0 END), 0),
                    COALESCE(SUM(duration_ms), 0)
             FROM usage_events
             WHERE day >= ?1 AND day <= ?2
             GROUP BY tool
             ORDER BY 5 DESC",
        )
        .map_err(|e| e.to_string())?;
    let tool_rows = stmt
        .query_map(rusqlite::params![start_day, end_day], |row| {
            Ok(UsageToolRow {
                tool: row.get(0)?,
                queries: row.get(1)?,
                query_items: row.get(2)?,
                process_items: row.get(3)?,
                duration_ms: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut tools: Vec<UsageToolRow> = Vec::new();
    for row in tool_rows {
        tools.push(row.map_err(|e| e.to_string())?);
    }
    drop(stmt);

    // 零填充补齐日期区间，图表日期连续
    let mut days: Vec<UsageDayRow> = Vec::with_capacity(days_count as usize);
    for offset in 0..days_count {
        let day = local_day(today - ChronoDuration::days(days_count - 1 - offset));
        match day_map.remove(&day) {
            Some(row) => days.push(row),
            None => days.push(UsageDayRow {
                day,
                queries: 0,
                query_items: 0,
                process_items: 0,
                duration_ms: 0,
            }),
        }
    }

    let total_queries: i64 = days.iter().map(|d| d.queries).sum();
    let total_query_items: i64 = days.iter().map(|d| d.query_items).sum();
    let total_process_items: i64 = days.iter().map(|d| d.process_items).sum();
    let total_duration_ms: i64 = days.iter().map(|d| d.duration_ms).sum();

    Ok(UsageSummary {
        range: range_name.to_string(),
        days,
        tools,
        total_queries,
        total_query_items,
        total_process_items,
        total_duration_ms,
    })
}
