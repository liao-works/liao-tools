import {
  BarChart3,
  Boxes,
  CheckCircle2,
  Database,
  FileBarChart,
  FileSpreadsheet,
  Home,
  Languages,
  PackageSearch,
  Percent,
  Search,
  Settings,
  Ship,
  ShoppingBag,
  Type,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface ToolNavigationItem {
  title: string;
  href: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
}

export interface ToolNavigationGroup {
  title: string;
  items: ToolNavigationItem[];
}

export const navGroups: ToolNavigationGroup[] = [
  {
    title: '工作空间',
    items: [
      { title: '工作台', href: '/', icon: Home, description: '快速找到要使用的工具', keywords: ['首页', 'home', '搜索'] },
    ],
  },
  {
    title: '业务查询',
    items: [
      { title: '英国 / 北爱关税', href: '/tax', icon: Percent, description: 'HS 编码、英国及北爱税率', keywords: ['税率', '关税', 'hs', 'gb', 'ni', '批量'] },
      { title: 'Alta 禁运', href: '/alta', icon: FileBarChart, description: '匹配禁运清单及例外条目', keywords: ['alta', '禁运', '限制', 'hs'] },
      { title: 'Amazon 商品', href: '/revcal', icon: ShoppingBag, description: 'ASIN / UPC / EAN 信息查询', keywords: ['amazon', 'asin', 'upc', 'ean', '价格', '尺寸', '商品'] },
      { title: '体积 / 计费重', href: '/cbm', icon: Boxes, description: 'CBM、体积重与计费重试算', keywords: ['cbm', '体积', '体积重', '计费重', '装柜', '柜型', '空运', '海运', '快递'] },
      { title: '运单轨迹', href: '/tracking', icon: PackageSearch, description: '批量查询运单轨迹与预计送达', keywords: ['轨迹', 'tracking', '运单', '单号', '17track', '物流', '签收', '承运商'] },
      { title: '船司查询', href: '/shipping', icon: Ship, description: '船司名录、官网与单号识别直达官方查询', keywords: ['船司', '船公司', '船东', 'shipping', '官网', '货物追踪', '集装箱', '提单', '柜号', '单号识别'] },
    ],
  },
  {
    title: '文件处理',
    items: [
      { title: 'Excel 拆分', href: '/excel', icon: FileSpreadsheet, description: '海铁有图、无图及空运处理', keywords: ['excel', 'xlsx', '海铁', '空运', '拆分'] },
    ],
  },
  {
    title: '效率工具',
    items: [
      { title: '系统工具', href: '/system-tools', icon: Wrench, description: '启动系统程序与自定义工具', keywords: ['系统', '软件', '程序', '启动'] },
      { title: 'Todo 清单', href: '/todo', icon: CheckCircle2, description: '记录任务与桌面小组件', keywords: ['todo', '待办', '任务', '小组件'] },
      { title: '翻译', href: '/translate', icon: Languages, description: '邮件翻译、润色与语气解读', keywords: ['翻译', 'translate', '邮件', '润色', '解释', 'deepseek', 'gemini'] },
      { title: '文本处理', href: '/text-tools', icon: Type, description: '分割元素、尺寸合并与数字统计等文本整理', keywords: ['文本', 'text', '分割', '格式化', '尺寸', 'cbm', '统计', '大小写'] },
    ],
  },
  {
    title: '管理',
    items: [
      { title: '数据维护', href: '/data-maintenance', icon: Database, description: '关税、Alta 数据版本、更新和历史', keywords: ['数据', '维护', '更新', '版本', '同步', '审核', '完整性', '历史'] },
      { title: '使用统计', href: '/usage', icon: BarChart3, description: '查询次数、数据量与处理时长统计', keywords: ['统计', '使用', '查询次数', '数据量', '时长', '周', '月', '报表'] },
      { title: '偏好设置', href: '/settings', icon: Settings, description: '主题、更新与应用设置', keywords: ['设置', '主题', '更新', 'dark'] },
    ],
  },
];

export const allNavItems = navGroups.flatMap((group) => group.items);

export function findTools(query: string): ToolNavigationItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return allNavItems;
  return allNavItems.filter((item) =>
    [item.title, item.description, item.href, ...item.keywords].some((part) =>
      part.toLocaleLowerCase().includes(normalized),
    ),
  );
}

export const commandIcon = Search;
