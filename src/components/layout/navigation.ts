import {
  CheckCircle2,
  Database,
  FileBarChart,
  FileSpreadsheet,
  Home,
  Package,
  Percent,
  Search,
  Settings,
  ShoppingBag,
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
    ],
  },
  {
    title: '文件处理',
    items: [
      { title: 'Excel 拆分', href: '/excel', icon: FileSpreadsheet, description: '海铁有图、无图及空运处理', keywords: ['excel', 'xlsx', '海铁', '空运', '拆分'] },
      { title: 'UPS / DPD', href: '/ups-dpd', icon: Package, description: '物流数据与模板填充', keywords: ['ups', 'dpd', '物流', '模板'] },
    ],
  },
  {
    title: '效率工具',
    items: [
      { title: '系统工具', href: '/system-tools', icon: Wrench, description: '启动系统程序与自定义工具', keywords: ['系统', '软件', '程序', '启动'] },
      { title: 'Todo 清单', href: '/todo', icon: CheckCircle2, description: '记录任务与桌面小组件', keywords: ['todo', '待办', '任务', '小组件'] },
    ],
  },
  {
    title: '管理',
    items: [
      { title: '数据维护', href: '/data-maintenance', icon: Database, description: '关税、Alta 数据版本、更新和历史', keywords: ['数据', '维护', '更新', '版本', '同步', '审核', '完整性', '历史'] },
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
