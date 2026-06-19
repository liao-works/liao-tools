# 数据更新变更记录功能设计

**日期**: 2026-06-19
**状态**: 设计待审阅

## 1. 背景与目标

liao-tools 有三个数据更新入口（tax 全量下载、tax 单行刷新、alta 全量抓取），但目前更新后**无法追溯本次具体改了哪些数据**：

- tax 单行更新虽临时返回 old/new 税率（`UpdateResult`），但**不持久化**，关掉即丢
- 全量更新直接覆盖整个库，**无任何变更痕迹**

**目标**：为 tax 与 alta 两个数据模块的更新功能增加**持久化的行级变更记录**，让用户能查看「每次更新改了哪些数据、由什么变成什么」。

## 2. 范围

**In scope**
- tax 全量更新 (`tax_download_update`) 的行级 diff 记录
- tax 单行更新 (`tax_update_single_row`) 的变更记录（复用已有 old/new）
- alta 全量更新 (`update_alta_database`) 的行级 diff 记录
- 独立 `update_history.db` 存储
- 前端「更新历史」列表 + 明细查看

**Out of scope (YAGNI)**
- 自动清理 / 过期策略（预留 `clear_update_history` 命令，不做定时清理）
- metadata 改造（不要求 cursor-tax-tools 配合）
- 变更记录的导出 / 分享
- 变更回滚

## 3. 核心决策

| 维度 | 决策 | 理由 |
|------|------|------|
| 范围 | tax + alta 两模块 | 用户明确 |
| 粒度 | 行级明细 (old→new) | 直接回答「由什么变成什么」 |
| 存储 | 独立 `update_history.db`，单表扁平 | `tariffs.db` 会被全量替换，必须独立；单表实现简 |
| 查看 | 数据管理页「更新历史」列表 → 明细 | 持久可查 |

## 4. 架构与数据流

```
更新入口              diff 计算              持久化              查看
────────            ──────────            ────────            ────
tax 单行  ─┐
           ├─→  计算 old→new  ──→  写入           ──→  前端
tax 全量   ─┤   (单行复用 / 全量新增)  update_history.db   "更新历史"
           │                         (change_log 单表)    列表 + 明细
alta 全量  ─┘
```

**核心原则**：diff 与写历史是更新流程的**旁路**——更新成功优先；历史记录失败只 `log::warn!`，**不阻断主流程**。

## 5. 数据模型

`update_history.db` 单表 `change_log`：

```sql
CREATE TABLE change_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT    NOT NULL,    -- 会话分组键 (uuid)，同一次更新共享
    module       TEXT    NOT NULL,    -- 'tax' | 'alta'
    update_type  TEXT    NOT NULL,    -- 'full' | 'single'
    version_from TEXT,                 -- 仅 tax 全量有值
    version_to   TEXT,                 -- 仅 tax 全量有值
    timestamp    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    code         TEXT    NOT NULL,    -- 商品编码 / HS 编码
    field        TEXT,                 -- 变更字段 (uk_rate/ni_rate/description/status...)
    old_value    TEXT,                 -- NULL = 新增
    new_value    TEXT,                 -- NULL = 删除
    change_type  TEXT    NOT NULL     -- 'added' | 'removed' | 'modified'
);
CREATE INDEX idx_session   ON change_log(session_id);
CREATE INDEX idx_module_ts ON change_log(module, timestamp);
```

**查询方式**
- 历史列表：`SELECT session_id, module, update_type, version_to, timestamp, COUNT(*) FROM change_log GROUP BY session_id ORDER BY timestamp DESC`
- 明细：`SELECT * FROM change_log WHERE session_id = ?`

> 单表内用 `session_id` 做逻辑分组（同一次更新的所有变更共享一个 uuid），不引入第二张表——符合「单表扁平」选择，仍支持「列表 → 明细」两层查看。

## 6. 后端设计

### 6.1 新增模块 `src-tauri/src/commands/update_history/`

| 文件 | 职责 |
|------|------|
| `database.rs` | `HistoryDatabase`：`new`（自动建表）、`insert_changes`、`list_sessions`、`get_details`、`clear` |
| `diff.rs` | `tax_full_diff(old_conn, new_conn)` + `alta_diff(old_items, new_items)` |
| `commands.rs` | Tauri 命令：`get_update_sessions` / `get_update_details` / `clear_update_history` |

在 `lib.rs` 注册三个新命令。

### 6.2 diff 策略（三入口）

| 入口 | 时机 | 方式 |
|------|------|------|
| tax 单行 | 更新成功后 | 复用 `UpdateResult` 的 old/new，逐字段比对生成行 |
| tax 全量 | downloader 替换前 | 旧 `tariffs.db` vs 新 temp 库，SQL 逐 code 逐字段对比 |
| alta 全量 | `update_forbidden_items` 写库前 | 旧库 items vs 新抓取 items 对比 |

**tax 全量 diff 细节**
- 在 `downloader.download_and_install` 下载 temp 库后、`rename` 替换前插入
- rusqlite 打开旧库 + 新 temp 库两个连接
- **schema 容错**：取两库 `tariffs` 表的**列交集**，仅对比共有字段
- `added`：新库有、旧库无；`removed`：旧库有、新库无；`modified`：共有 code 的某共有字段值不同（每个变更字段一行）

### 6.3 集成点（最小侵入）

各入口在现有「更新成功」路径后插入写历史调用，失败用 `match` + `log::warn!` 兜底，不改动现有更新返回值与进度事件。

**无变化不记录**：若本次更新未产生任何字段变化（如抓取值与旧值相同），不写入 `change_log` 行，避免产生无意义记录。

## 7. 前端设计

- `src/lib/api/updateHistory.ts`：封装三个命令
- tax / alta 各自的 `DataManageTab.tsx` 加「更新历史」入口按钮
- 共用组件：历史列表（按 `module` 过滤）+ 明细表格（code / 字段 / 旧值→新值 / 类型）

## 8. 元数据依赖与要求

**核心结论**：行级 diff 与远程 metadata 解耦，**不要求 cursor-tax-tools 改造**。

- **version 填充规则**：
  - tax 全量 → `version_to` 取自 `metadata.version`，`version_from` 取自本地旧版本
  - alta 全量 + tax 单行 → `NULL`（无版本概念），**接受不对称**
- **schema 容错**：metadata 无 `schema_version` 字段，diff 按列交集动态对比，不依赖版本号
- **本地时序依赖**：diff 前提是「更新前旧数据还在」（tax 替换前旧库存 ✓，alta 写库前读旧库 ✓）

**风险项**：本功能唯一真正依赖的元数据是 `metadata.version`。实现前需核实其可靠性（`data-{run_number}` 是否稳定、本地 `tariffs.db.metadata.json` 是否正确持久化更新前版本）。

## 9. 错误处理

- diff / 写历史失败：`log::warn!` 记录，**不阻断更新**
- `update_history.db` 不存在 / 损坏：`HistoryDatabase::new` 自动重建建表
- 全量 diff 性能：SQL JOIN 在 SQLite 层完成，避免几万行读入内存

## 10. 测试

- `diff.rs` 单测：`added` / `removed` / `modified` / 无变化 四场景
- schema 容错单测：新旧库列不一致时按交集对比
- 集成测试：触发各更新 → 验证 `change_log` 记录正确（含 version 填充规则）

## 11. 开放问题

- 历史入口位置：默认放各自数据管理页；若需统一「更新历史」页可在实现阶段调整
- alta 表结构字段需实现时确认（diff 按实际表结构进行）
