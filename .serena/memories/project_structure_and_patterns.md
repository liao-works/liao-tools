# Liao Tools 项目结构和设计模式

## 目录结构

```
liao-tools/
├── public/                  # 静态资源
├── src/                     # 源代码
│   ├── components/          # React 组件
│   │   ├── ui/             # shadcn/ui 基础组件
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── ...
│   │   ├── layout/         # 布局组件
│   │   │   ├── MainLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Topbar.tsx
│   │   └── common/         # 通用组件
│   │       └── UpdateDialog.tsx
│   ├── features/           # 功能模块
│   │   ├── alta/           # Alta 禁运查询
│   │   │   ├── AltaPage.tsx
│   │   │   └── components/
│   │   │       ├── QueryTab.tsx
│   │   │       ├── BatchTab.tsx
│   │   │       └── DataManageTab.tsx
│   │   ├── tax/            # 税率查询
│   │   │   ├── TaxPage.tsx
│   │   │   └── components/
│   │   ├── excel/          # Excel 处理
│   │   │   ├── ExcelPage.tsx
│   │   │   └── components/
│   │   ├── ups-dpd/        # UPS/DPD 处理
│   │   │   └── UpsUpdPage.tsx
│   │   └── settings/       # 设置
│   │       └── SettingsPage.tsx
│   ├── hooks/              # 自定义 React Hooks
│   │   ├── use-dark-mode.ts
│   │   └── use-theme.ts
│   ├── lib/                # 工具函数
│   │   ├── utils.ts        # cn() 函数
│   │   └── themes.ts       # 主题相关
│   ├── mocks/              # Mock 数据服务
│   │   ├── alta.ts
│   │   ├── tax.ts
│   │   ├── excel.ts
│   │   └── utils.ts
│   ├── stores/             # Zustand 状态管理
│   │   └── theme-store.ts
│   ├── types/              # TypeScript 类型定义
│   │   └── index.ts
│   ├── assets/             # 资源文件
│   ├── App.tsx             # 路由配置
│   ├── App.css
│   ├── main.tsx            # React 入口
│   ├── index.css           # 全局样式和主题变量
│   └── vite-env.d.ts       # Vite 类型声明
├── src-tauri/              # Tauri 后端
│   ├── src/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .github/                # GitHub 相关
├── .gitignore
├── .cursor/                # Cursor IDE 配置
├── components.json         # shadcn/ui 配置
├── package.json
├── tsconfig.json          # TypeScript 配置
├── tsconfig.node.json     # Node TypeScript 配置
├── vite.config.ts         # Vite 配置
├── tailwind.config.js     # Tailwind 配置
├── postcss.config.js      # PostCSS 配置
├── index.html             # HTML 入口
├── README.md              # 项目说明
├── DEVELOPMENT.md         # 开发文档
└── GITHUB_UPDATE_SETUP.md # GitHub 更新设置
```

## 设计模式和架构

### 1. 模块化架构

项目采用模块化设计，每个功能模块独立组织：

**优点**:
- 功能解耦，易于维护
- 新功能添加简单
- 团队协作友好

**模块组织**:
```
features/[module]/
├── [Module]Page.tsx      # 主页面
├── components/           # 模块私有组件
└── hooks/                # 模块私有 Hooks（可选）
```

### 2. 组件分层

#### UI 组件层 (src/components/ui/)
- shadcn/ui 基础组件
- 无业务逻辑
- 高度可复用
- 使用 CVA 管理变体

#### 布局组件层 (src/components/layout/)
- 应用布局结构
- 处理路由和导航
- 包含 Sidebar、Topbar、MainLayout

#### 功能组件层 (src/features/*/components/)
- 特定功能的业务组件
- 组合 UI 组件和布局组件
- 包含业务逻辑

#### 通用组件层 (src/components/common/)
- 跨模块复用的组件
- 如 UpdateDialog

### 3. 状态管理策略

#### 本地状态
- 组件内使用 `useState`
- 简单状态管理
- 临时数据

#### 全局状态
- 使用 Zustand
- 跨组件共享状态
- 持久化（使用 `persist` 中间件）
- 当前使用: 主题管理 (`theme-store.ts`)

#### Context（如需要）
- React Context 用于主题上下文
- 配合 Zustand 使用

### 4. 路由设计

使用 React Router v7：
- 路由配置在 `src/App.tsx`
- 使用嵌套路由
- MainLayout 作为父路由
- 子路由在 MainLayout 内渲染

```tsx
<Route path="/" element={<MainLayout />}>
  <Route index element={<Navigate to="/alta" replace />} />
  <Route path="alta" element={<AltaPage />} />
  <Route path="tax" element={<TaxPage />} />
  <Route path="excel" element={<ExcelPage />} />
  <Route path="ups-dpd" element={<UpsUpdPage />} />
  <Route path="settings" element={<SettingsPage />} />
</Route>
```

### 5. 主题系统

#### 双主题支持
- 亮色主题
- 暗色主题
- 系统跟随模式

#### 实现方式
- CSS 变量定义颜色
- Tailwind 语义化类名
- `useDarkMode` Hook 管理主题切换
- Zustand 持久化主题偏好

#### CSS 变量
定义在 `src/index.css`:
```css
:root {
  --background: 0 0% 100%;
  --foreground: 220 15% 15%;
  --primary: 217 91% 55%;
  /* ... */
}

.dark {
  --background: 220 20% 6%;
  --foreground: 220 10% 94%;
  /* ... */
}
```

### 6. 类型系统

#### 集中管理
- 所有类型定义在 `src/types/index.ts`
- 按模块分组
- 清晰的接口和类型别名

#### 类型安全
- TypeScript 严格模式
- 无 `any` 类型使用
- 完整的类型注解

### 7. 样式管理

#### Tailwind CSS 4
- 工具优先的 CSS
- 高度可定制
- 暗色模式支持

#### shadcn/ui
- 基于 Radix UI
- 无样式组件库
- 完全可定制

#### 样式工具
- `cn()` 函数合并类名
- `class-variance-authority` 管理变体
- CSS 变量管理主题

### 8. Mock 数据模式

当前使用 Mock 数据模拟后端：
- Mock 服务在 `src/mocks/`
- 模拟网络延迟
- 返回真实数据结构
- 便于前端独立开发

**示例**:
```typescript
export const mockSomeApi = async (param: string): Promise<SomeType> => {
  await delay(800);
  return { /* data */ };
};
```

### 9. 路径别名

使用 `@` 别名指向 `src` 目录：
```typescript
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

配置在 `tsconfig.json` 和 `vite.config.ts`。

### 10. 桌面应用集成（Tauri）

#### 前后端分离
- 前端: React + TypeScript
- 后端: Rust
- 通过 Tauri API 通信

#### 开发模式
- 前端运行在 `http://localhost:1420`
- 热重载支持
- DevTools 集成

#### 构建模式
- 生成原生应用
- 跨平台支持
- 小体积打包

## 关键设计原则

### 1. 关注点分离
- UI 组件、布局、业务逻辑分离
- 状态管理与 UI 分离
- Mock 数据与真实 API 分离

### 2. 可复用性
- 高度模块化
- 组件可复用
- Hooks 可复用

### 3. 类型安全
- TypeScript 严格模式
- 完整类型定义
- 编译时错误检查

### 4. 用户体验
- 响应式设计
- 主题支持
- 流畅的动画（framer-motion）

### 5. 开发体验
- 清晰的目录结构
- 丰富的开发文档
- Mock 数据支持

## 扩展指南

### 添加新功能
1. 创建模块目录
2. 实现主页面组件
3. 添加路由
4. 添加导航项
5. 创建子组件
6. 定义类型
7. 添加 Mock 数据

### 添加全局状态
1. 在 `src/stores/` 创建 store
2. 定义状态和操作
3. 使用 `persist` 中间件（如需）
4. 在组件中使用

### 添加新 UI 组件
1. 使用 shadcn/ui CLI 添加
2. 自定义样式和变体
3. 在其他组件中使用

## 性能考虑

### 代码分割
- 路由级别代码分割（React.lazy）
- 按需导入

### 渲染优化
- 使用 `React.memo` 避免不必要的重渲染
- 使用 `useMemo` 缓存计算结果
- 使用 `useCallback` 缓存函数引用

### 资源优化
- 图片压缩
- 字体优化
- 懒加载

## 安全考虑

### 输入验证
- TypeScript 类型检查
- 表单验证

### XSS 防护
- React 自动转义
- 避免使用 `dangerouslySetInnerHTML`

### 数据安全
- 不在前端存储敏感信息
- Tauri 后端处理安全逻辑
