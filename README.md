# Liao Tools

一个集成多功能的桌面工具应用，使用 Tauri 2.0 + React + TypeScript 构建。

## 功能模块

### 1. Alta禁运商品查询系统
- ✅ 单个HS Code查询
- ✅ Excel批量处理
- ✅ 数据库自动更新
- ✅ 模板下载

### 2. 英国海关税率查询工具
- ✅ 单个商品编码查询（精确/模糊模式）
- ✅ 批量Excel查询
- ✅ 远程数据自动更新
- ✅ 右键菜单快捷操作

### 3. Excel数据处理工具
- ✅ UPS总结单处理
- ✅ DPD数据预报处理
- ✅ 支持明细表合并
- ✅ 进度实时显示

### 4. 设置模块
- ✅ 主题切换（亮色/暗色）
- ✅ 数据管理
- ✅ 应用配置

## 技术栈

- **桌面框架**: Tauri 2.0
- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI组件库**: shadcn/ui (基于 Radix UI)
- **样式方案**: Tailwind CSS
- **状态管理**: Zustand
- **路由**: React Router v6
- **图标库**: lucide-react
- **动画库**: framer-motion

## 开发环境

### 系统要求
- Node.js 18+
- Rust 1.70+
- Windows 10+

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

应用将在开发模式下运行，前端服务运行在 `http://localhost:1420`

### 构建应用

```bash
npm run tauri build
```

将生成可执行文件到 `src-tauri/target/release/bundle`

## 项目结构

```
liao-tools/
├── src/
│   ├── components/         # React组件
│   │   ├── ui/            # shadcn/ui组件
│   │   ├── layout/        # 布局组件
│   │   └── common/        # 通用组件
│   ├── features/          # 功能模块
│   │   ├── alta/          # Alta查询模块
│   │   ├── tax/           # 税率查询模块
│   │   ├── excel/         # Excel处理模块
│   │   └── settings/      # 设置模块
│   ├── hooks/             # React Hooks
│   ├── lib/               # 工具函数
│   ├── mocks/             # Mock数据服务
│   ├── stores/            # 状态管理
│   ├── types/             # TypeScript类型
│   ├── App.tsx            # 应用入口
│   └── main.tsx           # React入口
├── src-tauri/             # Tauri配置
├── tailwind.config.js     # Tailwind配置
└── vite.config.ts         # Vite配置
```

## 功能说明

### Alta禁运商品查询

1. **单个查询**: 输入HS编码，快速查询禁运状态
2. **批量处理**: 上传Excel文件，批量查询并生成结果
3. **数据管理**: 自动从服务器更新禁运数据库

### 英国海关税率查询

1. **精确查询**: 完全匹配商品编码
2. **模糊查询**: 搜索相似编码和描述
3. **批量查询**: Excel文件批量查询
4. **自动更新**: 检查并下载最新税率数据

### Excel数据处理

1. **选择处理类型**: UPS或DPD
2. **上传文件**: 主数据文件和可选明细表
3. **自动处理**: 填充模板并生成结果

## 开发说明

### Mock数据

当前版本使用Mock数据模拟后端交互，位于 `src/mocks/` 目录：
- `alta.ts` - Alta查询Mock
- `tax.ts` - 税率查询Mock
- `excel.ts` - Excel处理Mock
- `utils.ts` - Mock工具函数

### 添加新功能

1. 在 `src/features/` 下创建新模块目录
2. 创建页面组件和子组件
3. 在 `src/App.tsx` 中添加路由
4. 在侧边栏 `src/components/layout/Sidebar.tsx` 中添加导航项

### UI组件

使用shadcn/ui组件系统，组件位于 `src/components/ui/`。

添加新组件：
```bash
npx shadcn-ui@latest add [component-name]
```

## 版本历史

### v1.0.0 (2024-01-16)
- ✅ 初始版本发布
- ✅ 实现Alta禁运查询模块
- ✅ 实现税率查询模块
- ✅ 实现Excel处理模块
- ✅ 实现设置模块
- ✅ 暗色主题支持
- ✅ 响应式布局

## 许可证

Copyright © 2024 Liao Tools. All rights reserved.
