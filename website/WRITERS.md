# Liao Tools 教程写手规范

写给为 `website/` 撰写功能教程的写手。站点使用 VitePress 构建，部署在
<https://liao-works.github.io/liao-tools/>。动手前请通读本文，尤其是图片规范和页面结构模板。

## 1. 页面在哪、写什么

- 一个功能对应一页：`website/guide/<id>.md`。功能 id 与页面的对照表见文末。
- 每个功能的骨架页已经建好（只有 frontmatter、一级标题和「本页教程撰写中」占位一行），
  直接覆盖正文即可；**不要改文件名、不要删 frontmatter**。
- 站点首页 `website/index.md`（hero + 功能导览卡）由维护者统一维护；如果你写的功能
  入口或一句话简介有变化，在 PR 里说明即可，不必自行改动首页。

## 2. frontmatter 格式

每页顶部只保留一个 `title`，取值与侧边栏里的功能名完全一致：

```md
---
title: 英国 / 北爱尔兰关税查询
---

# 英国 / 北爱尔兰关税查询

正文从这里开始……
```

- `title` 必填；`layout`、`outline`、`sidebar` 等其他 frontmatter 字段不要添加，保持全站一致。
- 正文第一个元素是与 `title` 相同的一级标题（`#`）。

## 3. 图片引用规范

- 截图统一放在 `website/public/images/<功能id>/` 目录下（目录现在可能不存在，新建即可）。
  文件名用小写英文加连字符，见名知意，例如 `tax-single-result.png`、`todo-widget-add.png`。
- 正文用**站点根绝对路径 + markdown 图片语法**引用：

  ```md
  ![单码查询结果：显示英国 (GB) 与北爱尔兰 (NI) 两张税率卡片](/images/tax/single-result.png)
  ```

- 原理（已在 v0.0.1 构建中实测验证）：VitePress 构建时会自动给 `/` 开头的图片路径补上
  部署前缀 `/liao-tools/`，本地开发与线上都指向正确位置。
- **重要**：`/images/<id>/xx.png` 必须真实存在于 `website/public/images/` 下，否则
  `npm run docs:build` 会直接报 Rollup resolve 错误、构建失败（相当于自动帮你查笔误）。
  所以新增截图后务必先跑一次构建。
- 请统一用上面的 markdown 图片语法；直接写 HTML `<img>` 虽然测试中也能被补前缀，
  但不属于本站约定，PR 评审会要求改回。
- 每张截图都要配一句说明文字（alt）；一张截图只说明一件事，可裁剪到关键区域。

## 4. 页面结构模板

```md
---
title: <功能名>
---

# <功能名>

<一两句话：这个功能解决什么问题、适合什么时候用。>

## 在哪里找到入口

<打开应用后从哪里进入：侧边栏哪一项 / 首页哪个卡片；支持 URL 参数直达的（如
?tab=batch、?module=alta）在这里写明。>

## 逐步操作

1. 点击「开始查询」按钮，页面会显示英国 (GB) 与北爱尔兰 (NI) 两张税率卡片……
2. 在「匹配位数」下拉中选择「6 位匹配」，筛查会按编码前 6 位归类……
3. ……

## 小技巧

- ……

## 常见问题

**问：查询提示「编码无效」怎么办？**

答：先检查编码位数……

## 相关功能

- [Alta 禁运商品查询](/guide/alta)：用同一套 HS Code 做禁运筛查……
```

对「逐步操作」的硬性要求：

- 每一步写清**点哪个界面元素**、操作后**会发生什么**（出现什么结果、弹什么窗、数据去哪）。
- 界面元素名称与实际 UI 文案一致，按钮、页签、下拉选项等用「」括起来；
  拿不准文案时，打开文末表格里对应的应用页面源码核对。
- 一步一句话，不把多个动作挤在一步里。

## 5. 语气要求

- 平实、面向第一次使用该功能的普通用户，不预设背景知识。
- 不营销：不要出现「强大」「极速」「极致体验」这类词，直接说功能做什么、怎么用。
- 中文为主，界面上的专有名词保留原文（如 HS Code、Excel、API Key）。
- 操作类内容用陈述句祈使式（「点击……」），不堆形容词。

## 6. 站内链接

- 指向其他教程页一律写 `/guide/<id>`（如 `[关税查询](/guide/tax)`），构建时自动补前缀。
- 交叉链接挑 1–3 个真正相关的功能即可，写清为什么相关；各功能的 `related` 参考
  首页导览卡与文末对照表。

## 7. 本地预览与构建

```bash
cd website
pnpm install        # 没有 pnpm 时用 npm install
pnpm run docs:dev   # 本地预览：http://localhost:5173/liao-tools/
```

提交前请在**仓库根目录**跑一次构建，确认无报错：

```bash
npm run docs:build
```

（等价于 `npm --prefix website run docs:build`。）

## 8. 完成标准（自检清单）

- [ ] `title` 与侧边栏功能名一致；
- [ ] 图片都放在 `website/public/images/<id>/`，正文用 `/images/<id>/xx.png` 的 markdown 语法引用；
- [ ] 站内链接指向真实存在的页面；
- [ ] `npm run docs:build` 无 error。

## 附：功能与页面对照表

| 功能 id | 教程页 | 侧边栏分组 | 应用页面源码（核对 UI 文案用） |
| --- | --- | --- | --- |
| home | guide/home.md | 快速上手 | src/features/home/HomePage.tsx |
| tax | guide/tax.md | 关税与合规 | src/features/tax/TaxPage.tsx |
| alta | guide/alta.md | 关税与合规 | src/features/alta/AltaPage.tsx |
| data-maintenance | guide/data-maintenance.md | 关税与合规 | src/features/data-maintenance/DataMaintenancePage.tsx |
| tracking | guide/tracking.md | 物流与货运 | src/features/tracking/TrackingPage.tsx |
| shipping | guide/shipping.md | 物流与货运 | src/features/shipping/ShippingLinesPage.tsx |
| cbm | guide/cbm.md | 物流与货运 | src/features/cbm/CbmPage.tsx |
| revcal | guide/revcal.md | 商品与行情 | src/features/revcal/RevCalPage.tsx |
| exchange | guide/exchange.md | 商品与行情 | src/features/exchange/ExchangePage.tsx |
| excel | guide/excel.md | 文件与文本处理 | src/features/excel/ExcelPage.tsx |
| text-tools | guide/text-tools.md | 文件与文本处理 | src/features/text-tools/TextToolsPage.tsx |
| todo | guide/todo.md | 日常效率 | src/features/todo/TodoPage.tsx |
| translate | guide/translate.md | 日常效率 | src/features/translate/TranslatePage.tsx |
| system-tools | guide/system-tools.md | 日常效率 | src/features/system-tools/SystemToolsPage.tsx |
| settings | guide/settings.md | 应用管理 | src/features/settings/SettingsPage.tsx |
| usage | guide/usage.md | 应用管理 | src/features/usage/UsageStatsPage.tsx |
| updates | guide/updates.md | 应用管理 | src/components/UpdateCenter.tsx |
