# 设计 Token 体系规格(liao-tools 桌面端)

- 日期:2026-10-04
- 状态:已评审通过(方向定稿),待实现
- 范围:全局设计 token 固化 + 硬编码清零;不包含页面布局改版

## 1. 背景与目标

liao-tools(Tauri 2 + React 19 + Tailwind CSS 4 + shadcn/ui,55 个 tsx / 约 9400 行)当前的样式基建只有一组 shadcn 风格颜色变量,存在以下问题:

1. 只有颜色 token,无排版、间距、圆角、阴影、动效、层级 token;
2. 无 success / warning / info 语义色,代码中散落 40+ 处 Tailwind 调色板硬编码(`text-green-500` 等),暗色模式不适配;
3. `body` 背景写死 `#FAFBFC` 与 token `--background` 打架;`.dark body` 写死 `#1d232a`;
4. `src/App.css` 是 Tauri 脚手架残留(另一套字体与全局 button/input 污染),已核实零引用;
5. 6 套运行时主题通过 `setProperty` 覆盖 6 个变量,`accent` 语义与 shadcn 冲突,且换主题时暗色基础色不动。

目标:建立三层 token 体系,固化"冷静专业工具流"设计语言,作为后续所有桌面 UI 优化的唯一取值来源。

## 2. 设计语言定位

**冷静专业工具流**(参照 Linear / Raycast):

- 低饱和、克制点缀;层次靠表面明度差与微弱边框,不靠重阴影;
- 信息密度偏高:基准字号 14px,标题收敛,行高紧凑但不压迫;
- 暗色优先(默认模式暗色),亮色同等一等公民;
- 单一强调色维度可切换,语义状态色自成体系。

## 3. Token 分层架构

```
Tier 1 原始层   --gray-1..12 中性阶、状态色基色、图表色板
                ↓ 只被语义层引用,组件不得直接使用
Tier 2 语义层   表面阶梯 / 文字阶梯 / 边框 / 状态五件套 / 强调色注入
                ↓
Tier 3 组件层   控件高度、图标尺寸、聚焦环约定
```

**兼容策略**:现有 shadcn 语义名(`--background`、`--muted`、`--text-muted-foreground` 等,全项目约 370 处引用)全部保留,新 token 是超集。shadcn/ui 组件与存量代码零破坏。

**格式约定**:

- 既有 shadcn token 的**名称与消费方式保持不变**;内部实现统一迁移为完整 CSS 颜色值(hex / rgba),不再使用 `H S% L%` 三元组;
- `@theme` 映射同步从 `hsl(var(--x))` 改为 `var(--x)` 直接引用;CSS 中遗留的 `hsl(var(--foreground) / α)` 写法改为等价完整 rgba;
- 组件与业务代码只经 Tailwind 工具类消费颜色,不受内部格式迁移影响;
- subtle(浅底)用固定 rgba 而非 `color-mix`,行为可预测。

**维度机制**:模式 = `<html>` 上的 `.dark` class(现有 `use-dark-mode.ts` 机制,不动);强调色 = `<html>` 上的 `data-accent` 属性(新)。两维正交:`.dark` 块定义全部表面/文字/状态 token,`[data-accent=…]` 块只定义强调色家族并注入 `--primary/--ring` 等。

## 4. 色彩 Token(完整值)

### 4.1 中性色阶(Tier 1,冷灰,色相 220)

| 变量 | 暗色 | 亮色 | 暗色用途参考 |
|---|---|---|---|
| `--gray-1` | `#101216` | `#F6F7F9` | app 画布 |
| `--gray-2` | `#15181E` | `#EDEFF3` | 面板 |
| `--gray-3` | `#1A1F26` | `#E2E6EB` | 次级填充 |
| `--gray-4` | `#21262E` | `#D3D8DF` | 实体 hover |
| `--gray-5` | `#292F38` | `#C0C7D0` | 实体 active |
| `--gray-6` | `#333A44` | `#A6AEBA` | 禁用底 |
| `--gray-7` | `#454E5B` | `#8B93A1` | 强边框参考 |
| `--gray-8` | `#5C6675` | `#6E7683` | 弱图标 |
| `--gray-9` | `#8B93A1` | `#5A6270` | 次级文字 |
| `--gray-10` | `#A6AEBB` | `#454D59` | — |
| `--gray-11` | `#C9CFD8` | `#2C333D` | 主文字 |
| `--gray-12` | `#E8EBF0` | `#191E26` | 强调文字 |

### 4.2 表面阶梯(Tier 2)

| Token | 暗色 | 亮色 | 用途 |
|---|---|---|---|
| `--background` | `#101216` | `#F6F7F9` | app 画布(最底层) |
| `--surface` 新 | `#15181E` | `#FFFFFF` | 侧边栏、面板 |
| `--card` | `#1C212A` | `#FFFFFF` | 卡片、内容块 |
| `--popover` | `#232933` | `#FFFFFF` | 下拉、浮层(最亮) |
| `--muted` | `#1A1F26` | `#EDF0F3` | 表头、代码底等次级填充 |
| `--accent` | `#262C36` | `#ECEEF2` | 悬停/选中填充(shadcn 语义) |
| `--hover` 新 | `rgb(255 255 255 / 4%)` | `rgb(13 20 31 / 4%)` | 悬停态,透明叠加任意表面 |
| `--active` 新 | `rgb(255 255 255 / 8%)` | `rgb(13 20 31 / 8%)` | 按压/选中态 |

既有 `--card`/`--popover` 的值由本表覆盖(从旧值迁移);`--primary`/`--secondary`/`--destructive` 由 4.4 / 4.5 注入或替换。其余既有 `*-foreground` 家族(`--card-foreground`、`--popover-foreground`、`--secondary-foreground`、`--accent-foreground`)统一按文字阶梯取值:与所在表面配对的 `--foreground` 或 `--muted-foreground` 直接引用。`--secondary` 收敛为中性填充:暗色 `#292F38`(gray-5)、亮色 `#E2E6EB`(gray-3),语义从"绿色副色"改为"次级按钮/填充底"。

### 4.3 文字阶梯与边框(Tier 2)

| Token | 暗色 | 亮色 |
|---|---|---|
| `--foreground` | `#C9CFD8`(gray-11) | `#2C333D`(gray-11) |
| `--foreground-emphasis` 新 | `#E8EBF0`(gray-12) | `#191E26`(gray-12) |
| `--muted-foreground` | `#8B93A1`(gray-9) | `#6E7683`(gray-8) |
| `--foreground-faint` 新 | `#5C6675`(gray-8) | `#A6AEBA`(gray-6) |
| `--border` | `rgb(255 255 255 / 7%)` | `rgb(13 20 31 / 9%)` |
| `--border-strong` 新 | `rgb(255 255 255 / 13%)` | `rgb(13 20 31 / 16%)` |
| `--input` | `rgb(255 255 255 / 12%)` | `rgb(13 20 31 / 14%)` |
| `--scrollbar-thumb` 新 | `rgb(255 255 255 / 14%)` | `rgb(13 20 31 / 18%)` |
| `--scrollbar-thumb-hover` 新 | `rgb(255 255 255 / 28%)` | `rgb(13 20 31 / 32%)` |

既有 `--foreground`/`--muted-foreground` 从三元组改为直接引用对应 gray 变量(如 `--foreground: var(--gray-11)`),消费方无感。**注意**:主文字亮度从旧值 94% 降至 ~80%,是本方案观感变化最大的一处,已评审确认。

### 4.4 语义状态色五件套(Tier 2)

`success / warning / danger / info` 四组,每组五个 token:

```css
--{status}             实心底(徽章、按钮)
--{status}-foreground  实心上的文字
--{status}-fg          表面上的文字(替代 text-green-600 等)
--{status}-subtle      浅底(提示条、行高亮)
--{status}-subtle-fg   浅底上的文字
```

| token | 暗色 | 亮色 |
|---|---|---|
| `--success` | `#30A46C` | `#29903B` |
| `--success-foreground` | `#FFFFFF` | `#FFFFFF` |
| `--success-fg` | `#4CC38A` | `#218358` |
| `--success-subtle` | `rgb(76 195 138 / 13%)` | `rgb(46 144 59 / 11%)` |
| `--success-subtle-fg` | `#6BD69C` | `#1D7A44` |
| `--warning` | `#E9A23B` | `#DD9209` |
| `--warning-foreground` | `#241A04` | `#241A04` |
| `--warning-fg` | `#F1B35C` | `#965F12` |
| `--warning-subtle` | `rgb(241 179 92 / 13%)` | `rgb(221 146 9 / 13%)` |
| `--warning-subtle-fg` | `#F5C57E` | `#8A570F` |
| `--danger` | `#E0484D` | `#D13438` |
| `--danger-foreground` | `#FFFFFF` | `#FFFFFF` |
| `--danger-fg` | `#F0767A` | `#C03535` |
| `--danger-subtle` | `rgb(240 118 122 / 13%)` | `rgb(209 52 56 / 10%)` |
| `--danger-subtle-fg` | `#F49B9E` | `#B02E32` |
| `--info` | `#3B82F6` | `#2563EB` |
| `--info-foreground` | `#FFFFFF` | `#FFFFFF` |
| `--info-fg` | `#6FA9F8` | `#1B64C9` |
| `--info-subtle` | `rgb(111 169 248 / 13%)` | `rgb(37 99 235 / 10%)` |
| `--info-subtle-fg` | `#93C2FA` | `#175AB0` |

既有 `--destructive`/`--destructive-foreground` 别名指向 `--danger`/`--danger-foreground`,shadcn 组件无感。

### 4.5 强调色维度(Tier 2,`data-accent` 注入)

六个 accent,每块定义 8 个变量(模式感知,`[data-accent=x]` 与 `.dark[data-accent=x]` 两小节):

```css
--primary               主色(按钮、选中、链接)
--primary-foreground    主色上的文字
--primary-hover         悬停(+5% 亮度)
--primary-active        按压(−4% 亮度)
--ring                  聚焦环(= primary)
--primary-fg            彩色文字(替代 text-blue-500 等)
--primary-subtle        主色浅底 rgba
--primary-subtle-fg     浅底文字
```

| accent id | 旧主题 id(迁移映射) | primary 暗色 | primary 亮色 |
|---|---|---|---|
| `blue` | `default-dark` | `hsl(217 91% 62%)` | `hsl(217 91% 50%)` |
| `sky` | `blue-ocean` | `hsl(199 89% 55%)` | `hsl(199 89% 45%)` |
| `purple` | `purple-night` | `hsl(271 81% 62%)` | `hsl(271 81% 52%)` |
| `green` | `green-forest` | `hsl(142 60% 45%)` | `hsl(142 76% 36%)` |
| `rose` | `rose-gold` | `hsl(340 82% 60%)` | `hsl(340 82% 50%)` |
| `slate` | `slate` | `hsl(215 18% 58%)` | `hsl(215 16% 45%)` |

- `--primary-foreground` 统一 `#FFFFFF`(`warning` 思路不适用于 accent);
- `--primary-hover` / `--primary-active` 按上表亮度 ±5% / −4% 系统化推导,不逐个手调;
- `--primary-subtle` = primary 色 12%(暗)/ 10%(亮)透明度;`--primary-subtle-fg` = primary 亮度 +18%(暗)/ −25%(亮);
- 无 `data-accent` 属性时回退 `blue`。

### 4.6 图表分类色板(Tier 1)

`--chart-1` … `--chart-8`,供 revcal / excel / todo 的分类着色,按模式各给一组:

| 变量 | 暗色 | 亮色 |
|---|---|---|
| `--chart-1` | `#5B93F7` | `#2E7CF6` |
| `--chart-2` | `#3FC27D` | `#2E9E5B` |
| `--chart-3` | `#F0B35C` | `#DD9209` |
| `--chart-4` | `#F0767A` | `#D13438` |
| `--chart-5` | `#9C8CF0` | `#7C6CE4` |
| `--chart-6` | `#4FC3D6` | `#2FA8BC` |
| `--chart-7` | `#E08BB0` | `#C9649A` |
| `--chart-8` | `#8B93A1` | `#6E7683` |

## 5. 排版 Token

### 5.1 字体族

```css
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Roboto',
             'Helvetica Neue', sans-serif;
--font-mono: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
```

数字密集的表格(revcal 等)用 Tailwind 内置 `tabular-nums` 工具类。

### 5.2 字号 / 行高(通过 `@theme` 覆盖 Tailwind 默认)

| Token | 字号 / 行高 | 角色 |
|---|---|---|
| `--text-2xs` | 11px / 1.45 | 大写小标签 |
| `--text-xs` | 12px / 1.5 | 说明、徽章 |
| `--text-sm` | 13px / 1.55 | 次级正文 |
| `--text-base` | 14px / 1.6 | **基准正文** |
| `--text-lg` | 16px / 1.5 | 小节标题 |
| `--text-xl` | 20px / 1.3 | 页面标题 |
| `--text-2xl` | 24px / 1.25 | 大数字展示 |
| `--text-3xl` | 30px / 1.2 | 仅特殊场景 |

**密度决策**:`--text-sm` 13px、`--text-base` 14px、`--text-lg` 16px 均比 Tailwind 默认小一档,是"信息密度偏高"的直接体现,全局生效。`html` 根字号保持 16px,不破坏 rem 数学。

### 5.3 字重

400 / 500 / 600 / 700,沿用 Tailwind 默认,不新建 token。

### 5.4 元素默认值(base.css)

| 元素 | 规格 |
|---|---|
| `body` | `var(--text-base)`,行高 1.6,`color: var(--foreground)`,背景 `var(--background)` |
| `h1` | `var(--text-xl)` / 600 / `-0.01em`(页面标题) |
| `h2` | `var(--text-lg)` / 600 |
| `h3` | `var(--text-base)` / 600,`color: var(--foreground-emphasis)` |
| `h4` | `var(--text-base)` / 500 |
| `small` | `var(--text-xs)`,`color: var(--muted-foreground)` |

> 标题从旧的 30/24/20/17px 收敛到 20/16,是密度方向的有意变更,已评审确认。

## 6. 空间、布局与组件 Token(Tier 3)

```css
--spacing: 0.25rem;                 /* Tailwind 4 默认,4px 网格 */

--layout-sidebar-width: 240px;
--layout-sidebar-width-collapsed: 56px;
--layout-page-padding: 32px;

--control-h-sm: 28px;               /* 紧凑行内控件 */
--control-h-md: 32px;               /* 标准控件 */
--control-h-lg: 36px;               /* 表单主控件 */

--icon-sm: 14px; --icon-md: 16px; --icon-lg: 20px;
```

间距规则:组件内间距取 4 的倍数(4/8/12/16),布局间距取 8 的倍数(8/16/24/32);禁止 3/5/7 等奇数粒度新增。

## 7. 圆角、阴影、动效、层级、聚焦环

### 7.1 圆角

```css
--radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px;
--radius-lg: 10px; --radius-xl: 12px; --radius-full: 9999px;
```

`@theme` 按同名映射(`rounded-sm`→6、`rounded-md`→8、`rounded-lg`→10、`rounded-xl`→12);旧 `--radius: 0.5rem` 移除。

### 7.2 阴影

| Token | 亮色 | 暗色 |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgb(16 24 40 / 5%)` | `0 1px 2px rgb(0 0 0 / 35%)` |
| `--shadow-sm` | `0 1px 3px rgb(16 24 40 / 8%), 0 1px 2px rgb(16 24 40 / 5%)` | `0 1px 3px rgb(0 0 0 / 40%)` |
| `--shadow-md` | `0 4px 16px rgb(16 24 40 / 10%), 0 2px 4px rgb(16 24 40 / 5%)` | `0 4px 16px rgb(0 0 0 / 50%)` |
| `--shadow-lg` | `0 16px 40px rgb(16 24 40 / 16%)` | `0 16px 40px rgb(0 0 0 / 60%)` |

工具流原则:暗色下层次主要靠表面阶梯与边框,阴影只做辅助。

### 7.3 动效

```css
--duration-instant: 80ms;  --duration-fast: 140ms;
--duration-base: 200ms;    --duration-slow: 320ms;
--ease-out: cubic-bezier(0.25, 1, 0.5, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

framer-motion 侧新建 `src/lib/motion.ts` 导出同名常量,注释注明与 CSS token 保持同步。现有 accordion keyframes 的 0.2s 改用 `var(--duration-base)`。

### 7.4 层级

```css
--z-dropdown: 100; --z-sticky: 200; --z-overlay: 300;
--z-modal: 400;    --z-toast: 500;  --z-tooltip: 600;
```

现有 shadcn 组件内的 `z-50` 本次不动(应用阶段统一),token 先就位。

### 7.5 聚焦环

```css
--ring-width: 2px;  --ring-offset-width: 2px;
```

颜色来自 `--ring`(由 accent 注入),保证键盘导航一致。

## 8. 文件组织

```
src/styles/tokens.css   Tier 1 + Tier 2 全量(:root 亮色块、.dark 块、[data-accent] 块)
src/styles/base.css     元素默认值、滚动条、selection、view-transition、
                        todo-widget-window 覆盖(自 index.css 迁入);整体包 @layer base,
                        元素默认值让位于工具类;焦点样式留在组件层(shadcn ring),不设全局 outline
src/index.css           仅 @import tailwindcss → tokens → base + @theme inline 映射 + keyframes
src/lib/motion.ts       framer-motion 常量(与 --duration-*/--ease-* 数值一一对应)
```

- **删除 `src/App.css`**(已核实零引用);
- `index.css` 中 `body` 写死背景、`.dark body`、`.dark select` 写死色全部删除,由 token 接管;
- `@theme` 映射重写:颜色统一 `var(--x)` 直接引用(配合格式迁移);**规则:所有语义层颜色 token(surface/hover/active/文字/边框/状态五件套/chart)一律生成同名 Tailwind 工具类**(`--color-surface` → `bg-surface` 等),新增的排版 `--text-2xs..3xl`、`--shadow-xs..lg`、`--radius-*`、`--ease-*` 同理。

## 9. 主题系统重构(themes.ts)

```ts
export type AccentId = 'blue' | 'sky' | 'purple' | 'green' | 'rose' | 'slate';
export interface Theme {
  id: string;          // 沿用旧 id,保证持久化兼容
  name: string;
  description: string;
  accent: AccentId;
}
```

- `applyTheme(theme)` 改为 `documentElement.dataset.accent = theme.accent`(删除 setProperty 循环与 `offsetHeight` hack);
- **迁移**:zustand persist 中旧结构含 `colors` 字段,按旧 id 映射 accent(`default-dark→blue`、`blue-ocean→sky`、`purple-night→purple`、`green-forest→green`、`rose-gold→rose`、`slate→slate`),rehydrate 时转换;缺省回退 `default-dark`;
- 明暗模式机制(`use-dark-mode.ts` + `liao-tools-dark-mode` 存储)完全不动。

## 10. 存量清理清单(本次同批完成)

| 现状 | 去向 |
|---|---|
| `text-green-500/400/600`、`bg-green-500`、`border-green-500` | `success` 族 |
| `text-amber-*`、`bg-yellow-50/950`、`text-yellow-*`、`border-yellow-500` | `warning` 族 |
| `text-red-500/300/50`、`bg-red-50` | `danger` 族 |
| `text-blue-500/400/600`、`bg-blue-500` | `info` 族或 `primary` 族(按语义判断) |
| `text-purple-500`、`text-orange-500` 等 | `--chart-*` 或就近状态色 |
| todo 内联 `hsl(var(--primary) / 0.08)` 等旧三元组内联样式 | `var(--primary-subtle)` 等新 token |

**豁免域(用户可配置的域数据,不 token 化)**:`src/features/todo/types.ts` 的 `WIDGET_THEMES`(widget 皮肤)与 `PRIORITY_COLORS`(优先级色,页面与 widget 共享)、`src/features/todo/TodoWidget.tsx`(独立透明窗口,自管皮肤)、`src/features/todo/components/SettingsModal.tsx` 的颜色选择器占位符 `#000000`、`src/lib/themes.ts` 的 `ACCENT_PREVIEW`(主题选择器固定预览色,不得绑定全局 accent)。widget 是独立主题系统,强行注入 app token 会破坏其皮肤功能。TodoPage.tsx 的应用内表面不豁免(其 PRIORITY_COLORS 引用与内联 token 均按 §4 消费)。
| `body { background-color: #FAFBFC }`、`.dark body { #1d232a }` | 删除,由 `--background` 接管 |
| `.dark select { #1e293b / #3b82f6 }` | token 化 |
| 滚动条 `rgba(0,0,0,…)` | `--scrollbar-thumb(-hover)` |
| 主题内 `accent: '0 0% 18%'` 灰色假 accent | 随 themes.ts 重构消失 |

## 11. 验证标准

1. `pnpm build`(tsc + vite)通过;
2. 门禁归零(固化为 `pnpm lint:tokens`,报告式非阻塞):调色板类 grep(`*.tsx`+`*.ts`,排除 `features/todo/` 与 `src/lib/themes.ts` 的 ACCENT_PREVIEW 预览色)、hex grep(同上排除)、`hsl\(var\(` grep(排除 `styles/tokens.css`);
3. 视觉验证:`pnpm tauri dev`,暗色+blue / 暗色+purple / 亮色+blue / 亮色+green 四组合截图,重点检查 sidebar、revcal 表格页、todo 页(含 widget 窗口)、设置页(主题选择器);
4. 功能验证:主题选择器 6 项切换生效;旧持久化主题 id 迁移后正确;明暗切换(system/light/dark)与 accent 组合正确;
5. 回归:shadcn 组件(button/dialog/select/toast)外观无破相,仅随 token 值发生预期内的变化。

## 12. 范围外(明确不做)

- shadcn/ui 组件内部的重样式与间距收紧(后续 UI 优化批次);
- 页面布局改版、sidebar 交互改动;
- `@dnd-kit`、framer-motion 动画编排调整;
- 新增依赖。
