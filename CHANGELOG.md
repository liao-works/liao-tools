# 更新日志

本文档记录了 Liao Tools 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2024-01-22

### ✨ 新功能
- 初始版本发布
- 实现 Alta 禁运商品查询系统
  - 单个 HS Code 查询
  - Excel 批量处理
  - 数据库自动更新
  - 模板下载
- 实现英国海关税率查询工具
  - 单个商品编码查询（精确/模糊模式）
  - 批量 Excel 查询
  - 远程数据自动更新
  - 右键菜单快捷操作
- 实现 Excel 数据处理工具
  - UPS 总结单处理
  - DPD 数据预报处理
  - 支持明细表合并
  - 进度实时显示
- 实现设置模块
  - 主题切换（亮色/暗色）
  - 数据管理
  - 应用配置

### 🐛 Bug 修复
- 修复数据导入时的格式问题
- 修复 Excel 文件读取错误

### 🎨 样式
- 使用 shadcn/ui 组件系统
- 实现响应式布局
- 支持亮色/暗色主题

### 🔧 构建/工具
- 集成 Tauri 2.0 桌面框架
- 配置 GitHub Actions 自动化发布
- 添加 CHANGELOG 自动生成功能

### ♻️ 重构
- 使用 Zustand 进行状态管理
- 使用 React Router v6 进行路由管理
