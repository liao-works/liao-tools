/**
 * 在线教程站点（VitePress 构建并部署到 GitHub Pages）。
 * 线上地址：https://liao-works.github.io/liao-tools/
 */
export const TUTORIAL_SITE_BASE_URL = 'https://liao-works.github.io/liao-tools/';

/**
 * 功能 ID → 教程站 Markdown 源文件路径。
 * 与 website/guide/ 下的文件一一对应。
 */
export const TUTORIAL_GUIDE_PATHS = {
  home: 'guide/home.md',
  todo: 'guide/todo.md',
  alta: 'guide/alta.md',
  tax: 'guide/tax.md',
  cbm: 'guide/cbm.md',
  tracking: 'guide/tracking.md',
  shipping: 'guide/shipping.md',
  exchange: 'guide/exchange.md',
  excel: 'guide/excel.md',
  revcal: 'guide/revcal.md',
  translate: 'guide/translate.md',
  'text-tools': 'guide/text-tools.md',
  'system-tools': 'guide/system-tools.md',
  settings: 'guide/settings.md',
  'data-maintenance': 'guide/data-maintenance.md',
  usage: 'guide/usage.md',
  updates: 'guide/updates.md',
} as const;

export type TutorialFeatureId = keyof typeof TUTORIAL_GUIDE_PATHS;

/**
 * 按站点 URL 规则（去掉 .md 后缀 + .html）得到完整教程页面地址。
 */
export function getTutorialUrl(featureId: TutorialFeatureId): string {
  const path = TUTORIAL_GUIDE_PATHS[featureId];
  return `${TUTORIAL_SITE_BASE_URL}${path.replace(/\.md$/, '')}.html`;
}
