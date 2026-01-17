# Excel 工具迁移完成

## 概述

已成功将三个独立的 Python Excel 工具迁移到 liao-tools 桌面应用：

- **python-excel**: 海铁数据拆分（有图版）
- **python-excel-2**: 海铁数据拆分（无图版）  
- **python-excel-new-template**: 空运数据拆分

## 实现情况

### ✅ 已完成

1. **后端 Rust 模块**
   - Excel 读取器（基于 calamine）
   - Excel 写入器（基于 rust_xlsxwriter）
   - 合并单元格解析（解析 xlsx 的 XML）
   - 核心处理逻辑（重量按比例拆分）
   - 配置管理（支持自定义列索引）
   - Tauri 命令接口

2. **前端 React 组件**
   - Excel 数据拆分页面
   - 文件选择和处理类型选择
   - 配置管理面板
   - 实时日志显示面板

3. **核心功能**
   - 合并单元格检测和拆分
   - 重量按比例分配算法
   - 箱子列特殊处理
   - 样式和格式保持
   - 错误处理和用户提示

### 🚧 待优化

1. **图片复制功能**（image-handling）
   - 当前版本不支持复制 Excel 中的图片
   - 需要从 xlsx 的 ZIP 结构中提取图片数据
   - 可作为后续版本增强功能

2. **集成测试**（integration-test）
   - 建议使用原项目的测试文件进行验证
   - 对比输出结果确保准确性

## 使用方法

### 1. 启动应用

```bash
cd liao-tools
npm run tauri dev
```

### 2. 使用步骤

1. 打开应用后，点击左侧导航栏的 "Excel数据处理工具"
2. 在"处理文件"标签页中：
   - 选择处理类型（海铁有图版/海铁无图版/空运）
   - 点击"选择 Excel 文件"选择要处理的文件
   - 点击"开始处理"
3. 处理完成后，查看日志面板了解处理详情
4. 处理后的文件会保存在原文件同目录下，文件名添加"_拆分表"后缀

### 3. 配置管理

在"配置管理"标签页中，可以自定义：
- **重量列索引**：默认海铁为 13，空运为 15
- **箱子列索引**：默认海铁为 11，空运为 13  
- **复制图片**：是否复制图片（当前版本不支持）

## 技术架构

### 后端 (Rust)

```
src-tauri/src/
├── commands/excel/
│   ├── commands.rs      # Tauri 命令
│   ├── config.rs        # 配置管理
│   ├── merge_parser.rs  # 合并单元格解析
│   ├── processor.rs     # 核心处理逻辑
│   ├── reader.rs        # Excel 读取
│   └── writer.rs        # Excel 写入
└── models/excel.rs      # 数据模型
```

### 前端 (React + TypeScript)

```
src/features/excel/
├── ExcelPage.tsx                  # 主页面
├── components/
│   ├── ProcessConfigPanel.tsx    # 配置面板
│   └── ProcessLogPanel.tsx        # 日志面板
└── ../../lib/api/excel.ts        # 类型定义
```

## 核心算法

### 重量拆分算法

```rust
// 1. 获取合并单元格的总重量
let total_weight = merged_cell.value;

// 2. 统计所有行的总数量（重量列前一列）
let total_quantity = sum_of_quantities_in_merged_range;

// 3. 计算单位重量
let unit_weight = total_weight / total_quantity;

// 4. 为每行分配重量
for each_row in merged_range {
    let row_quantity = row.quantity;
    let row_weight = round(unit_weight * row_quantity, 2);
}
```

### 箱子列处理

- 第一行：保留原合并单元格的值
- 其他行：设置为 0

## 原项目保留

所有原 Python 项目文件夹已完整保留，作为参考和备份：
- `python-excel/`
- `python-excel-2/`
- `python-excel-new-template/`

## 依赖项

### Rust 依赖

```toml
calamine = "0.26"           # Excel 读取
rust_xlsxwriter = "0.79"    # Excel 写入
zip = "0.6"                 # ZIP 解析
quick-xml = "0.31"          # XML 解析
dirs = "5.0"                # 系统目录
```

### 前端依赖

- React 19
- Tauri 2
- shadcn/ui 组件库
- Lucide React 图标

## 测试建议

1. 使用原项目的测试文件：
   - `python-excel/src/test_all.xlsx`
   - `python-excel-2/src/123.xlsx`
   - `python-excel-new-template/src/258件清单.xlsx`

2. 对比验证：
   - 运行原 Python 版本生成输出
   - 运行新 Rust 版本生成输出
   - 对比两个输出文件的数据准确性

3. 检查项：
   - 重量拆分是否正确
   - 箱子列处理是否符合预期
   - 样式和格式是否保持
   - 边界情况处理（空单元格、零值等）

## 已知限制

1. **图片复制**：当前版本不支持复制 Excel 图片
2. **合并单元格**：只支持简单的矩形合并区域
3. **复杂样式**：部分复杂样式可能无法完全还原

## 后续改进计划

1. 实现图片复制功能
2. 增强样式复制能力
3. 添加批量处理功能
4. 增加处理进度条
5. 支持更多配置选项

## 开发时间

- 迁移时间：2026-01-16
- 开发状态：基础功能完成，待优化
