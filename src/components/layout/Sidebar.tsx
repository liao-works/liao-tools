import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FileBarChart, FileSpreadsheet, Settings, Percent, ChevronLeft, ChevronRight, Moon, Sun, Palette, Package, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTheme } from '@/hooks/use-theme';
import { useDarkMode } from '@/hooks/use-dark-mode';
import { UpdateDialog } from '@/components/UpdateDialog';
import logo from '@/assets/logo-64.png';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  {
    title: 'Alta查询',
    href: '/alta',
    icon: FileBarChart,
    description: '禁运商品查询',
  },
  {
    title: '税率查询',
    href: '/tax',
    icon: Percent,
    description: '英国海关税率',
  },
  {
    title: 'Excel拆分',
    href: '/excel',
    icon: FileSpreadsheet,
    description: '合并单元格拆分',
  },
  {
    title: 'UPS/DPD',
    href: '/ups-dpd',
    icon: Package,
    description: '物流数据模板填充',
  },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const { currentTheme } = useTheme();
  const { isDark, toggleDarkMode } = useDarkMode();
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  return (
    <aside
      className={cn(
        'relative border-r bg-card transition-all duration-300 flex flex-col',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* 折叠按钮 */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-6 z-10 h-6 w-6 rounded-full border bg-background"
        onClick={onToggle}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </Button>

      {/* Logo区域 */}
      <div className="flex h-16 items-center border-b px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center overflow-hidden">
            <img src={logo} alt="Liao Tools" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sm">Liao Tools</span>
              <span className="text-xs text-muted-foreground">多功能工具集</span>
            </div>
          )}
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isActive
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'text-muted-foreground',
                collapsed && 'justify-center'
              )
            }
            title={collapsed ? item.title : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && (
              <div className="flex flex-col">
                <span>{item.title}</span>
                <span className="text-xs opacity-70">{item.description}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 底部控制区域 */}
      <div className="shrink-0 border-t bg-card/50">
        {!collapsed && (
          <>
            {/* 当前主题显示 */}
            <div className="p-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                <div
                  className="h-3 w-3 rounded-full shadow-sm shrink-0"
                  style={{ backgroundColor: `hsl(${currentTheme.colors.primary})` }}
                />
                <span className="text-sm font-medium truncate">{currentTheme.name}</span>
              </div>
            </div>
            <Separator className="mx-3" />
          </>
        )}

        {/* 控制按钮组 */}
        <div className={cn(
          "flex p-3 gap-1",
          collapsed ? "flex-col" : "items-center justify-center"
        )}>
          {/* 亮色/暗色切换 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDarkMode}
            title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
            className="group relative shrink-0 h-9 w-9"
          >
            <Sun
              className={`h-4 w-4 transition-all duration-300 absolute ${
                isDark
                  ? 'rotate-0 scale-100 opacity-100'
                  : 'rotate-90 scale-0 opacity-0'
              } group-hover:rotate-90`}
            />
            <Moon
              className={`h-4 w-4 transition-all duration-300 absolute ${
                isDark
                  ? '-rotate-90 scale-0 opacity-0'
                  : 'rotate-0 scale-100 opacity-100'
              } group-hover:-rotate-12`}
            />
          </Button>

          {/* 主题设置按钮 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/settings')}
            title="主题设置"
            className="shrink-0 h-9 w-9"
          >
            <Palette className="h-4 w-4" />
          </Button>

          {/* 检查更新按钮 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setUpdateDialogOpen(true)}
            title="检查更新"
            className="shrink-0 h-9 w-9"
          >
            <Download className="h-4 w-4" />
          </Button>

          {/* 设置按钮 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/settings')}
            title="设置"
            className="shrink-0 h-9 w-9"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 更新对话框 */}
      <UpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
      />
    </aside>
  );
}
