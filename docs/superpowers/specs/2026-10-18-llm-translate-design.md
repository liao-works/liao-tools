# 大模型翻译功能规格（liao-tools 桌面端）

- 日期：2026-10-18
- 状态：已评审通过（方向定稿），待实现
- 范围：新功能子系统——LLM 接入层（供应商配置 + 流式调用）+ 翻译工作台（翻译/润色/解释三模式）+ 持久化历史；不包含批量文件翻译、全局设置页改造

## 1. 背景与目标

liao-tools（Tauri 2 + React 19 + Rust）需要新增日常工作中使用的大模型翻译功能，主要场景是邮件往来。核心诉求：

1. 译文**兼顾口语与书面语，不要太过正式古板**——语气是第一诉求，需可控制预期；
2. 不只是翻译：还需**润色**（自己写的外文表达没把握）和**解释**（读懂对方邮件的语气与潜台词）；
3. 接入 DeepSeek 为主，Gemini 作为备选，未来可能增加其他供应商；
4. 会随安装版发布给其他用户，首次配置（申请 Key → 填入 → 排错）要有引导。

## 2. 需求决策记录

| 决策点 | 结论 |
|--------|------|
| 语言方向 | 中英为主（自动检测方向），下拉预留日/韩/德/法/西/俄 |
| 使用对象 | 随安装版发布给他人，需新手引导 |
| 功能形态 | 多模式：翻译 / 润色 / 解释 |
| 语气控制 | 三档预设（自然商务默认 / 轻松随和 / 严谨正式）+ 自定义补充框 |
| 供应商接入 | 通用 OpenAI 兼容层（`/chat/completions`），预置 DeepSeek / Gemini 模板 + 自定义槽位 |
| 流式输出 | 要（SSE → Tauri Channel） |
| Key 存储 | Rust 侧配置文件，前端只拿掩码 |
| 历史 | 持久化（SQLite），完成自动入历史 |

## 3. 总体架构（方案一：通用兼容层 + 单工作台页）

供应商差异被压缩为「模板数据」而非代码：所有请求统一走 OpenAI `/chat/completions` wire format，一个 Rust 客户端函数通吃。页面为单工作台，历史与供应商配置作为页内次级界面（抽屉 / 弹窗），不打主导航。

### 3.1 后端模块布局（新增 `commands/translate/`）

```
src-tauri/src/
├── commands/translate/
│   ├── mod.rs        # 模块出口 + 命令注册
│   ├── config.rs     # 供应商配置读写（translate_provider.json）
│   ├── client.rs     # OpenAI 兼容客户端（SSE 流式解析，走 core/http.rs 系统代理）
│   ├── prompt.rs     # 三模式 × 语气预设的提示词构建
│   ├── history.rs    # 历史库（translate_history.db，照 update_history 模式）
│   └── commands.rs   # #[tauri::command] 入口
└── models/translate.rs   # 请求/事件结构体（serde camelCase，遵守项目惯例）
```

### 3.2 前端模块布局（新增 `features/translate/`）

```
src/features/translate/
├── TranslatePage.tsx       # 页面骨架 + 模式切换 + 工具条
└── components/
    ├── Workbench.tsx       # 输入/输出双栏 + 复制
    ├── ToneSelector.tsx    # 语气三档 + 自定义补充
    ├── LanguageSelect.tsx  # 方向选择（含自动检测）
    ├── HistoryDrawer.tsx   # 历史抽屉
    └── ProviderDialog.tsx  # 供应商配置 + 新手引导
```

API 封装放 `src/lib/api/translate.ts`（照 `lib/api/tax.ts` 惯例包装 invoke）。

## 4. 供应商配置

### 4.1 存储结构

存 `app_data_dir/translate_provider.json`，Rust 读写，前端不直接触达：

```json
{
  "activeProvider": "deepseek",
  "deepseek": { "apiKey": "sk-...", "model": "deepseek-chat" },
  "gemini":   { "apiKey": "...", "model": "gemini-2.5-flash" },
  "custom":   { "baseUrl": "https://.../v1", "apiKey": "...", "model": "..." }
}
```

### 4.2 预置模板（编译在 Rust 内）

| 供应商 | Base URL | 模型 | 备注 |
|--------|----------|------|------|
| deepseek | `https://api.deepseek.com/v1` | `deepseek-chat`、`deepseek-reasoner` | 国内直连 |
| gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash`、`gemini-2.5-pro` | 官方 OpenAI 兼容端点，国内需系统代理（`core/http.rs` 已支持） |
| custom | 用户自填 | 用户自填 | 兼容任意 OpenAI 兼容服务（Kimi、智谱、OpenRouter、中转站等） |

每个预置供应商带官网申请链接，配置弹窗内做新手引导（选供应商 → 注册申请 Key → 粘贴保存，三步内完成）。

### 4.3 Key 脱敏

读取命令只返回 `{ activeProvider, provider 配置（model、baseUrl、apiKeyMask、configured） }`，其中 `apiKeyMask` 形如 `sk-***abcd`（保留末 4 位）。保存命令一次性接收新 Key 写入；前端任何界面不出现完整 Key。

## 5. 流式调用协议

### 5.1 命令与事件

- 命令：`translate_run(request: TranslateRequest, channel: Channel<TranslateEvent>)`
- 事件（serde camelCase）：

| 事件 | 载荷 | 说明 |
|------|------|------|
| `delta` | `{ text }` | 增量文本，前端追加渲染 |
| `done` | `{ historyId }` | 完成，已自动入历史 |
| `error` | `{ message }` | 失败，message 为用户可读中文 |

### 5.2 并发与中止

- 同时只允许一个活跃任务：新请求发起时自动中止旧任务；`translate_abort()` 手动中止。
- Rust 侧将当前任务的取消信号存入 `State`（`tokio::sync::watch` 频道 + `tokio::select!`，tokio 已是 full 特性，不引入新依赖）；中止后已生成的增量文本保留在前端。

### 5.3 HTTP 参数

- 客户端走 `core/http.rs` 的 `HttpClientBuilder`（自动附加 Windows 系统代理）；
- 连接超时 15s，总超时 180s（长文翻译需要，覆盖默认 30s）；
- `temperature` 统一 `1.3`（DeepSeek 官方翻译场景推荐值，Gemini 兼容端点同样适用）；
- URL 拼接规则：baseUrl 统一以 `/v1` 一类的版本段结尾（不含 `/chat/completions`），客户端去尾斜杠后拼接 `/chat/completions`；三个模板均按此约定。
- SSE 解析：逐行解析 `data:` 前缀，`[DONE]` 终止，取 `choices[0].delta.content`；跨 chunk 的半行需缓冲拼接；非 200 响应读 body 中的 `error.message` 参与错误映射。

## 6. 提示词设计（核心）

三模式共用骨架：模式差异段 + 语气段（翻译/润色）+ 自定义补充（翻译/润色），由 `prompt.rs` 纯函数构建，便于单测。

### 6.1 翻译模式

系统提示词要点：

> 你是商务沟通翻译助手。把用户输入翻译成目标语言。核心要求：译文要像目标语言的母语者自然写出来的，不是逐词对译；完整保留格式（称呼、换行、列表、签名）；人名、公司名、产品名有通用译名则用，否则保留原文；只输出译文，不要任何解释或前后缀。

语气档注入（控制「不古板」的关键）：

| 档位 | 值 | 注入的语气指令 |
|------|-----|----------------|
| 自然商务（默认） | `natural` | 清晰、礼貌、直接，像一位友善且经验丰富的职业人士的日常商务邮件。避免陈旧套话和堆砌敬语（如 "I hope this email finds you well" 这类开头酌情简化），用现代、自然的商务表达。 |
| 轻松随和 | `casual` | 像和熟识的同事或朋友写消息：可用口语化表达和缩略语，语气放松但不失分寸，不要公文化。 |
| 严谨正式 | `formal` | 适用于正式函件、合同沟通、对外投诉：措辞严谨完整，遵循正式书信惯例，但保持可读，不生硬古板。 |

自定义补充框内容作为附加指令追加（例：「对方是合作多年的老客户，语气可以随意些」）。

### 6.2 润色模式

不换语言。保持原文语言改写：修正语法错误和不地道表达，使文本更自然流畅；保留原意和格式，不增删信息；只输出改写结果。语气档同样适用。典型场景：自己写的英文邮件没把握，先润色再发。

### 6.3 解释模式

输入通常是收到的邮件，输出**中文**结构化说明，前端 Markdown 渲染，固定三段：

1. **整体语气与意图**——对方是在催促、客气拒绝、例行通知，还是暗示不满；
2. **关键表达解析**——习语、委婉语、商务套话的真实含义（如 "per my last email" 的潜台词）；
3. **备选译法**——挑 1–2 个关键句给出不同译法对比。

解释模式无语气选择（固定客观语气）。

## 7. 前端交互

### 7.1 工具条（随模式变化）

| 模式 | 控件 |
|------|------|
| 翻译 | 语言方向 + 语气三档 + 自定义补充展开框 |
| 润色 | 语气三档 + 自定义补充展开框 |
| 解释 | 无（固定结构） |

- 方向检测：前端启发式，CJK 字符占比 > 30% 判定「中文 → 英文」，否则「英文 → 中文」；显示检测结果，可手动覆盖；下拉预留日/韩/德/法/西/俄。
- 快捷键：Ctrl+Enter 运行；Esc 中止；运行中按钮变「停止」。
- 输入超 8000 字符提示一次（不阻断）。

### 7.2 输出区

- 流式追加渲染；完成后显示复制按钮；
- 解释模式输出 Markdown 渲染；
- 未配置供应商时显示引导卡片（选 DeepSeek / Gemini → 申请链接 → 填 Key）。

### 7.3 历史

- 完成**自动**入历史，`done` 事件带回 `historyId`；
- 抽屉展示：时间、模式、语气、原文/译文预览；点击回填工作台；
- 上限 500 条，超出 FIFO 清理；支持单条删除、一键清空。

### 7.4 入口

- 侧边栏新增「翻译」（路由 `/translate`，lucide `Languages` 图标）；
- 首页功能卡片区（若存在）加入口卡片。

## 8. 历史库

`app_data_dir/translate_history.db`（SQLite，照 `update_history` 的建库模式）：

```sql
CREATE TABLE IF NOT EXISTS translate_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  mode TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  tone TEXT,
  custom_note TEXT,
  provider TEXT,
  model TEXT,
  source_text TEXT NOT NULL,
  result_text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_translate_history_created_at
  ON translate_history(created_at DESC);
```

写入与查询由 `history.rs` 封装，命令透出：列表（分页）、删除单条、清空。

## 9. 错误处理

- 后端将错误映射为用户可读中文：`401` → 「API Key 无效或已过期」；`429` → 「请求过于频繁，请稍后再试」；`5xx` → 「供应商服务异常」；连接失败 → 「网络连接失败——Gemini 需要系统代理，请确认代理已开启」；其余 → 原始简要信息。
- SSE 中途断流：保留已收文本，报错提示可重试。
- API Key 不出现在任何错误消息和日志中。
- 未配置 Key 就发起请求：前端拦截并直接打开配置弹窗。

## 10. 测试策略

- **Rust 单测**：
  - `prompt.rs`：3 模式 × 3 语气 × 有/无自定义补充的构建结果快照断言；
  - `client.rs`：SSE 解析（跨 chunk 半行、`[DONE]`、错误响应体）；
  - `config.rs`：读写往返、掩码脱敏、损坏 JSON 容错；
  - `history.rs`：CRUD + FIFO 清理（临时 db 文件）。
- **手动验收**：真实 Key 跑通三模式与三档语气；中止/断网/错 Key 场景；历史回填；安装版覆盖升级后配置与历史保留。

## 11. 范围外（明确不做）

- 批量文件/Excel 翻译（将来可在此模块加子 tab，如 tax 的单条/批量模式）；
- 全局设置页改造（配置就近放翻译页）；
- 术语表/记忆库；
- 非 OpenAI 兼容协议（如 Claude 原生 API）——将来需要时再引入 provider trait；
- 多轮对话式翻译。
