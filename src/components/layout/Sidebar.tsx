import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Check, ChevronLeft, ChevronRight, Download, Moon, Palette, Search, Settings, Sun, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTheme } from '@/hooks/use-theme';
import { useDarkMode } from '@/hooks/use-dark-mode';
import { ACCENT_PREVIEW } from '@/lib/themes';
import { UpdateDialog } from '@/components/UpdateDialog';
import { navGroups } from './navigation';
import logo from '@/assets/logo-64.png';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onToggle, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const { currentTheme, themes, changeTheme } = useTheme();
  const { isDark, toggleDarkMode } = useDarkMode();
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [themePopoverOpen, setThemePopoverOpen] = useState(false);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="关闭导航菜单"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-foreground/30 md:hidden"
        />
      )}
      <aside
        aria-label="主导航"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col border-r border-border bg-card shadow-lg transition-transform duration-200 md:relative md:z-auto md:translate-x-0 md:shadow-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'md:w-16' : 'md:w-64',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
          <NavLink to="/" onClick={onClose} title="返回工作台" className="flex min-w-0 items-center gap-2 rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
            <span className={cn('min-w-0', collapsed && 'md:hidden')}>
              <span className="block truncate text-sm font-semibold text-foreground-emphasis">Liao Tools</span>
              <span className="block truncate text-[11px] text-muted-foreground">轻量专业工具集</span>
            </span>
          </NavLink>
          <button type="button" aria-label="关闭侧边栏" onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-accent md:hidden">
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            onClick={onToggle}
            className="hidden rounded-md p-2 text-muted-foreground hover:bg-accent md:block"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={() => { onClose(); window.dispatchEvent(new Event('liao:open-command')); }}
            title="搜索工具（Ctrl / ⌘ + K）"
            className={cn(
              'flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              collapsed && 'md:justify-center md:px-0',
            )}
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className={cn('flex-1 text-left', collapsed && 'md:hidden')}>搜索工具</span>
            <kbd className={cn('text-[11px]', collapsed && 'md:hidden')}>⌘ K</kbd>
          </button>
        </div>

        <nav aria-label="工具列表" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.title}>
              <div className={cn('mb-1.5 px-3 text-[10px] font-semibold tracking-[.12em] text-muted-foreground/80', collapsed && 'md:sr-only')}>
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.href === '/'}
                    onClick={onClose}
                    title={collapsed ? item.title : undefined}
                    className={({ isActive }) => cn(
                      'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      isActive ? 'bg-primary-subtle font-semibold text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      collapsed && 'md:justify-center md:px-0',
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    <span className={cn('truncate', collapsed && 'md:hidden')}>{item.title}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-3">
          <div className={cn('mb-2 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2', collapsed && 'md:hidden')}>
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />
            <span className="truncate text-xs text-muted-foreground">{currentTheme.name}</span>
          </div>
          <div className={cn('flex items-center justify-between gap-1', collapsed && 'md:flex-col')}>
            <Button variant="ghost" size="icon" onClick={toggleDarkMode} title={isDark ? '切换到浅色' : '切换到深色'} aria-label={isDark ? '切换到浅色' : '切换到深色'}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Popover open={themePopoverOpen} onOpenChange={setThemePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" title="配色方案" aria-label="配色方案"><Palette className="h-4 w-4" /></Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">配色方案</p>
                {themes.map((theme) => (
                  <button
                    type="button"
                    key={theme.id}
                    onClick={() => { changeTheme(theme.id); setThemePopoverOpen(false); }}
                    className={cn('flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent', currentTheme.id === theme.id && 'bg-accent')}
                  >
                    <span className="h-4 w-4 rounded-sm" style={{ backgroundColor: ACCENT_PREVIEW[theme.accent] }} />
                    <span className="flex-1">{theme.name}</span>
                    {currentTheme.id === theme.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" onClick={() => setUpdateDialogOpen(true)} title="检查应用更新" aria-label="检查应用更新">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { onClose(); navigate('/settings'); }} title="设置" aria-label="设置">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
      <UpdateDialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen} />
    </>
  );
}
