# 数据变动追踪 实现计划（liao-tools 客户端端）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** liao-tools 用两条互补路径实现「知道所有数据变动 + 每个版本的变化内容」：① **版本历史**（持久化 change_log）由客户端自己 diff 本地旧库 vs 新库得出（准确反映本地实际状态，removed/added 带商品描述）；② **更新前预览**（临时展示）用服务端 `data_changes` 提示「本次会新增/删除/修改哪些」。

**Architecture:** 增强 `diff_tariffs`（removed/added 携带商品描述，从本地旧库/新库取）→ 版本历史保持客户端 diff 驱动（已实现的 `record_full_update_diff`）→ 新增 `DataChanges` 模型挂在 `RemoteMetadata`，`check_update` 透传给前端 → 前端「检查更新」时展示预览摘要。

**Tech Stack:** Rust（rusqlite、serde）、Tauri 2、React + TypeScript、cargo test

**与 cursor-tax-tools Plan 1 的关系**：Plan 1 生成 `data_changes`（随 metadata 发布），本 plan 把它用作「更新前预览」（非版本历史来源）。版本历史始终由客户端 diff 保证准确。

---

## File Structure

- Modify: `src-tauri/src/models/tax.rs` — 新增 `ChangelogEntry`/`DataChanges`/`ChangelogSummary`，`RemoteMetadata` 增加 `data_changes`；`TaxVersionInfo` 增加 `data_changes` 字段（透传预览）
- Modify: `src-tauri/src/commands/update_history/diff.rs` — 增强 `diff_tariffs`：removed/added 带商品描述
- Modify: `src-tauri/src/commands/tax/downloader.rs` — `check_update` 把 `remote_metadata.data_changes` 放入 `TaxVersionInfo`
- Modify: `src/types/index.ts` — 前端 `DataChanges` 类型
- Modify: `src/features/tax/components/UpdateTab.tsx` — 「检查更新」展示预览摘要

---

## Task 1: Rust 模型 — `DataChanges` + `TaxVersionInfo` 透传

**Files:** Modify `src-tauri/src/models/tax.rs`

- [ ] **Step 1: 新增三个 struct（放在 `RemoteMetadata` 之前）**

```rust
/// 单条数据变动（服务端 data_changes.changes 元素，用于更新前预览）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelogEntry {
    pub code: String,
    pub change_type: String, // 'added' | 'removed' | 'modified'
    #[serde(default)]
    pub description: String,
    pub field: Option<String>,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChangelogSummary {
    #[serde(default)]
    pub added: i64,
    #[serde(default)]
    pub removed: i64,
    #[serde(default)]
    pub modified: i64,
}

/// 服务端发布的版本数据变动明细（更新前预览用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataChanges {
    pub version: Option<String>,
    pub previous_version: Option<String>,
    #[serde(default)]
    pub summary: ChangelogSummary,
    #[serde(default)]
    pub changes: Vec<ChangelogEntry>,
}
```

- [ ] **Step 2: `RemoteMetadata` 增加 `data_changes`**

在 `RemoteMetadata` struct 内末尾增加：

```rust
    #[serde(default)]
    pub data_changes: Option<DataChanges>,
```

- [ ] **Step 3: `TaxVersionInfo` 增加 `data_changes`（透传给前端预览）**

在 `TaxVersionInfo` struct 内增加：

```rust
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_changes: Option<DataChanges>,
```

- [ ] **Step 4: 验证编译**

Run: `cd src-tauri && rtk cargo check`
Expected: 编译通过（`TaxVersionInfo` 新字段会在 Task 3 的 check_update 填充）

- [ ] **Step 5: Commit**

```bash
rtk git add src-tauri/src/models/tax.rs
rtk git commit -m "feat(update-history): DataChanges 模型，RemoteMetadata/TaxVersionInfo 增加 data_changes"
```

---

## Task 2: 增强 `diff_tariffs` — removed/added 带商品描述（TDD，核心）

**背景**：版本历史由客户端 diff 记录。现有 `diff_tariffs` 的 removed/added 只记 code（`field=None, old=None, new=None`），用户看到「9403208000 删除」却不知是什么商品。增强：removed 存旧描述、added 存新描述（从本地旧库/新库的 `TaxTariff.description` 取）。

**Files:** Modify `src-tauri/src/commands/update_history/diff.rs`

- [ ] **Step 1: 更新现有测试，反映新行为（added/removed 带描述）**

在 `src-tauri/src/commands/update_history/diff.rs` 的 `#[cfg(test)] mod tests` 内，**修改** `tariff` 辅助函数加 description，并更新 `test_diff_added_removed_modified`：

```rust
    fn tariff(code: &str, rate: &str, ni: Option<&str>) -> TaxTariff {
        TaxTariff {
            code: code.into(),
            description: Some(format!("商品{}", code)),  // 测试用描述
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

        // 01: rate 5%→6% (modified)
        assert!(recs.iter().any(|r| r.code == "01" && r.field.as_deref() == Some("rate")
            && r.old_value.as_deref() == Some("5%") && r.new_value.as_deref() == Some("6%")));
        // 02: removed，old_value=旧描述
        let removed = recs.iter().find(|r| r.code == "02" && r.change_type == "removed").unwrap();
        assert_eq!(removed.old_value.as_deref(), Some("商品02"));
        assert_eq!(removed.new_value, None);
        assert_eq!(removed.field, None);
        // 03: added，new_value=新描述
        let added = recs.iter().find(|r| r.code == "03" && r.change_type == "added").unwrap();
        assert_eq!(added.new_value.as_deref(), Some("商品03"));
        assert_eq!(added.old_value, None);
        assert_eq!(added.field, None);
    }

    #[test]
    fn test_diff_no_change() {
        let old = vec![tariff("01", "5%", None)];
        let new = vec![tariff("01", "5%", None)];
        assert!(diff_tariffs(&old, &new, "s1", None, None).is_empty());
    }
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && rtk cargo test update_history::diff::tests -- --nocapture`
Expected: FAIL（`test_diff_added_removed_modified` 断言 removed.old_value == "商品02" 失败，因当前 old_value=None）

- [ ] **Step 3: 增强 `diff_tariffs` 的 added/removed 分支**

在 `diff_tariffs` 内：

added 分支（原 `for (code, _n) in &new_map` 改为用 `n` 存描述）：

```rust
    // added：新有旧无（new_value 存新商品描述）
    for (code, n) in &new_map {
        if !old_map.contains_key(code) {
            out.push(mk(code, None, None, n.description.clone(), "added"));
        }
    }
```

removed 分支（原 `None => out.push(mk(code, None, None, None, "removed"))` 改为存旧描述）：

```rust
            None => out.push(mk(code, None, o.description.clone(), None, "removed")),
```

> `n.description` / `o.description` 都是 `Option<String>`，与 `mk` 的 `old_v/new_v: Option<String>` 类型匹配。`mk` 闭包不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && rtk cargo test update_history::diff::tests -- --nocapture`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
rtk git add src-tauri/src/commands/update_history/diff.rs
rtk git commit -m "feat(update-history): diff_tariffs 的 removed/added 携带商品描述"
```

---

## Task 3: `check_update` 透传 data_changes（更新前预览数据）

**Files:** Modify `src-tauri/src/commands/tax/downloader.rs`

- [ ] **Step 1: `check_update` 把 remote data_changes 放入 TaxVersionInfo**

在 `downloader.rs` 的 `check_update` 方法内，构建 `TaxVersionInfo` 的 `Ok(TaxVersionInfo { ... })` 处（原 4 字段），增加 `data_changes`：

```rust
        Ok(TaxVersionInfo {
            local: local_version,
            remote: remote_version,
            has_update,
            changelog: remote_metadata.changelog.clone(),
            data_changes: remote_metadata.data_changes.clone(),
        })
```

- [ ] **Step 2: 验证编译 + 全部测试**

Run: `cd src-tauri && rtk cargo check && rtk cargo test update_history -- --nocapture`
Expected: 编译通过；测试 PASS

- [ ] **Step 3: Commit**

```bash
rtk git add src-tauri/src/commands/tax/downloader.rs
rtk git commit -m "feat(update-history): check_update 透传 data_changes 供前端更新前预览"
```

---

## Task 4: 前端更新前预览展示

**Files:** Modify `src/types/index.ts`、`src/features/tax/components/UpdateTab.tsx`

- [ ] **Step 1: `src/types/index.ts` 增加 DataChanges 类型**

在 `TaxVersionInfo` 定义附近增加，并给 `TaxVersionInfo` 加字段：

```ts
/** 服务端数据变动摘要（更新前预览） */
export interface DataChanges {
  version: string | null;
  previous_version: string | null;
  summary: { added: number; removed: number; modified: number };
  changes: Array<{
    code: string;
    change_type: 'added' | 'removed' | 'modified';
    description: string;
    field: string | null;
    old_value: string | null;
    new_value: string | null;
  }>;
}
```

并在 `TaxVersionInfo` interface 内增加：

```ts
  data_changes?: DataChanges | null;
```

- [ ] **Step 2: `UpdateTab.tsx` 的 `handleCheckUpdate` 展示预览**

在 `handleCheckUpdate` 内 `setVersionInfo(data)` 之后、`if (data.has_update)` 块内，增加预览日志与 toast：

```tsx
      if (data.has_update) {
        addLog(`发现新版本: ${data.remote.version}`);
        addLog(`新增记录: ${data.remote.records - data.local.records} 条`);
        // 更新前预览（来自服务端 data_changes）
        if (data.data_changes?.summary) {
          const s = data.data_changes.summary;
          addLog(`本次预计变动: 新增 ${s.added} / 删除 ${s.removed} / 修改 ${s.modified}`);
        }
        toast({
          title: '发现新版本',
          description: data.data_changes?.summary
            ? `新增 ${data.data_changes.summary.added} / 删除 ${data.data_changes.summary.removed} / 修改 ${data.data_changes.summary.modified}`
            : `版本 ${data.remote.version} 可用`,
        });
      } else {
```

- [ ] **Step 3: 类型检查**

Run: `rtk tsc`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
rtk git add src/types/index.ts src/features/tax/components/UpdateTab.tsx
rtk git commit -m "feat(update-history): 检查更新时展示 data_changes 更新前预览"
```

---

## Task 5: 端到端验证

- [ ] **Step 1: 编译 + 类型检查**

Run: `cd src-tauri && rtk cargo check` 与 `rtk tsc`
Expected: 均无错误

- [ ] **Step 2: 手动验证（需 cursor-tax-tools 已发布含 data_changes 的 metadata）**

1. `npm run tauri dev` 启动
2. tax → 更新标签 → 「检查更新」→ 日志应显示「本次预计变动: 新增 X / 删除 Y / 修改 Z」（来自 data_changes 预览）
3. 触发全量更新 → 打开「更新历史」→ 明细应显示：
   - removed 行：编码 + **旧值=商品描述** + 类型「删除」
   - added 行：编码 + **新值=商品描述** + 类型「新增」
   - modified 行：编码 + 字段 + 旧值→新值 + 类型「修改」
4. 无 data_changes 的旧 metadata → 预览不显示，版本历史仍由客户端 diff 记录（removed/added 仍带本地描述）

---

## 完成标准

- [ ] `cargo test update_history` 通过（diff_tariffs 增强后的测试）
- [ ] `rtk cargo check` + `rtk tsc` 无错误
- [ ] 版本历史（change_log）：客户端 diff，removed/added 带商品描述
- [ ] 更新前预览：check_update 展示 data_changes 摘要
- [ ] 两条路径互补：预览（服务端，提示）+ 历史（客户端 diff，准确记录）

## 设计要点（与 Plan 1 协同）

- **版本历史准确性**：客户端 diff 针对本地实际状态（即使跳过更新 v1→v5，记录的是真实的 v1→v5 变动，含描述）
- **预览时效性**：服务端 data_changes 是「最新版本 vs 上版本」，跳过更新时预览可能不完整，但仅作提示（实际以客户端 diff 历史为准）
- **向后兼容**：旧 metadata 无 data_changes → 预览不显示，版本历史不受影响
