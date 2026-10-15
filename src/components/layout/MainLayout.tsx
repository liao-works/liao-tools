import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { GlobalCommand } from './GlobalCommand';
import { UpdateDialog } from '@/components/UpdateDialog';
import { checkForUpdates, loadUpdateSettings, updateLastCheckTime } from '@/lib/updater';

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [autoUpdateDialogOpen, setAutoUpdateDialogOpen] = useState(false);

  // Preserve the existing updater behavior. The redesign changes presentation only.
  useEffect(() => {
    const autoCheckUpdate = async () => {
      try {
        const settings = await loadUpdateSettings();
        if (!settings.auto_check) return;
        const now = Math.floor(Date.now() / 1000);
        const elapsedHours = (now - settings.last_check_time) / 3600;
        const interval = settings.check_interval_hours || 24;
        if (elapsedHours < interval) return;
        const updateInfo = await checkForUpdates();
        await updateLastCheckTime();
        if (updateInfo.has_update) setAutoUpdateDialogOpen(true);
      } catch (error) {
        console.error('自动检查更新失败:', error);
      }
    };
    const timer = window.setTimeout(() => void autoCheckUpdate(), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        onClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:hidden">
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="打开导航菜单" className="rounded-lg p-2 text-foreground hover:bg-accent">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-foreground-emphasis">Liao Tools</span>
          <button type="button" onClick={() => window.dispatchEvent(new Event('liao:open-command'))} aria-label="搜索工具" className="rounded-lg p-2 text-foreground hover:bg-accent">
            <Search className="h-5 w-5" />
          </button>
        </header>
        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
      <GlobalCommand />
      <UpdateDialog open={autoUpdateDialogOpen} onOpenChange={setAutoUpdateDialogOpen} autoCheck={true} />
    </div>
  );
}
