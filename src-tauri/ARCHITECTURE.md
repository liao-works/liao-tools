# Liao Tools 后端架构说明

## 目录结构

```
src-tauri/src/
├── lib.rs                  # 应用入口，初始化和状态管理
├── main.rs                 # 主函数
│
├── commands/               # 命令层 - 按工具模块组织
│   ├── mod.rs
│   ├── error.rs           # 统一错误处理
│   │
│   └── alta/              # Alta 禁运查询工具
│       ├── mod.rs         # 模块导出
│       ├── commands.rs    # Tauri 命令定义
│       ├── scraper.rs     # 网页爬虫逻辑
│       ├── database.rs    # 数据库操作
│       ├── matcher.rs     # HS 编码匹配
│       └── excel.rs       # Excel 处理
│
├── core/                   # 核心层 - 通用基础能力
│   ├── mod.rs
│   ├── http.rs            # HTTP 客户端封装
│   ├── database.rs        # 数据库连接管理
│   └── html.rs            # HTML 解析工具
│
└── models/                 # 数据模型层
    ├── mod.rs
    └── alta.rs            # Alta 相关数据结构
```

## 设计原则

### 1. 模块化组织
每个工具（如 Alta）拥有独立的文件夹，包含该工具的所有业务逻辑：
- ✅ 代码内聚，相关功能集中
- ✅ 易于维护和扩展
- ✅ 清晰的模块边界

### 2. 分层架构

#### Commands 层 (`commands/`)
- **职责**：业务逻辑 + Tauri 命令接口
- **组织方式**：按工具模块分文件夹
- **示例**：`commands/alta/` 包含 Alta 工具的所有逻辑

#### Core 层 (`core/`)
- **职责**：通用基础能力，跨工具复用
- **内容**：
  - HTTP 客户端封装（统一超时、User-Agent 等）
  - 数据库连接管理（连接池、目录创建）
  - HTML 解析工具（选择器、表格提取）
  - 配置管理、日志工具等
- **原则**：
  - 不包含具体业务逻辑
  - 提供通用、可复用的基础能力
  - 降低各工具模块的重复代码

#### Models 层 (`models/`)
- **职责**：数据结构定义
- **内容**：请求/响应类型、数据实体
- **特点**：纯数据，无业务逻辑

### 3. 错误处理
统一的错误类型 `CommandError` 在 `commands/error.rs` 中定义，所有工具共享。

## 添加新工具

假设要添加"UK Tax"工具，按以下步骤操作：

### 1. 创建工具文件夹
```
commands/uk_tax/
├── mod.rs
├── commands.rs     # Tauri 命令
├── scraper.rs      # 业务逻辑 1
└── processor.rs    # 业务逻辑 2
```

### 2. 定义数据模型
```rust
// models/uk_tax.rs
#[derive(Serialize, Deserialize)]
pub struct TaxInfo {
    pub code: String,
    pub rate: String,
}
```

### 3. 实现 Tauri 命令
```rust
// commands/uk_tax/commands.rs
#[tauri::command]
pub async fn query_uk_tax(code: String) -> Result<TaxInfo, CommandError> {
    // 实现逻辑
}
```

### 4. 注册到主应用
```rust
// lib.rs
mod commands;

use commands::uk_tax::*;

tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        query_uk_tax,  // 新增
    ])
```

### 5. 更新 commands/mod.rs
```rust
// commands/mod.rs
pub mod uk_tax;
pub mod alta;
pub mod error;
```

## Core 基础能力示例

### HTTP 客户端 (`core/http.rs`)
```rust
use crate::core::http;

// 使用默认配置
let client = http::create_default_client();

// 自定义超时
let client = http::create_client_with_timeout(60);

// 完全自定义
let client = http::HttpClientBuilder::new()
    .timeout(Duration::from_secs(45))
    .user_agent("MyBot/1.0")
    .build()?;
```

### 数据库管理 (`core/database.rs`)
```rust
use crate::core::database as core_db;

// 创建连接（自动创建目录）
let conn = core_db::create_connection(&db_path)?;

// 批量创建索引
let indexes = [
    "CREATE INDEX idx_code ON table(code)",
    "CREATE INDEX idx_name ON table(name)",
];
core_db::create_indexes(&conn, &indexes)?;

// 检查表是否存在
if core_db::table_exists(&conn, "my_table")? {
    // ...
}
```

### HTML 解析 (`core/html.rs`)
```rust
use crate::core::html::HtmlParser;

// 解析 HTML
let doc = HtmlParser::parse(&html);

// 创建选择器
let selector = HtmlParser::selector("table.data")?;

// 提取表格数据
let rows = HtmlParser::extract_table_rows(&doc, "table.my-table")?;

// 清理文本
let clean = HtmlParser::clean_text("  messy   text  \n");

// 提取数字
let digits = HtmlParser::extract_digits("HS-1234-5678"); // "12345678"
```

## 最佳实践

### ✅ DO（推荐）
- 将工具的所有**业务逻辑**放在 `commands/{tool}/`
- 将**通用能力**（HTTP、数据库、解析）放在 `core/`
- 使用 `core` 的工具而不是重复实现
- 使用相对导入引用同一工具内的模块（`super::`）
- 数据结构定义在 `models/`
- 使用 `CommandError` 统一错误处理

### ❌ DON'T（避免）
- 不要在 `core/` 中放置**特定工具**的业务逻辑
- 不要在工具模块中重复实现通用功能（应该放 core）
- 不要跨工具直接调用（通过 core 或 trait 抽象）
- 不要在 `models/` 中包含业务逻辑
- 不要在 `commands.rs` 中写大段业务代码（提取到其他文件）

## 依赖关系

```
lib.rs
  ↓
commands/{tool}/commands.rs  (Tauri 命令)
  ↓
commands/{tool}/*.rs         (业务逻辑)
  ↓
models/*.rs                  (数据模型)
  ↓
core/*                       (通用工具)
```

## 当前工具模块

### Alta 禁运查询 (`commands/alta/`)
- `commands.rs`: 7个 Tauri 命令
- `scraper.rs`: Alta.ru 网页爬虫
- `database.rs`: SQLite 数据库操作
- `matcher.rs`: HS 编码匹配算法
- `excel.rs`: Excel 文件处理

## 扩展计划

未来可添加的工具模块：
- `commands/uk_tax/` - 英国海关税率查询
- `commands/excel_tools/` - Excel 数据处理
- `commands/pdf_tools/` - PDF 处理工具

每个工具独立、自包含，互不干扰。
