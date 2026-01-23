# Liao Tools 项目概览

## 项目目的

Liao Tools 是一个集成多功能的桌面工具应用，使用 Tauri 2.0 + React + TypeScript 构建。

## 主要功能模块

### 1. Alta禁运商品查询系统
- 单个HS Code查询
- Excel批量处理
- 数据库自动更新
- 模板下载

### 2. 英国海关税率查询工具
- 单个商品编码查询（精确/模糊模式）
- 批量Excel查询
- 远程数据自动更新
- 右键菜单快捷操作

### 3. Excel数据处理工具
- UPS总结单处理
- DPD数据预报处理
- 支持明细表合并
- 进度实时显示

### 4. 设置模块
- 主题切换（亮色/暗色）
- 数据管理
- 应用配置

## 技术栈

- **桌面框架**: Tauri 2.0
- **前端框架**: React 19 + TypeScript 5.8
- **构建工具**: Vite 7
- **UI组件库**: shadcn/ui (基于 Radix UI)
- **样式方案**: Tailwind CSS 4
- **状态管理**: Zustand
- **路由**: React Router v7
- **图标库**: lucide-react
- **动画库**: framer-motion
- **日期处理**: date-fns

## 系统要求

- Node.js 18+
- Rust 1.70+
- Windows 10+

## 当前开发模式

项目目前使用 Mock 数据模拟后端交互，所有 Mock 数据位于 `src/mocks/` 目录：
- `alta.ts` - Alta查询Mock
- `tax.ts` - 税率查询Mock
- `excel.ts` - Excel处理Mock
- `utils.ts` - Mock工具函数
