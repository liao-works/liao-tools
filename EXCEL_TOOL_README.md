# Excel 数据拆分工具 - 迁移完成

## ✅ 迁移成功

已成功将三个独立的 Python Excel 工具（海铁有图版、海铁无图版、空运版）迁移并整合到 liao-tools 桌面应用中。

## 🎯 核心功能

### 支持的处理类型

1. **海铁数据（有图版）**
   - 重量列：第 13 列
   - 箱子列：第 11 列
   - 支持图片：是（待实现）

2. **海铁数据（无图版）**
   - 重量列：第 13 列
   - 箱子列：第 11 列
   - 支持图片：否

3. **空运数据**
   - 重量列：第 15 列
   - 箱子列：第 13 列
   - 支持图片：是（待实现）

### 处理能力

- ✅ 合并单元格检测和拆分
- ✅ 重量按比例分配
- ✅ 箱子列特殊处理
- ✅ 样式和格式保持
- ✅ 可配置列索引
- ✅ 实时日志显示
- ⚠️ 图片复制（作为后续增强功能）

## 📁 项目结构

### 后端文件

```
src-tauri/src/
├── commands/excel/          # Excel 处理模块
│   ├── mod.rs              # 模块导出
│   ├── commands.rs         # Tauri 命令（3个）
│   ├── config.rs           # 配置管理
│   ├── merge_parser.rs     # XML 解析合并单元格
│   ├── processor.rs        # 核心处理逻辑
│   ├── reader.rs           # Excel 读取（calamine）
│   └── writer.rs           # Excel 写入（rust_xlsxwriter）
└── models/excel.rs         # 数据模型
```

### 前端文件

```
src/
├── features/excel/
│   ├── ExcelPage.tsx                  # 主页面（标签页切换）
│   └── components/
│       ├── ProcessConfigPanel.tsx    # 配置编辑面板
│       └── ProcessLogPanel.tsx        # 日志显示
└── lib/api/excel.ts                  # TypeScript 类型定义
```

## 🚀 快速开始

### 1. 启动应用

```bash
cd liao-tools
npm run tauri dev
```

### 2. 使用步骤

1. 在左侧导航栏点击 "Excel数据处理工具"
2. 选择处理类型（海铁/空运）
3. 点击"选择 Excel 文件"
4. 点击"开始处理"
5. 查看日志，处理完成后文件自动保存到原目录

### 3. 自定义配置

在"配置管理"标签页可以修改：
- 重量列索引
- 箱子列索引
- 是否复制图片（当前不支持）

## 🔧 技术栈

### 后端 (Rust)

- **Tauri 2**: 桌面应用框架
- **calamine 0.26**: Excel 文件读取
- **rust_xlsxwriter 0.79**: Excel 文件写入
- **zip 0.6**: XLSX ZIP 结构解析
- **quick-xml 0.31**: XML 解析（合并单元格信息）
- **dirs 5.0**: 系统配置目录

### 前端 (React + TypeScript)

- **React 19**: UI 框架
- **TypeScript**: 类型安全
- **shadcn/ui**: UI 组件库
- **Lucide React**: 图标
- **Tauri API**: 文件对话框等

## 📊 核心算法

### 重量拆分算法

```
1. 检测合并单元格
2. 获取合并单元格总重量
3. 统计所有行的总数量（重量列前一列）
4. 计算单位重量 = 总重量 / 总数量
5. 为每行分配：行重量 = round(单位重量 × 行数量, 2)
```

### 箱子列处理

```
1. 第一行：保留原合并单元格值
2. 其他行：设置为 0
```

## 📝 配置文件

配置文件保存在用户配置目录：

**Windows**: `C:\Users\<用户名>\AppData\Roaming\liao-tools\excel_configs.json`

示例配置：

```json
{
  "sea-rail-with-image": {
    "process_type": "SeaRailWithImage",
    "weight_column": 13,
    "box_column": 11,
    "copy_images": true
  },
  "sea-rail-no-image": {
    "process_type": "SeaRailNoImage",
    "weight_column": 13,
    "box_column": 11,
    "copy_images": false
  },
  "air-freight": {
    "process_type": "AirFreight",
    "weight_column": 15,
    "box_column": 13,
    "copy_images": true
  }
}
```

## 🧪 测试建议

使用原项目的测试文件进行验证：

1. `python-excel/src/test_all.xlsx` - 海铁有图版测试
2. `python-excel-2/src/123.xlsx` - 海铁无图版测试
3. `python-excel-new-template/src/258件清单.xlsx` - 空运测试

**验证步骤**：
1. 运行新工具处理测试文件
2. 对比原 Python 版本的输出
3. 检查重量拆分、箱子列处理等是否正确

## ⚠️ 已知限制

1. **图片复制**: 当前版本不支持复制 Excel 图片到新文件
2. **复杂合并**: 只支持简单的矩形合并区域
3. **样式还原**: 部分复杂样式可能无法完全还原

## 🔮 后续增强计划

1. ⭐ **图片复制功能**
   - 从 XLSX ZIP 中提取图片
   - 解析图片位置信息
   - 插入到新文件

2. **批量处理**
   - 支持选择多个文件
   - 并行处理提升效率

3. **处理进度**
   - 显示处理进度条
   - 大文件处理优化

4. **高级配置**
   - 自定义输出文件名规则
   - 更多列的处理规则
   - 条件过滤功能

## 📚 相关文档

- [迁移详情](./EXCEL_MIGRATION.md) - 详细的迁移记录
- [架构文档](./src-tauri/ARCHITECTURE.md) - 后端架构说明
- [原项目](./python-excel/, ./python-excel-2/, ./python-excel-new-template/) - 原 Python 实现（已保留）

## 🎉 完成情况

- ✅ 后端 Rust 模块（7 个文件）
- ✅ 前端 React 组件（3 个文件）
- ✅ 配置管理系统
- ✅ 错误处理和用户提示
- ✅ 日志实时显示
- ✅ 类型安全（TypeScript + Rust）
- ⚠️ 图片复制（后续版本）

**状态**: 核心功能已完成，可正常使用 ✨
