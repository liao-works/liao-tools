import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { UpdateDialog } from '@/components/UpdateDialog';
import { checkForUpdates, loadUpdateSettings, updateLastCheckTime } from '@/lib/updater';

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [autoUpdateDialogOpen, setAutoUpdateDialogOpen] = useState(false);

  // 应用启动时自动检查更新
  useEffect(() => {
    const autoCheckUpdate = async () => {
      try {
        const settings = await loadUpdateSettings();

        // 如果未启用自动检查，直接返回
        if (!settings.auto_check) {
          return;
        }

        // 检查是否应该检查更新（基于时间间隔）
        const now = Math.floor(Date.now() / 1000);
        const elapsed_hours = (now - settings.last_check_time) / 3600;
        const interval = settings.check_interval_hours || 24;

        if (elapsed_hours < interval) {
          console.log(`距离上次检查仅 ${elapsed_hours.toFixed(1)} 小时，跳过自动检查`);
          return;
        }

        console.log('开始自动检查更新...');
        const updateInfo = await checkForUpdates();
        await updateLastCheckTime();

        // 如果有更新，显示对话框
        if (updateInfo.has_update) {
          setAutoUpdateDialogOpen(true);
        }
      } catch (error) {
        console.error('自动检查更新失败:', error);
      }
    };

    // 延迟3秒后执行，避免影响应用启动速度
    const timer = setTimeout(autoCheckUpdate, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 侧边栏 */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      {/* 主内容区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 页面内容 */}
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>

      {/* 自动检查更新对话框 */}
      <UpdateDialog
        open={autoUpdateDialogOpen}
        onOpenChange={setAutoUpdateDialogOpen}
        autoCheck={true}
      />
    </div>
  );
}
