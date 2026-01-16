# 开发文档

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

前端将运行在 `http://localhost:1420`

### 3. 构建应用

```bash
npm run tauri build
```

## 开发指南

### 项目架构

```
src/
├── components/       # React组件
│   ├── ui/          # shadcn/ui基础组件
│   ├── layout/      # 布局组件（Sidebar, Topbar, MainLayout）
│   └── common/      # 通用组件（LoadingSpinner, EmptyState等）
├── features/        # 功能模块（按模块组织）
│   ├── alta/        # Alta禁运查询
│   ├── tax/         # 税率查询
│   ├── excel/       # Excel处理
│   └── settings/    # 设置
├── hooks/           # 自定义React Hooks
├── lib/             # 工具函数
├── mocks/           # Mock数据和API
├── types/           # TypeScript类型定义
├── App.tsx          # 路由配置
└── main.tsx         # 应用入口
```

### 模块结构

每个功能模块遵循以下结构：

```
features/[module]/
├── [Module]Page.tsx          # 主页面组件
├── components/               # 模块私有组件
│   ├── Tab1.tsx
│   ├── Tab2.tsx
│   └── ...
└── hooks/                    # 模块私有Hooks（可选）
```

### 添加新功能模块

1. **创建模块目录**
   ```bash
   mkdir -p src/features/newmodule/components
   ```

2. **创建主页面组件**
   ```tsx
   // src/features/newmodule/NewModulePage.tsx
   export function NewModulePage() {
     return (
       <div className="space-y-6">
         <div>
           <h2 className="text-3xl font-bold tracking-tight">模块标题</h2>
           <p className="text-muted-foreground">模块描述</p>
         </div>
         {/* 模块内容 */}
       </div>
     );
   }
   ```

3. **添加路由**
   ```tsx
   // src/App.tsx
   import { NewModulePage } from './features/newmodule/NewModulePage';
   
   // 在Routes中添加
   <Route path="newmodule" element={<NewModulePage />} />
   ```

4. **添加导航项**
   ```tsx
   // src/components/layout/Sidebar.tsx
   const navItems = [
     // ... 其他导航项
     {
       title: '新模块',
       href: '/newmodule',
       icon: SomeIcon,
       description: '模块描述',
     },
   ];
   ```

### 使用Mock数据

所有Mock数据位于 `src/mocks/` 目录。创建新的Mock服务：

```typescript
// src/mocks/newmodule.ts
import { delay } from './utils';
import type { SomeType } from '@/types';

export const mockSomeApi = async (param: string): Promise<SomeType> => {
  await delay(800); // 模拟网络延迟
  
  return {
    // Mock数据
  };
};
```

### 使用shadcn/ui组件

项目已配置shadcn/ui。使用现有组件：

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>标题</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>点击我</Button>
      </CardContent>
    </Card>
  );
}
```

### 主题和样式

#### 使用CSS变量

主题颜色在 `src/index.css` 中定义：

```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  /* ... */
}

.dark {
  --background: 0 0% 7%;
  --foreground: 0 0% 98%;
  --primary: 217 91% 60%;
  /* ... */
}
```

#### 使用Tailwind类

```tsx
<div className="bg-background text-foreground">
  <h1 className="text-primary">标题</h1>
  <Button variant="outline" size="lg">按钮</Button>
</div>
```

#### 条件样式

使用 `cn()` 工具函数：

```tsx
import { cn } from '@/lib/utils';

<div className={cn(
  'base-classes',
  condition && 'conditional-classes',
  'more-classes'
)}>
```

### TypeScript类型

在 `src/types/index.ts` 中定义全局类型：

```typescript
export interface NewType {
  id: string;
  name: string;
  // ...
}
```

### 状态管理

当前使用React内置状态管理（useState, useContext）。如需全局状态，可使用Zustand：

```typescript
// src/stores/useStore.ts
import { create } from 'zustand';

interface StoreState {
  count: number;
  increment: () => void;
}

export const useStore = create<StoreState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

### 常用开发任务

#### 添加新的shadcn/ui组件

```bash
npx shadcn-ui@latest add [component-name]
```

#### 格式化代码

```bash
npm run format  # 如果配置了prettier
```

#### 类型检查

```bash
npx tsc --noEmit
```

#### 构建生产版本

```bash
npm run tauri build
```

## 调试技巧

### 浏览器开发工具

开发模式下按 `F12` 打开Chrome DevTools。

### Tauri开发工具

在 `src-tauri/tauri.conf.json` 中设置：

```json
{
  "app": {
    "devtools": true
  }
}
```

### 查看Rust日志

```bash
cd src-tauri
RUST_LOG=debug cargo tauri dev
```

## 性能优化

### 代码分割

使用React.lazy进行路由级别代码分割：

```tsx
const AltaPage = lazy(() => import('./features/alta/AltaPage'));
```

### 优化重渲染

使用React.memo、useMemo、useCallback：

```tsx
const MemoizedComponent = memo(MyComponent);

const memoizedValue = useMemo(() => computeExpensiveValue(a, b), [a, b]);

const memoizedCallback = useCallback(() => {
  doSomething(a, b);
}, [a, b]);
```

## 常见问题

### Q: 如何修改窗口大小？
A: 在 `src-tauri/tauri.conf.json` 中修改：
```json
{
  "app": {
    "windows": [{
      "width": 1280,
      "height": 800
    }]
  }
}
```

### Q: 如何添加新的依赖？
A: 使用npm：
```bash
npm install package-name
```

### Q: 如何更改主题颜色？
A: 编辑 `src/index.css` 中的CSS变量和 `tailwind.config.js`

## 贡献指南

1. 保持代码风格一致
2. 为新功能编写类型定义
3. 遵循现有的目录结构
4. 使用语义化的commit消息
5. 测试新功能后再提交

## 相关资源

- [Tauri文档](https://tauri.app)
- [React文档](https://react.dev)
- [shadcn/ui文档](https://ui.shadcn.com)
- [Tailwind CSS文档](https://tailwindcss.com)
- [Radix UI文档](https://www.radix-ui.com)
