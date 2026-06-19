# 数据更新变更记录功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 tax 与 alta 两个数据模块的更新功能增加持久化的行级变更记录，让用户能查看每次更新改了哪些数据、由什么变成什么。

**Architecture:** 新增独立的 `update_history.db`（单表 `change_log`，`session_id` 分组），后端新增 `commands/update_history/` 模块（database + diff + commands），在三个现有更新入口（tax 单行 / tax 全量 / alta 全量）以旁路方式插入 diff 与写历史；前端新增共用「更新历史」弹窗组件，在 alta `DataManageTab` 与 tax `UpdateTab` 各加入口。

**Tech Stack:** Rust（rusqlite 0.32、uuid v4、anyhow、chrono）、Tauri 2 命令、React + TypeScript（shadcn/ui）

**关键约束**：
- diff/写历史是**旁路**——失败只 `log::warn!`，不阻断更新主流程
- `tariffs.db` 全量更新会被整个文件替换，故历史库必须独立
- version 仅 tax 全量更新有值；alta 与 tax 单行为 `NULL`
- 无字段变化时不写记录

---

## File Structure

**新建（后端）**
- `src-tauri/src/models/update_history.rs` — `ChangeRecord` / `SessionSummary` / `ChangeDetail` 类型
- `src-tauri/src/commands/update_history/mod.rs` — 模块声明
- `src-tauri/src/commands/update_history/database.rs` — `HistoryDatabase`（建表/插入/查询/清理）
- `src-tauri/src/commands/update_history/diff.rs` — `diff_tariffs` / `diff_forbidden_items`
- `src-tauri/src/commands/update_history/commands.rs` — Tauri 命令

**新建（前端）**
- `src/lib/api/updateHistory.ts` — 封装三个命令
- `src/components/update-history/UpdateHistoryDialog.tsx` — 共用历史列表+明细弹窗

**修改**
- `src-tauri/src/models/mod.rs` — 注册 `update_history` 模块
- `src-tauri/src/commands/mod.rs` — 注册 `update_history` 模块
- `src-tauri/src/lib.rs` — 注册三个命令到 `invoke_handler`
- `src-tauri/src/commands/tax/commands.rs` — tax 单行更新集成
- `src-tauri/src/commands/tax/database.rs` — 新增 `read_all_from_path`
- `src-tauri/src/commands/tax/downloader.rs` — tax 全量更新集成
- `src-tauri/src/commands/alta/database.rs` — 新增 `get_all_forbidden_items`
- `src-tauri/src/commands/alta/commands.rs` — alta 更新集成
- `src/types/index.ts` — 前端类型
- `src/features/alta/components/DataManageTab.tsx` — 入口按钮
- `src/features/tax/components/UpdateTab.tsx` — 入口按钮

---

## Task 1: 定义变更记录模型类型

**Files:**
- Create: `src-tauri/src/models/update_history.rs`
- Modify: `src-tauri/src/models/mod.rs`

- [ ] **Step 1: 创建类型文件**

`src-tauri/src/models/update_history.rs`:

```rust
use serde::{Deserialize, Serialize};

/// 单条变更记录（对应 change_log 一行）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRecord {
    pub session_id: String,
    pub module: String,            // 'tax' | 'alta'
    pub update_type: String,       // 'full' | 'single'
    pub version_from: Option<String>,
    pub version_to: Option<String>,
    pub code: String,
    pub field: Option<String>,     // None 表示整条新增/删除
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub change_type: String,       // 'added' | 'removed' | 'modified'
}

/// 历史列表中一次更新的摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub module: String,
    pub update_type: String,
    pub version_to: Option<String>,
    pub timestamp: String,
    pub change_count: i64,
}

/// 单条变更明细（含 id 与 timestamp，用于明细展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeDetail {
    pub id: i64,
    pub session_id: String,
    pub module: String,
    pub update_type: String,
    pub version_from: Option<String>,
    pub version_to: Option<String>,
    pub timestamp: String,
    pub code: String,
    pub field: Option<String>,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub change_type: String,
}
```

- [ ] **Step 2: 注册模块**

在 `src-tauri/src/models/mod.rs` 增加一行（参照已有的 `pub mod tax;` / `pub mod alta;` 模式）:

```rust
pub mod update_history;
```

- [ ] **Step 3: 验证编译**

Run: `cd src-tauri && rtk cargo check`
Expected: 编译通过，无错误

- [ ] **Step 4: Commit**

```bash
rtk git add src-tauri/src/models/update_history.rs src-tauri/src/models/mod.rs
rtk git commit -m "feat(update-history): 定义变更记录模型类型"
```

---

## Task 2: HistoryDatabase（建表/插入/查询/清理）

**Files:**
- Create: `src-tauri/src/commands/update_history/database.rs`
- Create: `src-tauri/src/commands/update_history/mod.rs`

- [ ] **Step 1: 创建 database.rs**

`src-tauri/src/commands/update_history/database.rs`:

```rust
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
             LIMIT ?2"
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
```

- [ ] **Step 2: 创建 mod.rs**

`src-tauri/src/commands/update_history/mod.rs`:

```rust
pub mod commands;
pub mod database;
pub mod diff;
```

- [ ] **Step 3: 在 commands/mod.rs 注册模块**

在 `src-tauri/src/commands/mod.rs` 增加（参照 `pub mod tax;` 模式）:

```rust
pub mod update_history;
```

- [ ] **Step 4: 运行测试**

Run: `cd src-tauri && rtk cargo test update_history::database::tests -- --nocapture`
Expected: 4 个测试全部 PASS

> 注：此时 `mod.rs` 引用了尚未创建的 `commands` 与 `diff`，本步骤可能编译失败。若失败，先临时注释 `mod.rs` 中的 `pub mod commands; pub mod diff;`，待 Task 3/4 创建后再放开。或先完成 Task 3 再跑此测试。

- [ ] **Step 5: Commit**

```bash
rtk git add src-tauri/src/commands/update_history/
rtk git commit -m "feat(update-history): 新增 HistoryDatabase 建表/插入/查询/清理"
```

---

## Task 3: diff 逻辑（tax + alta）

**Files:**
- Create: `src-tauri/src/commands/update_history/diff.rs`

- [ ] **Step 1: 创建 diff.rs**

`src-tauri/src/commands/update_history/diff.rs`:

```rust
use crate::models::alta::ForbiddenItem;
use crate::models::tax::TaxTariff;
use crate::models::update_history::ChangeRecord;
use std::collections::HashMap;

/// 对比两份关税数据，生成行级变更记录。
/// version_from/version_to 仅 tax 全量更新有值。
pub fn diff_tariffs(
    old: &[TaxTariff],
    new: &[TaxTariff],
    session_id: &str,
    version_from: Option<&str>,
    version_to: Option<&str>,
) -> Vec<ChangeRecord> {
    let old_map: HashMap<&str, &TaxTariff> = old.iter().map(|t| (t.code.as_str(), t)).collect();
    let new_map: HashMap<&str, &TaxTariff> = new.iter().map(|t| (t.code.as_str(), t)).collect();
    let mut out = Vec::new();

    // tax 对比的共有字段：(字段名, 取值函数)
    let fields: [(&str, fn(&TaxTariff) -> Option<String>); 4] = [
        ("rate", |t| Some(t.rate.clone())),
        ("north_ireland_rate", |t| t.north_ireland_rate.clone()),
        ("description", |t| t.description.clone()),
        ("other_rate", |t| t.other_rate.clone()),
    ];

    let mk = |code: &str, field: Option<&str>, old_v: Option<String>,
              new_v: Option<String>, ct: &str| -> ChangeRecord {
        ChangeRecord {
            session_id: session_id.into(),
            module: "tax".into(),
            update_type: "full".into(),
            version_from: version_from.map(Into::into),
            version_to: version_to.map(Into::into),
            code: code.into(),
            field: field.map(Into::into),
            old_value: old_v,
            new_value: new_v,
            change_type: ct.into(),
        }
    };

    // added
    for (code, n) in &new_map {
        if !old_map.contains_key(code) {
            out.push(mk(code, None, None, None, "added"));
        }
    }
    // removed + modified
    for (code, o) in &old_map {
        match new_map.get(code) {
            None => out.push(mk(code, None, None, None, "removed")),
            Some(n) => {
                for (fname, fget) in &fields {
                    let ov = fget(o);
                    let nv = fget(n);
                    if ov != nv {
                        out.push(mk(code, Some(fname), ov, nv, "modified"));
                    }
                }
            }
        }
    }
    out
}

/// 对比两份禁运清单，生成行级变更记录（以 hs_code 为键）。
pub fn diff_forbidden_items(
    old: &[ForbiddenItem],
    new: &[ForbiddenItem],
    session_id: &str,
) -> Vec<ChangeRecord> {
    let old_map: HashMap<&str, &ForbiddenItem> =
        old.iter().map(|i| (i.hs_code.as_str(), i)).collect();
    let new_map: HashMap<&str, &ForbiddenItem> =
        new.iter().map(|i| (i.hs_code.as_str(), i)).collect();
    let mut out = Vec::new();

    let fields: [(&str, fn(&ForbiddenItem) -> Option<String>); 3] = [
        ("description", |i| Some(i.description.clone())),
        ("additional_info", |i| Some(i.additional_info.clone())),
        ("source_url", |i| Some(i.source_url.clone())),
    ];

    let mk = |code: &str, field: Option<&str>, old_v: Option<String>,
              new_v: Option<String>, ct: &str| -> ChangeRecord {
        ChangeRecord {
            session_id: session_id.into(),
            module: "alta".into(),
            update_type: "full".into(),
            version_from: None,
            version_to: None,
            code: code.into(),
            field: field.map(Into::into),
            old_value: old_v,
            new_value: new_v,
            change_type: ct.into(),
        }
    };

    for (code, n) in &new_map {
        if !old_map.contains_key(code) {
            out.push(mk(code, None, None, None, "added"));
        }
    }
    for (code, o) in &old_map {
        match new_map.get(code) {
            None => out.push(mk(code, None, None, None, "removed")),
            Some(n) => {
                for (fname, fget) in &fields {
                    let ov = fget(o);
                    let nv = fget(n);
                    if ov != nv {
                        out.push(mk(code, Some(fname), ov, nv, "modified"));
                    }
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tariff(code: &str, rate: &str, ni: Option<&str>) -> TaxTariff {
        TaxTariff {
            code: code.into(),
            description: None,
            rate: rate.into(),
            url: String::new(),
            north_ireland_rate: ni.map(Into::into),
            north_ireland_url: None,
            other_rate: None,
            anti_dumping_rate: None,
            countervailing_rate: None,
            last_updated: None,
            similarity: None,
        }
    }

    #[test]
    fn test_diff_added_removed_modified() {
        let old = vec![tariff("01", "5%", Some("3%")), tariff("02", "0%", None)];
        let new = vec![tariff("01", "6%", Some("3%")), tariff("03", "0%", None)];
        let recs = diff_tariffs(&old, &new, "s1", Some("data-1"), Some("data-2"));
        // 01: rate 5%→6% (modified); 02: removed; 03: added
        assert!(recs.iter().any(|r| r.code == "01" && r.field.as_deref() == Some("rate")
            && r.old_value.as_deref() == Some("5%") && r.new_value.as_deref() == Some("6%")));
        assert!(recs.iter().any(|r| r.code == "02" && r.change_type == "removed"));
        assert!(recs.iter().any(|r| r.code == "03" && r.change_type == "added"));
    }

    #[test]
    fn test_diff_no_change() {
        let old = vec![tariff("01", "5%", None)];
        let new = vec![tariff("01", "5%", None)];
        assert!(diff_tariffs(&old, &new, "s1", None, None).is_empty());
    }
}
```

- [ ] **Step 2: 运行测试**

Run: `cd src-tauri && rtk cargo test update_history::diff::tests -- --nocapture`
Expected: 2 个测试 PASS

- [ ] **Step 3: Commit**

```bash
rtk git add src-tauri/src/commands/update_history/diff.rs
rtk git commit -m "feat(update-history): 新增 tax/alta 行级 diff 逻辑"
```

---

## Task 4: Tauri 命令 + 注册

**Files:**
- Create: `src-tauri/src/commands/update_history/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 创建 commands.rs**

`src-tauri/src/commands/update_history/commands.rs`:

```rust
use super::database::HistoryDatabase;
use crate::models::update_history::{ChangeDetail, SessionSummary};

/// 查询更新历史列表
#[tauri::command]
pub async fn get_update_sessions(
    module: Option<String>,
    limit: Option<i64>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<SessionSummary>, String> {
    let db = HistoryDatabase::new(&app_handle).map_err(|e| e.to_string())?;
    db.list_sessions(module.as_deref(), limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

/// 查询某次更新的明细
#[tauri::command]
pub async fn get_update_details(
    session_id: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<ChangeDetail>, String> {
    let db = HistoryDatabase::new(&app_handle).map_err(|e| e.to_string())?;
    db.get_details(&session_id).map_err(|e| e.to_string())
}

/// 清理历史（before 为 ISO 时间字符串则清理更早的，None 清空全部）
#[tauri::command]
pub async fn clear_update_history(
    before: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<usize, String> {
    let db = HistoryDatabase::new(&app_handle).map_err(|e| e.to_string())?;
    db.clear(before.as_deref()).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: 在 lib.rs 注册命令**

在 `src-tauri/src/lib.rs` 顶部 `use` 区增加:

```rust
use commands::update_history::*;
```

在 `tauri::generate_handler![...]` 列表中（`tax_update_single_row,` 之后）增加:

```rust
            tax_update_single_row,
            // Update history commands
            get_update_sessions,
            get_update_details,
            clear_update_history,
```

- [ ] **Step 3: 验证编译**

Run: `cd src-tauri && rtk cargo check`
Expected: 编译通过

- [ ] **Step 4: Commit**

```bash
rtk git add src-tauri/src/commands/update_history/commands.rs src-tauri/src/lib.rs
rtk git commit -m "feat(update-history): 新增历史查询/清理 Tauri 命令并注册"
```

---

## Task 5: 集成 — tax 单行更新

**Files:**
- Modify: `src-tauri/src/commands/tax/commands.rs`（`tax_update_single_row` 函数，约第 347-415 行写库与返回处）

- [ ] **Step 1: 在写库成功后写入变更记录**

在 `tax_update_single_row` 中，`db.update_tariff_fields(...)` 成功之后（`if any_updated { ... }` 块内，`info!("数据库更新成功");` 之后），插入写历史逻辑。先在文件顶部 `use` 区增加:

```rust
use crate::commands::update_history::database::HistoryDatabase;
use crate::models::update_history::ChangeRecord;
```

然后在 `info!("数据库更新成功");` 之后插入:

```rust
        // 旁路：写入变更历史（失败不阻断主流程）
        if let Ok(history_db) = HistoryDatabase::new(&app_handle) {
            let session_id = uuid::Uuid::new_v4().to_string();
            let mk = |field: &str, old: Option<String>, new: Option<String>| ChangeRecord {
                session_id: session_id.clone(),
                module: "tax".into(),
                update_type: "single".into(),
                version_from: None,
                version_to: None,
                code: code.clone(),
                field: Some(field.into()),
                old_value: old,
                new_value: new,
                change_type: "modified".into(),
            };
            let mut records = Vec::new();
            if uk_updated {
                records.push(mk("rate", Some(old_tariff.rate.clone()), new_uk_rate.clone()));
            }
            if ni_updated {
                records.push(mk(
                    "north_ireland_rate",
                    old_tariff.north_ireland_rate.clone(),
                    new_ni_rate.clone(),
                ));
            }
            if let Err(e) = history_db.insert_changes(&records) {
                log::warn!("写入变更历史失败(tax 单行): {}", e);
            }
        }
```

> 注意：`uk_updated`/`ni_updated`/`new_uk_rate`/`new_ni_rate` 在该作用域已存在（commands.rs:229-233 声明），可直接使用。`old_tariff.rate` 与 `old_tariff.north_ireland_rate` 为旧值来源。

- [ ] **Step 2: 验证编译**

Run: `cd src-tauri && rtk cargo check`
Expected: 编译通过

- [ ] **Step 3: 手动验证**

启动应用 → tax 单个查询 → 对某商品触发右键单行更新（确认抓取值有变化）→ 再次触发更新。预期：第二次因无变化不产生新记录。通过后续前端或直接查 `update_history.db` 验证（前端在 Task 10 完成后可见）。

- [ ] **Step 4: Commit**

```bash
rtk git add src-tauri/src/commands/tax/commands.rs
rtk git commit -m "feat(update-history): tax 单行更新写入变更记录"
```

---

## Task 6: 集成 — tax 全量更新

**Files:**
- Modify: `src-tauri/src/commands/tax/database.rs`（新增 `read_all_from_path`）
- Modify: `src-tauri/src/commands/tax/downloader.rs`（`download_and_install`）

- [ ] **Step 1: 在 tax/database.rs 新增从路径读取全部的方法**

在 `impl TaxDatabase { ... }` 内（`get_all_tariffs` 方法之后）增加关联函数:

```rust
    /// 从指定路径的数据库读取全部关税（只读，用于全量更新 diff 新库）
    pub fn read_all_from_path(db_path: &std::path::Path) -> Result<Vec<TaxTariff>> {
        let conn = crate::core::database::create_connection(db_path)
            .context("Failed to open new tariffs db for diff")?;
        let mut stmt = conn.prepare(
            "SELECT code, description, rate, url, north_ireland_rate,
                    north_ireland_url, other_rate, anti_dumping_rate, countervailing_rate, last_updated
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
                anti_dumping_rate: row.get(7)?,
                countervailing_rate: row.get(8)?,
                last_updated: row.get(9)?,
                similarity: None,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }
```

- [ ] **Step 2: 在 downloader.download_and_install 插入 diff + 写历史**

在 `src-tauri/src/commands/tax/downloader.rs` 顶部 `use` 区增加:

```rust
use crate::commands::tax::database::TaxDatabase;
use crate::commands::update_history::database::HistoryDatabase;
use crate::commands::update_history::diff::diff_tariffs;
```

在 `download_and_install` 中，下载得到 `temp_db_path` 之后、`std::fs::rename(&temp_db_path, &target_db_path)` 之前（即"备份旧数据库"之后、"移动新数据库"之前），插入:

```rust
        // 旁路：对比新旧库，写入变更历史（失败不阻断）
        if let Err(e) = Self::record_full_update_diff(
            app_handle,
            &target_db_path,
            &temp_db_path,
            &local_version.version,
            &remote_metadata.version,
        ) {
            log::warn!("写入 tax 全量变更历史失败: {}", e);
        }
```

> **顺序关键（避免逻辑错误）**：`download_and_install` 原本在 `rename` **之后**（约行 74）才 `fetch_remote_metadata`，但 diff 必须在 `rename` **之前**做（否则旧库已被覆盖、无法对比）。因此需调整顺序：
> 1. 在 `download_database` 得到 `temp_db_path` 之后、备份旧库之前，**提前**调用 `let remote_metadata = Self::fetch_remote_metadata().await?;`（并删除原行 74 那次重复 fetch）。
> 2. 备份旧库后、`rename` 前，获取旧版本（`VersionDetail`，已在该文件导入）：`let local_version = Self::get_local_version(app_handle).await.unwrap_or_else(|_| VersionDetail { version: "unknown".into(), records: 0, date: "unknown".into() });`
> 3. 紧接着插入上面的 `record_full_update_diff` 调用：`version_from` 传 `&local_version.version`，`version_to` 传 `&remote_metadata.version`。
> 4. `rename` 之后写 metadata 文件时，复用已获取的 `remote_metadata`（不再重复 fetch）。

在 `impl TaxDataDownloader { ... }` 内新增辅助方法:

```rust
    /// 对比旧库与下载的新库，写入 tax 全量变更历史
    fn record_full_update_diff(
        app_handle: &tauri::AppHandle,
        old_db_path: &std::path::Path,
        new_db_path: &std::path::Path,
        version_from: &str,
        version_to: &str,
    ) -> Result<()> {
        // 旧库可能不存在（首次下载），此时全部为 added
        let old_tariffs = if old_db_path.exists() {
            TaxDatabase::read_all_from_path(old_db_path).unwrap_or_default()
        } else {
            Vec::new()
        };
        let new_tariffs = TaxDatabase::read_all_from_path(new_db_path)?;

        let session_id = uuid::Uuid::new_v4().to_string();
        let records = diff_tariffs(
            &old_tariffs,
            &new_tariffs,
            &session_id,
            Some(version_from),
            Some(version_to),
        );

        let history_db = HistoryDatabase::new(app_handle)?;
        history_db.insert_changes(&records)?;
        Ok(())
    }
```

- [ ] **Step 3: 验证编译**

Run: `cd src-tauri && rtk cargo check`
Expected: 编译通过

- [ ] **Step 4: Commit**

```bash
rtk git add src-tauri/src/commands/tax/database.rs src-tauri/src/commands/tax/downloader.rs
rtk git commit -m "feat(update-history): tax 全量更新对比新旧库写入变更记录"
```

---

## Task 7: 集成 — alta 更新

**Files:**
- Modify: `src-tauri/src/commands/alta/database.rs`（新增 `get_all_forbidden_items`）
- Modify: `src-tauri/src/commands/alta/commands.rs`（`update_alta_database`）

- [ ] **Step 1: 在 alta/database.rs 新增读取全部的方法**

在 `impl DatabaseManager { ... }` 内（`get_total_count` 之后）增加:

```rust
    /// 读取全部禁运商品（用于更新前 diff）
    pub fn get_all_forbidden_items(&self) -> Result<Vec<ForbiddenItem>> {
        let has_new_columns = MigrationManager::column_exists(&self.conn, "forbidden_items", "raw_text");
        let mut stmt = self.conn.prepare(
            "SELECT id, hs_code, hs_code_4, hs_code_6, hs_code_8,
                    description, additional_info, source_url, created_at
             FROM forbidden_items",
        )?;
        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<ForbiddenItem> {
            Ok(ForbiddenItem {
                id: row.get(0).ok(),
                hs_code: row.get(1)?,
                hs_code_4: row.get(2)?,
                hs_code_6: row.get(3)?,
                hs_code_8: row.get(4)?,
                description: row.get(5)?,
                additional_info: row.get(6)?,
                source_url: row.get(7)?,
                created_at: row.get(8).ok(),
                raw_text: None,
                has_exceptions: None,
            })
        };
        let _ = has_new_columns; // diff 不依赖 raw_text
        let rows = stmt.query_map([], map_row)?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }
```

- [ ] **Step 2: 在 update_alta_database 写库前插入 diff + 写历史**

在 `src-tauri/src/commands/alta/commands.rs` 顶部 `use` 区增加:

```rust
use crate::commands::update_history::database::HistoryDatabase;
use crate::commands::update_history::diff::diff_forbidden_items;
```

在 `update_alta_database` 中，`let count = db.update_forbidden_items(items)...` **之前**插入读取旧库；**之后**插入写历史。改造为：

```rust
    // 更新数据库
    let db = state.db.lock().map_err(|e| {
        error!("Failed to lock database: {}", e);
        CommandError::new("系统错误", "LOCK_ERROR")
    })?;

    // 旁路：更新前快照旧数据，用于 diff
    let old_items = db.get_all_forbidden_items().unwrap_or_default();
    let new_items = items.clone();

    let count = db.update_forbidden_items(items).map_err(|e| {
        error!("更新数据库失败: {}", e);
        CommandError::from(e)
    })?;
    drop(db); // 释放锁，避免与 HistoryDatabase 冲突

    info!("数据库更新成功，共 {} 条记录", count);

    // 写入变更历史（失败不阻断）
    if let Ok(history_db) = HistoryDatabase::new(app_handle) {
        let session_id = uuid::Uuid::new_v4().to_string();
        let records = diff_forbidden_items(&old_items, &new_items, &session_id);
        if let Err(e) = history_db.insert_changes(&records) {
            log::warn!("写入变更历史失败(alta): {}", e);
        }
    }
```

> 注意：`update_alta_database` 原签名无 `app_handle` 参数，需新增。将函数签名改为：
> `pub async fn update_alta_database(state: State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<UpdateResult, CommandError>`
> Tauri 命令会自动注入 `AppHandle`。

- [ ] **Step 3: 验证编译**

Run: `cd src-tauri && rtk cargo check`
Expected: 编译通过

- [ ] **Step 4: Commit**

```bash
rtk git add src-tauri/src/commands/alta/database.rs src-tauri/src/commands/alta/commands.rs
rtk git commit -m "feat(update-history): alta 更新对比新旧清单写入变更记录"
```

---

## Task 8: 前端 API 封装 + 类型

**Files:**
- Create: `src/lib/api/updateHistory.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: 在 types/index.ts 增加类型**

在 `src/types/index.ts` 末尾增加:

```ts
/** 更新历史中一次更新的摘要 */
export interface UpdateSessionSummary {
  session_id: string;
  module: 'tax' | 'alta';
  update_type: 'full' | 'single';
  version_to: string | null;
  timestamp: string;
  change_count: number;
}

/** 单条变更明细 */
export interface UpdateChangeDetail {
  id: number;
  session_id: string;
  module: 'tax' | 'alta';
  update_type: 'full' | 'single';
  version_from: string | null;
  version_to: string | null;
  timestamp: string;
  code: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  change_type: 'added' | 'removed' | 'modified';
}
```

- [ ] **Step 2: 创建 API 封装**

`src/lib/api/updateHistory.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import type { UpdateSessionSummary, UpdateChangeDetail } from '@/types';

export const updateHistoryApi = {
  /** 查询更新历史列表（module 可选，限定 50 条） */
  async listSessions(module?: 'tax' | 'alta'): Promise<UpdateSessionSummary[]> {
    return invoke<UpdateSessionSummary[]>('get_update_sessions', { module, limit: 50 });
  },

  /** 查询某次更新的明细 */
  async getDetails(sessionId: string): Promise<UpdateChangeDetail[]> {
    return invoke<UpdateChangeDetail[]>('get_update_details', { sessionId });
  },

  /** 清理历史（before 为 ISO 时间则清理更早，否则清空全部） */
  async clear(before?: string): Promise<number> {
    return invoke<number>('clear_update_history', { before });
  },
};
```

- [ ] **Step 3: 类型检查**

Run: `rtk tsc`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
rtk git add src/lib/api/updateHistory.ts src/types/index.ts
rtk git commit -m "feat(update-history): 前端 API 封装与类型定义"
```

---

## Task 9: 共用「更新历史」弹窗组件

**Files:**
- Create: `src/components/update-history/UpdateHistoryDialog.tsx`

- [ ] **Step 1: 创建组件**

`src/components/update-history/UpdateHistoryDialog.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { History, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { updateHistoryApi } from '@/lib/api/updateHistory';
import type { UpdateSessionSummary, UpdateChangeDetail } from '@/types';

interface Props {
  /** 限定模块；不传则显示全部 */
  module?: 'tax' | 'alta';
  triggerLabel?: string;
}

const MODULE_LABEL: Record<string, string> = { tax: '关税', alta: '禁运' };
const TYPE_LABEL: Record<string, string> = { full: '全量更新', single: '单行更新' };
const CHANGE_LABEL: Record<string, string> = {
  added: '新增', removed: '删除', modified: '修改',
};

export function UpdateHistoryDialog({ module, triggerLabel = '更新历史' }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<UpdateSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [details, setDetails] = useState<UpdateChangeDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    try {
      setSessions(await updateHistoryApi.listSessions(module));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadSessions();
  }, [open]);

  const showDetails = async (sessionId: string) => {
    setActiveSession(sessionId);
    setDetailLoading(true);
    try {
      setDetails(await updateHistoryApi.getDetails(sessionId));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>更新历史{module ? `（${MODULE_LABEL[module]}）` : ''}</DialogTitle>
        </DialogHeader>

        {activeSession ? (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" onClick={() => setActiveSession(null)}>
              ← 返回列表
            </Button>
            {detailLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">编码</th>
                      <th className="p-2 text-left">字段</th>
                      <th className="p-2 text-left">旧值</th>
                      <th className="p-2"></th>
                      <th className="p-2 text-left">新值</th>
                      <th className="p-2 text-left">类型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="p-2 font-mono">{d.code}</td>
                        <td className="p-2">{d.field ?? '—'}</td>
                        <td className="p-2 text-muted-foreground">{d.old_value ?? '—'}</td>
                        <td className="p-2"><ArrowRight className="h-3 w-3" /></td>
                        <td className="p-2">{d.new_value ?? '—'}</td>
                        <td className="p-2">{CHANGE_LABEL[d.change_type] ?? d.change_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : sessions.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">暂无更新记录</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.session_id}
                onClick={() => showDetails(s.session_id)}
                className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-muted"
              >
                <div>
                  <span className="font-medium">{MODULE_LABEL[s.module]}</span>
                  <span className="ml-2 text-sm text-muted-foreground">{TYPE_LABEL[s.update_type]}</span>
                  {s.version_to && <span className="ml-2 text-sm">v{s.version_to}</span>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {new Date(s.timestamp).toLocaleString('zh-CN')} · {s.change_count} 条变更
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

> 说明：依赖 `@/components/ui/dialog`。若项目中尚无该组件，先运行 `npx shadcn@latest add dialog` 添加（项目已用 shadcn/ui 的 button/card）。

- [ ] **Step 2: 类型检查**

Run: `rtk tsc`
Expected: 无错误（若 dialog 组件缺失，先执行上一步的 shadcn add）

- [ ] **Step 3: Commit**

```bash
rtk git add src/components/update-history/UpdateHistoryDialog.tsx
rtk git commit -m "feat(update-history): 新增更新历史弹窗组件"
```

---

## Task 10: 在 alta / tax 数据管理页加入口

**Files:**
- Modify: `src/features/alta/components/DataManageTab.tsx`
- Modify: `src/features/tax/components/UpdateTab.tsx`

- [ ] **Step 1: alta DataManageTab 加入口**

在 `src/features/alta/components/DataManageTab.tsx` 顶部 import 区增加:

```tsx
import { UpdateHistoryDialog } from '@/components/update-history/UpdateHistoryDialog';
```

在「数据库状态」Card 的 `CardContent` 内，更新按钮（`<Button onClick={handleUpdate} ...>`）之后插入:

```tsx
              <UpdateHistoryDialog module="alta" />
```

- [ ] **Step 2: tax UpdateTab 加入口**

在 `src/features/tax/components/UpdateTab.tsx` 顶部 import 区增加:

```tsx
import { UpdateHistoryDialog } from '@/components/update-history/UpdateHistoryDialog';
```

在页面顶层返回的容器中（操作按钮区域），插入:

```tsx
        <UpdateHistoryDialog module="tax" />
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `rtk tsc`
Expected: 无错误

- [ ] **Step 4: 端到端手动验证**

1. 启动应用
2. tax → 更新标签 → 触发全量更新（或单行更新）→ 打开「更新历史」→ 看到本次更新条目 → 点击查看明细（code/字段/旧→新/类型）
3. alta → 数据管理 → 更新禁运数据 → 打开「更新历史」→ 看到条目与明细
4. 验证「无变化不记录」：连续两次无变化的单行更新，第二次不新增记录

- [ ] **Step 5: Commit**

```bash
rtk git add src/features/alta/components/DataManageTab.tsx src/features/tax/components/UpdateTab.tsx
rtk git commit -m "feat(update-history): alta/tax 数据管理页加入更新历史入口"
```

---

## 完成标准

- [ ] `cargo test`（update_history 模块）全部通过
- [ ] `rtk tsc` 无错误
- [ ] 三个更新入口都能在「更新历史」产生记录，明细正确展示 old→new
- [ ] 写历史失败不阻断更新主流程（可手动制造历史库只读场景验证）
