import { defineConfig } from 'vitepress'

// 站点部署在 GitHub Pages 的 /liao-tools/ 子路径下（仓库 liao-works/liao-tools）。
// 站内链接一律以 / 开头书写（如 /guide/tax），VitePress 构建时会自动补上 base。
export default defineConfig({
  lang: 'zh-CN',
  title: 'Liao Tools 使用教程',
  description:
    'Liao Tools 桌面工具箱的图文教程：英国/北爱尔兰关税查询、Alta 禁运筛查、Amazon 商品信息、体积计费重、运单轨迹、船司与汇率、Excel 拆分、翻译与文本处理。',

  // GitHub Pages 子路径部署
  base: '/liao-tools/',

  // WRITERS.md 是写手规范文档，不是教程页，不进入站点
  srcExclude: ['WRITERS.md'],

  vite: {
    css: {
      // 内联空 PostCSS 配置：阻止 Vite 向上查找到仓库根目录的 postcss.config.js
      // （根配置依赖主应用的 @tailwindcss/postcss，CI 只装 website 依赖时不可用）
      postcss: { plugins: [] }
    }
  },

  themeConfig: {
    siteTitle: 'Liao Tools 使用教程',

    nav: [
      { text: '首页', link: '/' },
      { text: '快速上手', link: '/guide/home' },
      { text: '数据维护', link: '/guide/data-maintenance' }
    ],

    // 侧边栏分组即推荐阅读顺序：快速上手 → 按功能场景分组
    sidebar: [
      {
        text: '快速上手',
        items: [
          { text: '教程首页', link: '/' },
          { text: '认识工作台', link: '/guide/home' }
        ]
      },
      {
        text: '关税与合规',
        items: [
          { text: '英国 / 北爱尔兰关税查询', link: '/guide/tax' },
          { text: 'Alta 禁运商品查询', link: '/guide/alta' },
          { text: '数据维护', link: '/guide/data-maintenance' }
        ]
      },
      {
        text: '物流与货运',
        items: [
          { text: '运单轨迹查询', link: '/guide/tracking' },
          { text: '船司查询', link: '/guide/shipping' },
          { text: '体积 / 计费重计算', link: '/guide/cbm' }
        ]
      },
      {
        text: '商品与行情',
        items: [
          { text: 'Amazon 商品查询', link: '/guide/revcal' },
          { text: '汇率查询', link: '/guide/exchange' }
        ]
      },
      {
        text: '文件与文本处理',
        items: [
          { text: 'Excel 数据拆分', link: '/guide/excel' },
          { text: '文本处理', link: '/guide/text-tools' }
        ]
      },
      {
        text: '日常效率',
        items: [
          { text: 'Todo 清单', link: '/guide/todo' },
          { text: '翻译', link: '/guide/translate' },
          { text: '系统工具', link: '/guide/system-tools' }
        ]
      },
      {
        text: '应用管理',
        items: [
          { text: '偏好设置', link: '/guide/settings' },
          { text: '使用统计', link: '/guide/usage' },
          { text: '应用更新', link: '/guide/updates' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/liao-works/liao-tools' }
    ],

    // 本地搜索（构建时生成索引，无需外部服务）
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索教程',
            buttonAriaLabel: '搜索教程'
          },
          modal: {
            noResultsText: '未找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭'
            }
          }
        }
      }
    },

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    footer: {
      message: 'Liao Tools 使用教程 · 基于 VitePress 构建',
      copyright: 'Copyright © 2026 Liao Works'
    }
  }
})
