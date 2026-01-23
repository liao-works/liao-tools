# Liao Tools 代码风格和约定

## 命名约定

### 组件
- 使用 PascalCase
- 文件名与组件名一致
- 示例: `AltaPage.tsx`, `Button.tsx`, `QueryTab.tsx`

### 函数和变量
- 使用 camelCase
- Hooks 必须以 `use` 开头
- 示例: `useDarkMode`, `getEffectiveDarkMode`, `setMode`

### 类型和接口
- 使用 PascalCase
- 示例: `AltaQueryResult`, `DarkModeType`, `ThemeStore`

### 常量
- 使用 UPPER_SNAKE_CASE
- 示例: `DARK_MODE_KEY`, `DEFAULT_THEME_ID`

## 文件组织约定

### 目录结构
```
src/
├── components/         # React组件
│   ├── ui/            # shadcn/ui基础组件
│   ├── layout/        # 布局组件（Sidebar, Topbar, MainLayout）
│   └── common/        # 通用组件
├── features/          # 功能模块
│   ├── alta/          # Alta查询模块
│   │   ├── AltaPage.tsx      # 主页面
│   │   └── components/       # 模块私有组件
│   ├── tax/           # 税率查询模块
│   ├── excel/         # Excel处理模块
│   └── settings/      # 设置模块
├── hooks/             # 自定义React Hooks
├── lib/               # 工具函数
├── mocks/             # Mock数据服务
├── stores/            # Zustand状态管理
├── types/             # TypeScript类型定义
├── App.tsx            # 路由配置
└── main.tsx           # 应用入口
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

## React 组件约定

### 组件定义
- 使用函数式组件
- 导出命名函数而非默认导出
- 示例:
```tsx
export function AltaPage() {
  return <div>...</div>;
}
```

### Hooks 使用
- 所有 Hooks 必须以 `use` 开头
- 自定义 Hooks 放在 `src/hooks/` 或模块内的 `hooks/` 目录

### Props 定义
- 使用 TypeScript 接口定义 Props
- 对于 UI 组件，使用 `VariantProps` 从 `class-variance-authority`

## TypeScript 约定

### 配置
- 严格模式开启: `"strict": true`
- 未使用变量会报错: `"noUnusedLocals": true`, `"noUnusedParameters": true`
- Switch 必须完整: `"noFallthroughCasesInSwitch": true`

### 类型定义
- 所有类型定义在 `src/types/index.ts`
- 使用 `interface` 定义对象结构
- 使用 `type` 定义联合类型、别名等
- 示例:
```typescript
export interface AltaQueryResult {
  code: string;
  status: 'forbidden' | 'safe';
  description: string;
}

export type ExcelProcessType = 'UPS' | 'DPD';
```

## 样式约定

### Tailwind CSS
- 使用 Tailwind CSS 进行样式管理
- 使用 `cn()` 工具函数合并类名（来自 `@/lib/utils`）
- 示例:
```tsx
import { cn } from '@/lib/utils';

<div className={cn(
  'base-classes',
  condition && 'conditional-classes',
  'more-classes'
)}>
```

### 主题系统
- 使用 CSS 变量管理主题颜色
- 支持亮色和暗色主题
- 主题定义在 `src/index.css`
- 使用 Tailwind 的语义化颜色类: `bg-background`, `text-primary`, `border-border` 等

### 组件样式
- UI 组件使用 shadcn/ui 组件系统
- 使用 `class-variance-authority` 管理组件变体
- 示例:
```tsx
const buttonVariants = cva(
  "base-classes",
  {
    variants: {
      variant: {
        default: "...",
        destructive: "...",
      },
    },
  }
);
```

## 状态管理约定

### Zustand Store
- 全局状态使用 Zustand 管理
- Store 文件放在 `src/stores/` 目录
- 使用 `persist` 中间件持久化状态
- 示例:
```typescript
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      // state
      changeTheme: (themeId: string) => {
        // action
      },
    }),
    {
      name: 'storage-name',
    }
  )
);
```

### 本地状态
- 组件内状态使用 `useState`
- 副作用使用 `useEffect`

## 导入约定

### 路径别名
- 使用 `@` 指向 `src` 目录
- 配置在 `tsconfig.json` 和 `vite.config.ts`
- 示例:
```typescript
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AltaQueryResult } from '@/types';
```

### 导入顺序
1. React 相关
2. 第三方库
3. 组件
4. Hooks
5. 工具函数
6. 类型

## 代码格式化

- 项目没有配置 ESLint 和 Prettier
- 使用 TypeScript 编译器进行类型检查
- 建议遵循现有代码风格保持一致性

## Mock 数据约定

- 所有 Mock 数据位于 `src/mocks/` 目录
- Mock 函数使用 `async/await` 和 `delay` 模拟网络延迟
- Mock 函数返回与真实 API 相同的数据结构
- 示例:
```typescript
export const mockSomeApi = async (param: string): Promise<SomeType> => {
  await delay(800);
  return { /* Mock data */ };
};
```
