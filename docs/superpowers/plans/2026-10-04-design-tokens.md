# 设计 Token 体系实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地三层设计 token 体系(颜色/排版/间距/圆角/阴影/动效/层级),重构主题系统为「明暗 × 强调色」正交双维,清零全部硬编码调色板颜色。

**Architecture:** 新建 `src/styles/tokens.css`(Tier1 原始层 + Tier2 语义层,`:root` 亮色块 / `.dark` 暗色块 / `[data-accent]` 强调色块)与 `src/styles/base.css`(元素默认值);`src/index.css` 收缩为 import + `@theme` 映射;`themes.ts` 从 setProperty 覆盖改为 `data-accent` 属性切换,旧持久化数据按 id 迁移。

**Tech Stack:** Tailwind CSS 4(`@theme inline` 变量映射)、React 19、zustand persist、Tauri 2。

**Spec:** `docs/superpowers/specs/2026-10-04-design-tokens-design.md`(值表以规格为准,本计划给出成品 CSS;两者冲突时以规格值表为准并回报)

## Global Constraints

- 不新增任何 npm 依赖(spec §12)。
- 既有 shadcn token 名称(`--background`、`--muted`、`--text-muted-foreground` 等约 370 处引用)全部保留,消费方式不变(spec §3)。
- 所有颜色 token 为完整 CSS 颜色值,`@theme inline` 用 `var(--x)` 直接映射;禁止 `H S% L%` 三元组与 `hsl(var(--x) / α)` 写法(spec §3)。
- 模式 = `<html>` 的 `.dark` class(`use-dark-mode.ts` 现有机制不动);强调色 = `<html>` 的 `data-accent` 属性;无属性时回退 blue(spec §4.5)。
- 豁免域:`src/features/todo/types.ts`、`src/features/todo/TodoWidget.tsx`、`src/features/todo/components/SettingsModal.tsx` 的颜色选择器占位符(spec §10)。
- 仓库无测试框架且本次不引入(spec §12);每任务的验证 = `pnpm build` + grep 门禁 + `pnpm dev` 视觉抽查。
- 提交信息用中文 conventional commits(仓库惯例)。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/styles/tokens.css` | 新建 | Tier1+Tier2 全部颜色 token(明/暗 × accent) |
| `src/styles/base.css` | 新建 | 元素默认值、滚动条、selection、view-transition、widget 窗口覆盖 |
| `src/index.css` | 重写 | import 链 + `@theme` 映射 + keyframes |
| `src/App.css` | 删除 | Tauri 脚手架残留,零引用 |
| `src/lib/themes.ts` | 重写 | accent 主题定义 + `data-accent` 应用 + 持久化迁移 |
| `src/lib/motion.ts` | 新建 | framer-motion 时长/缓动常量 |
| 12 个业务组件 | 修改 | 硬编码调色板类与内联 `hsl(var())` → token(Task 6 清单) |

---

### Task 1: 颜色 token 底座(tokens.css + index.css 重写)

**Files:**
- Create: `src/styles/tokens.css`
- Rewrite: `src/index.css`
- Delete: `src/App.css`

**Interfaces:**
- Consumes: 无(起点)。
- Produces: `:root`/`.dark` 下全部颜色 token 变量名(后续所有任务消费);Tailwind 工具类 `bg-surface`、`bg-hover`、`bg-active`、`text-foreground-emphasis`、`text-foreground-faint`、`border-border-strong`、`text-success(-fg/-subtle/-subtle-fg/-foreground)`、warning/danger/info 同构、`text-primary-fg`、`bg-primary-subtle`、`bg-chart-1..8`。

- [ ] **Step 1: 写入 `src/styles/tokens.css`**

完整内容如下(明暗两块 + accent 六块):

```css
/* ============================================================
   设计 Token —— Tier 1 原始层 + Tier 2 语义层
   规范: docs/superpowers/specs/2026-10-04-design-tokens-design.md
   模式: .dark class | 强调色: data-accent 属性(缺省 blue)
   ============================================================ */

/* ---------------- 亮色(默认,accent 缺省 = blue) ---------------- */
:root {
  /* Tier 1 · 中性阶 */
  --gray-1: #F6F7F9;
  --gray-2: #EDEFF3;
  --gray-3: #E2E6EB;
  --gray-4: #D3D8DF;
  --gray-5: #C0C7D0;
  --gray-6: #A6AEBA;
  --gray-7: #8B93A1;
  --gray-8: #6E7683;
  --gray-9: #5A6270;
  --gray-10: #454D59;
  --gray-11: #2C333D;
  --gray-12: #191E26;

  /* Tier 2 · 表面阶梯 */
  --background: var(--gray-1);
  --surface: #FFFFFF;
  --card: #FFFFFF;
  --popover: #FFFFFF;
  --muted: #EDF0F3;
  --accent: #ECEEF2;
  --hover: rgb(13 20 31 / 4%);
  --active: rgb(13 20 31 / 8%);
  --secondary: var(--gray-3);

  /* Tier 2 · 文字阶梯 */
  --foreground: var(--gray-11);
  --foreground-emphasis: var(--gray-12);
  --muted-foreground: var(--gray-8);
  --foreground-faint: var(--gray-6);
  --card-foreground: var(--foreground);
  --popover-foreground: var(--foreground);
  --secondary-foreground: var(--foreground);
  --accent-foreground: var(--foreground);

  /* Tier 2 · 边框与滚动条 */
  --border: rgb(13 20 31 / 9%);
  --border-strong: rgb(13 20 31 / 16%);
  --input: rgb(13 20 31 / 14%);
  --scrollbar-thumb: rgb(13 20 31 / 18%);
  --scrollbar-thumb-hover: rgb(13 20 31 / 32%);

  /* Tier 2 · 状态色五件套 */
  --success: #29903B;
  --success-foreground: #FFFFFF;
  --success-fg: #218358;
  --success-subtle: rgb(46 144 59 / 11%);
  --success-subtle-fg: #1D7A44;
  --warning: #DD9209;
  --warning-foreground: #241A04;
  --warning-fg: #965F12;
  --warning-subtle: rgb(221 146 9 / 13%);
  --warning-subtle-fg: #8A570F;
  --danger: #D13438;
  --danger-foreground: #FFFFFF;
  --danger-fg: #C03535;
  --danger-subtle: rgb(209 52 56 / 10%);
  --danger-subtle-fg: #B02E32;
  --info: #2563EB;
  --info-foreground: #FFFFFF;
  --info-fg: #1B64C9;
  --info-subtle: rgb(37 99 235 / 10%);
  --info-subtle-fg: #175AB0;
  --destructive: var(--danger);
  --destructive-foreground: var(--danger-foreground);

  /* Tier 1 · 图表分类色板 */
  --chart-1: #2E7CF6;
  --chart-2: #2E9E5B;
  --chart-3: #DD9209;
  --chart-4: #D13438;
  --chart-5: #7C6CE4;
  --chart-6: #2FA8BC;
  --chart-7: #C9649A;
  --chart-8: #6E7683;

  /* Tier 2 · 强调色(缺省 blue,亮色) */
  --primary: hsl(217 91% 50%);
  --primary-foreground: #FFFFFF;
  --primary-hover: hsl(217 91% 55%);
  --primary-active: hsl(217 91% 46%);
  --primary-fg: hsl(217 91% 25%);
  --primary-subtle: hsl(217 91% 50% / 10%);
  --primary-subtle-fg: hsl(217 91% 25%);
  --ring: var(--primary);
}

/* ---------------- 暗色 ---------------- */
.dark {
  /* Tier 1 · 中性阶 */
  --gray-1: #101216;
  --gray-2: #15181E;
  --gray-3: #1A1F26;
  --gray-4: #21262E;
  --gray-5: #292F38;
  --gray-6: #333A44;
  --gray-7: #454E5B;
  --gray-8: #5C6675;
  --gray-9: #8B93A1;
  --gray-10: #A6AEBB;
  --gray-11: #C9CFD8;
  --gray-12: #E8EBF0;

  /* Tier 2 · 表面阶梯 */
  --background: var(--gray-1);
  --surface: var(--gray-2);
  --card: #1C212A;
  --popover: #232933;
  --muted: var(--gray-3);
  --accent: #262C36;
  --hover: rgb(255 255 255 / 4%);
  --active: rgb(255 255 255 / 8%);
  --secondary: var(--gray-5);

  /* Tier 2 · 文字阶梯 */
  --foreground: var(--gray-11);
  --foreground-emphasis: var(--gray-12);
  --muted-foreground: var(--gray-9);
  --foreground-faint: var(--gray-8);
  --card-foreground: var(--foreground);
  --popover-foreground: var(--foreground);
  --secondary-foreground: var(--foreground);
  --accent-foreground: var(--foreground);

  /* Tier 2 · 边框与滚动条 */
  --border: rgb(255 255 255 / 7%);
  --border-strong: rgb(255 255 255 / 13%);
  --input: rgb(255 255 255 / 12%);
  --scrollbar-thumb: rgb(255 255 255 / 14%);
  --scrollbar-thumb-hover: rgb(255 255 255 / 28%);

  /* Tier 2 · 状态色五件套 */
  --success: #30A46C;
  --success-foreground: #FFFFFF;
  --success-fg: #4CC38A;
  --success-subtle: rgb(76 195 138 / 13%);
  --success-subtle-fg: #6BD69C;
  --warning: #E9A23B;
  --warning-foreground: #241A04;
  --warning-fg: #F1B35C;
  --warning-subtle: rgb(241 179 92 / 13%);
  --warning-subtle-fg: #F5C57E;
  --danger: #E0484D;
  --danger-foreground: #FFFFFF;
  --danger-fg: #F0767A;
  --danger-subtle: rgb(240 118 122 / 13%);
  --danger-subtle-fg: #F49B9E;
  --info: #3B82F6;
  --info-foreground: #FFFFFF;
  --info-fg: #6FA9F8;
  --info-subtle: rgb(111 169 248 / 13%);
  --info-subtle-fg: #93C2FA;
  --destructive: var(--danger);
  --destructive-foreground: var(--danger-foreground);

  /* Tier 1 · 图表分类色板 */
  --chart-1: #5B93F7;
  --chart-2: #3FC27D;
  --chart-3: #F0B35C;
  --chart-4: #F0767A;
  --chart-5: #9C8CF0;
  --chart-6: #4FC3D6;
  --chart-7: #E08BB0;
  --chart-8: #8B93A1;

  /* Tier 2 · 强调色(缺省 blue,暗色) */
  --primary: hsl(217 91% 62%);
  --primary-foreground: #FFFFFF;
  --primary-hover: hsl(217 91% 67%);
  --primary-active: hsl(217 91% 58%);
  --primary-fg: hsl(217 91% 80%);
  --primary-subtle: hsl(217 91% 62% / 12%);
  --primary-subtle-fg: hsl(217 91% 80%);
  --ring: var(--primary);
}

/* ---------------- 强调色维度 · 亮色 ---------------- */
[data-accent='sky'] {
  --primary: hsl(199 89% 45%);
  --primary-hover: hsl(199 89% 50%);
  --primary-active: hsl(199 89% 41%);
  --primary-fg: hsl(199 89% 20%);
  --primary-subtle: hsl(199 89% 45% / 10%);
  --primary-subtle-fg: hsl(199 89% 20%);
  --ring: var(--primary);
}
[data-accent='purple'] {
  --primary: hsl(271 81% 52%);
  --primary-hover: hsl(271 81% 57%);
  --primary-active: hsl(271 81% 48%);
  --primary-fg: hsl(271 81% 27%);
  --primary-subtle: hsl(271 81% 52% / 10%);
  --primary-subtle-fg: hsl(271 81% 27%);
  --ring: var(--primary);
}
[data-accent='green'] {
  --primary: hsl(142 76% 36%);
  --primary-hover: hsl(142 76% 41%);
  --primary-active: hsl(142 76% 32%);
  --primary-fg: hsl(142 76% 11%);
  --primary-subtle: hsl(142 76% 36% / 10%);
  --primary-subtle-fg: hsl(142 76% 11%);
  --ring: var(--primary);
}
[data-accent='rose'] {
  --primary: hsl(340 82% 50%);
  --primary-hover: hsl(340 82% 55%);
  --primary-active: hsl(340 82% 46%);
  --primary-fg: hsl(340 82% 25%);
  --primary-subtle: hsl(340 82% 50% / 10%);
  --primary-subtle-fg: hsl(340 82% 25%);
  --ring: var(--primary);
}
[data-accent='slate'] {
  --primary: hsl(215 16% 45%);
  --primary-hover: hsl(215 16% 50%);
  --primary-active: hsl(215 16% 41%);
  --primary-fg: hsl(215 16% 20%);
  --primary-subtle: hsl(215 16% 45% / 10%);
  --primary-subtle-fg: hsl(215 16% 20%);
  --ring: var(--primary);
}

/* ---------------- 强调色维度 · 暗色 ---------------- */
.dark[data-accent='blue'] {
  --primary: hsl(217 91% 62%);
  --primary-hover: hsl(217 91% 67%);
  --primary-active: hsl(217 91% 58%);
  --primary-fg: hsl(217 91% 80%);
  --primary-subtle: hsl(217 91% 62% / 12%);
  --primary-subtle-fg: hsl(217 91% 80%);
  --ring: var(--primary);
}
.dark[data-accent='sky'] {
  --primary: hsl(199 89% 55%);
  --primary-hover: hsl(199 89% 60%);
  --primary-active: hsl(199 89% 51%);
  --primary-fg: hsl(199 89% 73%);
  --primary-subtle: hsl(199 89% 55% / 12%);
  --primary-subtle-fg: hsl(199 89% 73%);
  --ring: var(--primary);
}
.dark[data-accent='purple'] {
  --primary: hsl(271 81% 62%);
  --primary-hover: hsl(271 81% 67%);
  --primary-active: hsl(271 81% 58%);
  --primary-fg: hsl(271 81% 80%);
  --primary-subtle: hsl(271 81% 62% / 12%);
  --primary-subtle-fg: hsl(271 81% 80%);
  --ring: var(--primary);
}
.dark[data-accent='green'] {
  --primary: hsl(142 60% 45%);
  --primary-hover: hsl(142 60% 50%);
  --primary-active: hsl(142 60% 41%);
  --primary-fg: hsl(142 60% 63%);
  --primary-subtle: hsl(142 60% 45% / 12%);
  --primary-subtle-fg: hsl(142 60% 63%);
  --ring: var(--primary);
}
.dark[data-accent='rose'] {
  --primary: hsl(340 82% 60%);
  --primary-hover: hsl(340 82% 65%);
  --primary-active: hsl(340 82% 56%);
  --primary-fg: hsl(340 82% 78%);
  --primary-subtle: hsl(340 82% 60% / 12%);
  --primary-subtle-fg: hsl(340 82% 78%);
  --ring: var(--primary);
}
.dark[data-accent='slate'] {
  --primary: hsl(215 18% 58%);
  --primary-hover: hsl(215 18% 63%);
  --primary-active: hsl(215 18% 54%);
  --primary-fg: hsl(215 18% 76%);
  --primary-subtle: hsl(215 18% 58% / 12%);
  --primary-subtle-fg: hsl(215 18% 76%);
  --ring: var(--primary);
}
```

- [ ] **Step 2: 重写 `src/index.css`**

全文替换为(保留 accordion keyframes;typography/radius/shadow/motion 的 `@theme` 条目在 Task 2/3 加入,本步只做颜色):

```css
@import "tailwindcss";
@import "./styles/tokens.css";

/* ============================================
   TAILWIND THEME MAPPING
   颜色 token 均为完整色值,inline 映射保证 .dark / data-accent 切换生效
   ============================================ */

@theme inline {
  /* 表面 */
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-card: var(--card);
  --color-popover: var(--popover);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-secondary: var(--secondary);
  --color-hover: var(--hover);
  --color-active: var(--active);

  /* 文字 */
  --color-foreground: var(--foreground);
  --color-foreground-emphasis: var(--foreground-emphasis);
  --color-muted-foreground: var(--muted-foreground);
  --color-foreground-faint: var(--foreground-faint);
  --color-card-foreground: var(--card-foreground);
  --color-popover-foreground: var(--popover-foreground);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-accent-foreground: var(--accent-foreground);

  /* 边框与滚动条 */
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-input: var(--input);

  /* 强调色 */
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-hover: var(--primary-hover);
  --color-primary-active: var(--primary-active);
  --color-primary-fg: var(--primary-fg);
  --color-primary-subtle: var(--primary-subtle);
  --color-primary-subtle-fg: var(--primary-subtle-fg);
  --color-ring: var(--ring);

  /* 状态色 */
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-success-fg: var(--success-fg);
  --color-success-subtle: var(--success-subtle);
  --color-success-subtle-fg: var(--success-subtle-fg);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-warning-fg: var(--warning-fg);
  --color-warning-subtle: var(--warning-subtle);
  --color-warning-subtle-fg: var(--warning-subtle-fg);
  --color-danger: var(--danger);
  --color-danger-foreground: var(--danger-foreground);
  --color-danger-fg: var(--danger-fg);
  --color-danger-subtle: var(--danger-subtle);
  --color-danger-subtle-fg: var(--danger-subtle-fg);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
  --color-info-fg: var(--info-fg);
  --color-info-subtle: var(--info-subtle);
  --color-info-subtle-fg: var(--info-subtle-fg);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);

  /* 图表 */
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-chart-6: var(--chart-6);
  --color-chart-7: var(--chart-7);
  --color-chart-8: var(--chart-8);

  /* Accordion(Radix 高度动画;Task 3 将 0.2s 换为 var(--duration-base)) */
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;
}

/* ============================================
   ANIMATIONS
   ============================================ */

@keyframes accordion-down {
  from {
    height: 0;
  }
  to {
    height: var(--radix-accordion-content-height);
  }
}

@keyframes accordion-up {
  from {
    height: var(--radix-accordion-content-height);
  }
  to {
    height: 0;
  }
}
```

- [ ] **Step 3: 临时保留旧元素样式直至 Task 2**

旧 `index.css` 中的元素默认值(`*` border-color、body、h1~h6、p、small、#root、todo-widget-window、滚动条、view-transition、大屏幕媒体查询)本步**不删除**——它们迁往 `src/styles/base.css`(Task 2 精简后落地)。做法:把旧 index.css 中 **`@keyframes accordion-up` 结束之后的全部内容**(`* { border-color: … }` 起到文件末尾)复制为 `src/styles/base.css`,再按 Step 2 重写 index.css。注意:只复制元素样式,`@import`/token 定义/`@theme` 块/keyframes 不进 base.css。

- [ ] **Step 4: 删除 `src/App.css` 并确认无引用**

```bash
grep -rn "App.css" src index.html   # 期望: 无输出(已核实零引用)
rm src/App.css
```

- [ ] **Step 5: 构建验证**

```bash
pnpm build
```

期望:tsc 与 vite build 通过,无 CSS 报错。

- [ ] **Step 6: 视觉抽查**

`pnpm dev` 打开应用:整体配色切换为冷灰新色板(暗色底变深至 #101216、主文字变暗一档);旧 `hsl(var())` 内联样式处(todo 页卡片选中态、sidebar 圆点)**此时会失效呈现为无色/默认色,属预期**,Task 6 修复。明暗切换仍然生效。

- [ ] **Step 7: Commit**

```bash
git add src/styles/tokens.css src/index.css src/styles/base.css
git rm src/App.css
git commit -m "feat(design): 颜色 token 底座——三层 token 与明暗双模式"
```

---

### Task 2: 排版 token 与 base.css(元素默认值)

**Files:**
- Rewrite: `src/styles/base.css`
- Modify: `src/index.css`(@theme 增加字体/字号/间距/布局条目)

**Interfaces:**
- Consumes: Task 1 的 token 变量。
- Produces: Tailwind 工具类 `text-2xs`(11px)及覆盖后的 `text-xs/sm/base/lg/xl/2xl/3xl`、`font-sans`、`font-mono`、`duration-instant/fast/base/slow`、`ease-out/ease-in-out/ease-spring`;body 基准 14px。

- [ ] **Step 1: 重写 `src/styles/base.css`**

以 Task 1 备份的旧样式为底,替换为以下完整内容(旧规则中与 token 冲突的写死值全部改为 token 引用;`hsl(var(--x))` 全部改 `var(--x)`;**删除** `body` 写死 `#FAFBFC`、`.dark body #1d232a`、`.dark select` 写死色、旧的 h1~h6/p/small 硬编码字号):

```css
/* ============================================================
   元素默认值与全局基础样式
   字号/颜色一律引用 token,禁止写死值
   ============================================================ */

/* 全局盒模型辅助:统一边框色 */
* {
  border-color: var(--border);
}

/* 移除默认的 tap 高亮 */
* {
  -webkit-tap-highlight-color: transparent;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.6;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--background);
  color: var(--foreground);
  text-rendering: optimizeLegibility;
  font-synthesis: none;
  -webkit-text-size-adjust: 100%;
}

#root {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: none;
}

/* todo widget 独立透明窗口 */
html.todo-widget-window,
body.todo-widget-window,
#root.todo-widget-window {
  background: transparent !important;
  background-color: transparent !important;
}

body.todo-widget-window,
#root.todo-widget-window {
  overflow: hidden;
}

/* 只移除链接的默认下划线,不强制颜色 */
a {
  text-decoration: none;
}

/* ============================================
   标题体系(工具流密度:h1=页面标题 20px)
   ============================================ */

h1, h2, h3, h4, h5, h6 {
  font-weight: 600;
  color: var(--foreground-emphasis);
  text-wrap: balance;
}

h1 {
  font-size: var(--text-xl);        /* 20px 页面标题 */
  line-height: 1.3;
  letter-spacing: -0.01em;
}

h2 {
  font-size: var(--text-lg);        /* 16px 小节标题 */
  line-height: 1.4;
}

h3 {
  font-size: var(--text-base);      /* 14px 卡片标题 */
  line-height: 1.5;
}

h4 {
  font-size: var(--text-base);
  line-height: 1.5;
  font-weight: 500;
}

h5 {
  font-size: var(--text-sm);
  line-height: 1.5;
  font-weight: 500;
}

h6 {
  font-size: var(--text-xs);
  line-height: 1.5;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}

/* 描述文字 - 次级信息 */
.description,
[class*="Description"] {
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--muted-foreground);
  font-weight: 400;
}

small {
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--muted-foreground);
}

/* 滚动条(隐藏但保留功能) */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
}

::-webkit-scrollbar-track {
  background-color: transparent;
}

::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb);
  border-radius: 99px;
  border: 3px solid transparent;
  background-clip: content-box;
  transition: background-color var(--duration-fast);
}

::-webkit-scrollbar-thumb:hover {
  background-color: var(--scrollbar-thumb-hover);
}

/* View Transitions API 主题切换动画 */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

::view-transition-old(root) {
  z-index: 1;
}

::view-transition-new(root) {
  z-index: 9999;
}

.dark::view-transition-old(root) {
  z-index: 9999;
}

.dark::view-transition-new(root) {
  z-index: 1;
}

/* 大屏幕优化 */
@media (min-width: 1280px) {
  html {
    font-size: 16px;
  }
}
```

- [ ] **Step 2: `src/index.css` 的 `@theme inline` 块增加排版条目**

在 Task 1 的 `@theme inline` 块末尾追加:

```css
  /* 排版 */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Roboto',
    'Helvetica Neue', sans-serif;
  --font-mono: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;

  --text-2xs: 11px;
  --text-2xs--line-height: 1.45;
  --text-xs: 12px;
  --text-xs--line-height: 1.5;
  --text-sm: 13px;
  --text-sm--line-height: 1.55;
  --text-base: 14px;
  --text-base--line-height: 1.6;
  --text-lg: 16px;
  --text-lg--line-height: 1.5;
  --text-xl: 20px;
  --text-xl--line-height: 1.3;
  --text-2xl: 24px;
  --text-2xl--line-height: 1.25;
  --text-3xl: 30px;
  --text-3xl--line-height: 1.2;

  /* 动效(静态值;base.css 与 framer-motion 均消费) */
  --duration-instant: 80ms;
  --duration-fast: 140ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
  --ease-out: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

- [ ] **Step 3: 构建验证**

```bash
pnpm build
```

期望通过。

- [ ] **Step 4: 视觉抽查**

`pnpm dev`:页面标题从 30px 收敛到 20px、正文 15px→14px、次级 13px;滚动条与明暗切换行为不变;`pnpm dev` 下打开 todo widget 窗口确认透明背景不受影响。

- [ ] **Step 5: Commit**

```bash
git add src/styles/base.css src/index.css
git commit -m "feat(design): 排版 token 与元素默认值——基准 14px 工具流密度"
```

---

### Task 3: 圆角、阴影、动效、层级 token

**Files:**
- Modify: `src/index.css`(@theme 增加 radius/shadow/duration/ease 条目;阴影原始 token 放入 tokens.css?否——本任务统一放 `src/styles/tokens.css` 末尾)
- Modify: `src/styles/tokens.css`(追加 elevation 与 z-index token)

**Interfaces:**
- Consumes: 无。
- Produces: 工具类 `rounded-xs/sm/md/lg/xl/full`(覆盖 Tailwind 默认值)、`shadow-xs/sm/md/lg`(模式感知)、`p-0.5` 等全部间距工具类的 4px 基数(`--spacing`);CSS 变量 `--z-dropdown..--z-tooltip`、`--ring-width/--ring-offset-width`、`--layout-sidebar-width( collapsed)/--layout-page-padding`、`--control-h-sm/md/lg`、`--icon-sm/md/lg`;accordion 动画时长切至 `var(--duration-base)`(Task 2 产出)。

- [ ] **Step 1: `src/styles/tokens.css` 末尾追加阴影、层级与布局 token**

阴影用独立名 `--elevation-*`,避免与 `@theme` 的 `--shadow-*` 命名空间互相污染(模式感知由 .dark 块承载;z-index、布局与控件 token 无模式差异):

```css
/* ============================================================
   Tier 2 · 阴影(elevation,由 @theme inline 映射为 shadow-* 工具类)
   ============================================================ */

:root {
  --elevation-xs: 0 1px 2px rgb(16 24 40 / 5%);
  --elevation-sm: 0 1px 3px rgb(16 24 40 / 8%), 0 1px 2px rgb(16 24 40 / 5%);
  --elevation-md: 0 4px 16px rgb(16 24 40 / 10%), 0 2px 4px rgb(16 24 40 / 5%);
  --elevation-lg: 0 16px 40px rgb(16 24 40 / 16%);
}

.dark {
  --elevation-xs: 0 1px 2px rgb(0 0 0 / 35%);
  --elevation-sm: 0 1px 3px rgb(0 0 0 / 40%);
  --elevation-md: 0 4px 16px rgb(0 0 0 / 50%);
  --elevation-lg: 0 16px 40px rgb(0 0 0 / 60%);
}

/* ============================================================
   Tier 3 · 层级与聚焦环
   ============================================================ */

:root {
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-toast: 500;
  --z-tooltip: 600;
  --ring-width: 2px;
  --ring-offset-width: 2px;
}

/* ============================================================
   Tier 3 · 布局与控件
   ============================================================ */

:root {
  --layout-sidebar-width: 240px;
  --layout-sidebar-width-collapsed: 56px;
  --layout-page-padding: 32px;
  --control-h-sm: 28px;
  --control-h-md: 32px;
  --control-h-lg: 36px;
  --icon-sm: 14px;
  --icon-md: 16px;
  --icon-lg: 20px;
}
```

- [ ] **Step 2: `src/index.css` 追加 `@theme` 块(radius/spacing)并把 accordion 动画切到 duration token**

在文件末尾追加(radius/spacing 为静态值,直接进 theme):

```css
@theme {
  /* 圆角 */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* 间距基数(Tailwind 4 所有 p/gap/w-* 工具类的倍数基准) */
  --spacing: 0.25rem;
}

@theme inline {
  /* 阴影 → 模式感知 elevation */
  --shadow-xs: var(--elevation-xs);
  --shadow-sm: var(--elevation-sm);
  --shadow-md: var(--elevation-md);
  --shadow-lg: var(--elevation-lg);
}
```

同时把 Task 1 写入的 `--animate-accordion-down/up` 两条目中的 `0.2s` 替换为 `var(--duration-base)`(spec §7.3):

```css
  --animate-accordion-down: accordion-down var(--duration-base) ease-out;
  --animate-accordion-up: accordion-up var(--duration-base) ease-out;
```

- [ ] **Step 3: 构建验证**

```bash
pnpm build
```

期望通过。

- [ ] **Step 4: 视觉抽查**

`pnpm dev`:dialog/popover 阴影在明暗两种模式下呈现正确(亮色灰黑、暗色更深);任一 `rounded-lg` 元素 8px→10px。

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css src/index.css
git commit -m "feat(design): 圆角/阴影/动效/层级 token"
```

---

### Task 4: 主题系统重构(themes.ts → data-accent)

**Files:**
- Rewrite: `src/lib/themes.ts`
- Modify: `src/features/settings/SettingsPage.tsx`(若主题选择器直接消费 `theme.colors` 字段则同步适配;消费 `id/name/description` 则零改动)

**Interfaces:**
- Consumes: Task 1 的 `[data-accent]` CSS 块。
- Produces: `type AccentId`;`themes: Theme[]`(`{ id, name, description, accent }`);`getThemeById(id): Theme | undefined`;`applyTheme(theme): void`(副作用:`documentElement.dataset.accent = theme.accent`)。签名与旧版完全一致,`theme-store.ts` 零改动。

- [ ] **Step 1: 重写 `src/lib/themes.ts`**

```ts
export type AccentId = 'blue' | 'sky' | 'purple' | 'green' | 'rose' | 'slate';

export interface Theme {
  id: string;          // 沿用旧 id,保证持久化兼容
  name: string;
  description: string;
  accent: AccentId;
}

export const themes: Theme[] = [
  { id: 'default-dark', name: '默认蓝', description: '经典的蓝色主题', accent: 'blue' },
  { id: 'blue-ocean', name: '蓝色海洋', description: '清新的海洋蓝', accent: 'sky' },
  { id: 'purple-night', name: '紫色夜晚', description: '神秘的紫罗兰', accent: 'purple' },
  { id: 'green-forest', name: '绿色森林', description: '自然的翠绿色', accent: 'green' },
  { id: 'rose-gold', name: '玫瑰金', description: '优雅的玫瑰金', accent: 'rose' },
  { id: 'slate', name: '石板灰', description: '专业的灰色调', accent: 'slate' },
];

export const getThemeById = (id: string): Theme | undefined =>
  themes.find(theme => theme.id === id);

/** 应用主题:切换 <html> 的 data-accent 属性(颜色由 CSS token 机制接管) */
export const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.accent = theme.accent;
};

/**
 * 持久化迁移:旧版 Theme 含 colors 字段(HSL 三元组),按 id 映射为新结构。
 * 未知 id 回退 'default-dark'。
 */
export const migrateTheme = (stored: unknown): Theme => {
  if (stored && typeof stored === 'object' && 'id' in stored) {
    return getThemeById((stored as { id: string }).id) ?? themes[0];
  }
  return themes[0];
};
```

- [ ] **Step 2: `src/stores/theme-store.ts` 接入迁移**

`persist` 配置增加 `migrate`(zustand persist 按版本号触发;旧存储无 version,视作 version 0):

```ts
persist(
  (set) => ({ /* ...原逻辑不变,仅 themes 引用自新模块... */ }),
  {
    name: 'liao-tools-theme-storage',
    version: 1,
    migrate: (persisted) => {
      const persistedState = persisted as { currentTheme?: unknown };
      return { ...persistedState, currentTheme: migrateTheme(persistedState?.currentTheme) };
    },
    onRehydrateStorage: () => (state) => {
      if (state?.currentTheme) {
        applyTheme(state.currentTheme);
      } else {
        const defaultTheme = getThemeById(DEFAULT_THEME_ID) ?? themes[0];
        applyTheme(defaultTheme);
      }
    },
  }
)
```

- [ ] **Step 3: 检查设置页主题选择器**

```bash
grep -n "theme.colors\|\.colors\." src/features/settings/*.tsx src/components/**/*.tsx
```

若有消费 `theme.colors` 的预览色块(如主题选择器的小圆点),改为消费新字段:`accent → var(--primary)`(预览圆点直接 `style={{ background: 'var(--primary)' }}` 不可行——它随全局 accent 变,无法区分六个选项;改为常量表 `ACCENT_PREVIEW: Record<AccentId, string> = { blue: '#2E7CF6', sky: '#1799C4', purple: '#8B5CF6', green: '#22A052', rose: '#D9407E', slate: '#5A6B84' }` 放入 `themes.ts` 导出,选择器用它画预览点)。若设置页只渲染 `name/description` 则跳过本步。

- [ ] **Step 4: 构建验证**

```bash
pnpm build
```

期望通过。

- [ ] **Step 5: 功能验证**

`pnpm dev`:设置页依次切换 6 个主题 → 侧边栏选中态/主按钮/链接颜色即时切换;DevTools 确认 `<html data-accent="…">`;明暗切换仍正常。模拟旧存储:DevTools 清 localStorage 前先复制旧值结构(含 `colors` 字段)写入,刷新后主题正确回退且无报错。

- [ ] **Step 6: Commit**

```bash
git add src/lib/themes.ts src/stores/theme-store.ts src/features/settings
git commit -m "refactor(theme): 主题系统重构为 data-accent 属性 + 持久化迁移"
```

---

### Task 5: framer-motion 常量(motion.ts)

**Files:**
- Create: `src/lib/motion.ts`
- Modify: `src/components/common/PageTransition.tsx`(duration: 0.2 → MOTION_DURATION.base)

**Interfaces:**
- Produces: `MOTION_DURATION = { instant: 0.08, fast: 0.14, base: 0.2, slow: 0.32 }`、`MOTION_EASE = { out: [0.25, 1, 0.5, 1], inOut: [0.4, 0, 0.2, 1], spring: [0.34, 1.56, 0.64, 1] }`(framer-motion 用秒/贝塞尔数组,与 CSS token 数值一一对应)。

- [ ] **Step 1: 写入 `src/lib/motion.ts`**

```ts
/**
 * framer-motion 动效常量 —— 与 CSS token(--duration-* / --ease-*)保持同步。
 * 修改任一侧时必须同步另一侧(数值对应:CSS 毫秒 / framer 秒)。
 */
export const MOTION_DURATION = {
  instant: 0.08,
  fast: 0.14,
  base: 0.2,
  slow: 0.32,
} as const;

export const MOTION_EASE = {
  out: [0.25, 1, 0.5, 1],
  inOut: [0.4, 0, 0.2, 1],
  spring: [0.34, 1.56, 0.64, 1],
} as const;
```

- [ ] **Step 2: `PageTransition.tsx` 切换常量**

`transition={{ duration: 0.2, ease: 'easeInOut' }}` → `transition={{ duration: MOTION_DURATION.base, ease: MOTION_EASE.inOut }}`(import 自 `@/lib/motion`)。

- [ ] **Step 3: 构建与视觉验证**

```bash
pnpm build
```

期望通过;`pnpm dev` 页面切换过渡观感与之前一致(0.2s easeInOut)。

- [ ] **Step 4: Commit**

```bash
git add src/lib/motion.ts src/components/common/PageTransition.tsx
git commit -m "feat(design): framer-motion 动效常量与 CSS token 同步"
```

---

### Task 6: 存量清理(调色板硬编码 → 语义 token)

**Files(逐文件修改,按下表映射;未列出的行不动):**
- `src/features/tax/components/SingleQueryTab.tsx`(:223、:226、:228、:231、:406、:492、:494)
- `src/features/tax/components/BatchQueryTab.tsx`(:137、:140、:142、:145、:224)
- `src/features/tax/components/UpdateTab.tsx`(:134、:160、:262)
- `src/features/alta/components/DataManageTab.tsx`(:94、:96、:102、:105、:116、:217)
- `src/features/alta/components/BatchTab.tsx`(:229、:233)
- `src/features/alta/components/QueryTab.tsx`(:207、:248、:254、:260)
- `src/features/system-tools/components/SystemToolCard.tsx`(:19-22)
- `src/features/system-tools/components/ToolEditDialog.tsx`(:198、:222)
- `src/components/UpdateCompleteDialog.tsx`(:48)
- `src/components/common/FileOpenDialog.tsx`(:76)
- `src/components/ui/toast.tsx`(:78)
- `src/components/update-history/UpdateHistoryDetailView.tsx`(:11、:13)
- `src/features/excel/ExcelPage.tsx`(:144)
- `src/features/ups-dpd/UpsUpdPage.tsx`(:251)
- `src/features/todo/TodoPage.tsx`(:411-424 内联 hsl(var)、:429、:484-485 除外——见豁免)
- `src/components/layout/Sidebar.tsx`(:140)

**Interfaces:**
- Consumes: Task 1 的全部语义工具类。
- Produces: 门禁归零的代码库。

**映射总则**:`text-green-600 dark:text-green-400` 这类「亮色深/暗色亮」成对写法一律坍缩为单个语义类(token 自带模式感知);`bg-*-50 dark:bg-*-950/20` 坍缩为 `bg-*-subtle`。

- [ ] **Step 1: tax 组件(warning 提示条 + 状态点)**

| 文件:行 | 旧 | 新 |
|---|---|---|
| SingleQueryTab:223 | `border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20` | `border-warning bg-warning-subtle` |
| SingleQueryTab:226 | `text-yellow-600 dark:text-yellow-500` | `text-warning-fg` |
| SingleQueryTab:228 | `text-yellow-800 dark:text-yellow-200` | `text-warning-subtle-fg` |
| SingleQueryTab:231 | `text-yellow-700 dark:text-yellow-300` | `text-warning-fg` |
| SingleQueryTab:406 | `text-blue-500` | `text-info-fg` |
| SingleQueryTab:492 | `text-red-600` | `text-danger-fg` |
| SingleQueryTab:494 | `text-green-600` | `text-success-fg` |
| BatchQueryTab:137/140/142/145 | 同 SingleQueryTab 223/226/228/231 | 同上对应 |
| BatchQueryTab:224 | `text-green-600 dark:text-green-400` | `text-success-fg` |
| UpdateTab:134 | `bg-blue-500` | `bg-info` |
| UpdateTab:160 | `bg-green-500` / `bg-gray-400` | `bg-success` / `bg-muted-foreground/60` |
| UpdateTab:262 | `text-green-500` | `text-success-fg` |

- [ ] **Step 2: alta 组件(warning 横幅 + 统计色)**

| 文件:行 | 旧 | 新 |
|---|---|---|
| DataManageTab:94 | `border-amber-500/50 bg-amber-500/10` | `border-warning bg-warning-subtle` |
| DataManageTab:96 | `text-amber-600 dark:text-amber-400` | `text-warning-fg` |
| DataManageTab:102 | `text-amber-900 dark:text-amber-200` | `text-warning-subtle-fg` |
| DataManageTab:105 | `text-amber-800 dark:text-amber-300` | `text-warning-fg` |
| DataManageTab:116 | `text-amber-600 dark:text-amber-400` | `text-warning-fg` |
| DataManageTab:217 | `text-green-600 dark:text-green-400` | `text-success-fg` |
| BatchTab:229 | `text-green-600 dark:text-green-400` | `text-success-fg` |
| BatchTab:233 | `text-amber-600 dark:text-amber-400` | `text-warning-fg` |
| QueryTab:207 | `bg-green-500/20 text-green-700 dark:text-green-400` | `bg-success-subtle text-success-subtle-fg` |
| QueryTab:248 | `text-amber-500` | `text-warning-fg` |
| QueryTab:254 | `bg-amber-500/10 text-amber-700 dark:text-amber-400` | `bg-warning-subtle text-warning-fg` |
| QueryTab:260 | `text-amber-600 dark:text-amber-400` | `text-warning-fg` |

- [ ] **Step 3: system-tools(分类色 → 图表色板)与杂项**

| 文件:行 | 旧 | 新 |
|---|---|---|
| SystemToolCard:19 | `bg-blue-500/10 text-blue-500 border-blue-500/20` | `bg-chart-1/10 text-chart-1 border-chart-1/20` |
| SystemToolCard:20 | `bg-green-500/10 text-green-500 border-green-500/20` | `bg-chart-2/10 text-chart-2 border-chart-2/20` |
| SystemToolCard:21 | `bg-purple-500/10 text-purple-500 border-purple-500/20` | `bg-chart-5/10 text-chart-5 border-chart-5/20` |
| SystemToolCard:22 | `bg-orange-500/10 text-orange-500 border-orange-500/20` | `bg-chart-3/10 text-chart-3 border-chart-3/20` |
| ToolEditDialog:198、:222 | `text-red-500` | `text-danger-fg` |
| UpdateCompleteDialog:48 | `text-green-500` | `text-success-fg` |
| FileOpenDialog:76 | `text-green-500` | `text-success-fg` |
| ExcelPage:144、UpsUpdPage:251 | `border-gray-300` | `border-input` |
| toast:78 | `group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600` | `group-[.destructive]:text-danger-subtle-fg group-[.destructive]:hover:text-danger-foreground group-[.destructive]:focus:ring-danger-fg group-[.destructive]:focus:ring-offset-danger` |
| UpdateHistoryDetailView:11 | `bg-green-500 hover:bg-green-600 text-white border-green-500` | `bg-success hover:opacity-90 text-success-foreground border-success` |
| UpdateHistoryDetailView:13 | `border-blue-400 text-blue-600 dark:text-blue-400` | `border-info-fg/40 text-info-fg` |

- [ ] **Step 4: 内联样式 token 化(TodoPage + Sidebar)**

| 文件:行 | 旧 | 新 |
|---|---|---|
| TodoPage:411 | `backgroundColor: isActive ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--card))'` | `backgroundColor: isActive ? 'var(--primary-subtle)' : 'var(--card)'` |
| TodoPage:412 | `borderColor: isActive ? 'hsl(var(--primary) / 0.9)' : 'hsl(var(--border))'` | `borderColor: isActive ? 'var(--primary)' : 'var(--border)'` |
| TodoPage:414 | `boxShadow: '0 0 0 3px hsl(var(--primary) / 0.22), 0 14px 32px -18px hsl(var(--foreground) / 0.5)'` | `boxShadow: '0 0 0 3px var(--primary-subtle), var(--shadow-lg)'` |
| TodoPage:420 | `'hsl(var(--primary))'` | `'var(--primary)'` |
| TodoPage:424 | `'hsl(var(--primary))'` | `'var(--primary)'` |
| Sidebar:140 | `'hsl(var(--primary))'` | `'var(--primary)'` |
| TodoPage:429 与 :484-485 的 `PRIORITY_COLORS` | 不动(widget 共享常量,豁免) | — |

- [ ] **Step 5: 门禁验证**

```bash
grep -rEn '(text|bg|border|ring|from|to|via|divide|outline|decoration|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}' src --include='*.tsx'
grep -rEn '#[0-9a-fA-F]{6}\b' src --include='*.tsx' | grep -v 'features/todo/'
grep -rEn 'hsl\(var\(' src --include='*.tsx' --include='*.css' | grep -v 'styles/tokens.css'
```

期望:三条命令均无输出(todo 豁免域与 tokens.css 除外)。

- [ ] **Step 6: 构建验证**

```bash
pnpm build
```

期望通过。

- [ ] **Step 7: 视觉抽查**

`pnpm dev`,暗色模式:tax 页提示条呈暗色 amber 浅底(不再是亮黄 bg-yellow-50);alta 横幅同理;system-tools 分类卡片色斑在暗色下自适应;todo 页选中卡片高亮恢复。

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "refactor(design): 存量硬编码调色板清零,统一语义 token"
```

---

### Task 7: 终验(规格 §11 验证标准)

**Files:** 无新改动(仅验证;发现问题则小修回对应文件)。

- [ ] **Step 1: 全量门禁**

```bash
pnpm build
grep -rEn '(text|bg|border|ring)-(green|amber|yellow|red|blue|purple|orange|slate|gray)-[0-9]' src --include='*.tsx' | grep -v 'features/todo/'
grep -rEn '#[0-9a-fA-F]{6}\b' src --include='*.tsx' | grep -v 'features/todo/'
```

期望:build 通过,两条 grep 无输出。

- [ ] **Step 2: 四组合视觉验证**

`pnpm tauri dev`,逐一截图存档(可放 `/tmp/design-tokens-shots/`):

1. 暗色 + blue(默认):sidebar、revcal 表格页、todo 页、设置页
2. 暗色 + purple:同上四页(验证 accent 切换)
3. 亮色 + blue:同上四页
4. 亮色 + green:同上四页

检查点:表面阶梯可辨(画布→卡片→浮层);文字层级清晰;状态色(成功绿/警告琥珀/危险红)在两种模式下对比度可读;无残留刺眼纯 Tailwind 亮黄/亮绿。

- [ ] **Step 3: 功能回归**

- 主题选择器 6 项切换即时生效,`<html data-accent>` 正确;
- 旧持久化数据迁移:预置含 `colors` 字段的旧存储后刷新,无报错且主题回退正确;
- 明暗三态(跟随系统/浅色/深色)切换正常;
- todo widget 独立窗口透明背景与皮肤不受影响;
- shadcn 组件(button/dialog/select/toast)无破相。

- [ ] **Step 4: 收尾提交(如有小修)**

```bash
git add -A src
git commit -m "fix(design): 终验修正"
```

无小修则跳过。
