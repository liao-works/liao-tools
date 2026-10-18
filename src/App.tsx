import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { MainLayout } from './components/layout/MainLayout';
import { UpdateCenter } from './components/UpdateCenter';
import { AltaPage } from './features/alta/AltaPage';
import { HomePage } from './features/home/HomePage';
import { TaxPage } from './features/tax/TaxPage';
import { ExcelPage } from './features/excel/ExcelPage';
import { UpsUpdPage } from './features/ups-dpd/UpsUpdPage';
import { RevCalPage } from './features/revcal/RevCalPage';
import { SystemToolsPage } from './features/system-tools/SystemToolsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { DataMaintenancePage } from './features/data-maintenance/DataMaintenancePage';
import { UsageStatsPage } from './features/usage/UsageStatsPage';
import { TodoPage } from './features/todo/TodoPage';
import { TodoWidget } from './features/todo/TodoWidget';
import { Toaster } from './components/ui/toaster';
import { UpdateHistoryHost } from './components/update-history/UpdateHistoryHost';
import { useDarkMode } from './hooks/use-dark-mode';
import { useTheme } from './hooks/use-theme';

function TodoShortcutBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    const focusTimers = new Set<number>();
    void listen('sticky-notes-open-main-for-input', () => {
      navigate('/todo');
      [0, 60, 180].forEach((delay) => {
        const timer = window.setTimeout(() => {
          focusTimers.delete(timer);
          if (alive) window.dispatchEvent(new Event('todo:focus-main-input'));
        }, delay);
        focusTimers.add(timer);
      });
    }).then((dispose) => {
      if (alive) unlisten = dispose;
      else dispose();
    }).catch((error: unknown) => {
      console.error('待办快捷入口监听失败:', error);
    });

    return () => {
      alive = false;
      unlisten?.();
      focusTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [navigate]);

  return null;
}

function App() {
  useDarkMode();
  useTheme();

  return (
    <BrowserRouter>
      <TodoShortcutBridge />
      <Routes>
        <Route path="/todo-widget" element={<TodoWidget />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path="todo" element={<TodoPage />} />
          <Route path="alta" element={<AltaPage />} />
          <Route path="tax" element={<TaxPage />} />
          <Route path="excel" element={<ExcelPage />} />
          <Route path="ups-dpd" element={<UpsUpdPage />} />
          <Route path="revcal" element={<RevCalPage />} />
          <Route path="system-tools" element={<SystemToolsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="data-maintenance" element={<DataMaintenancePage />} />
          <Route path="usage" element={<UsageStatsPage />} />
          <Route path="updates" element={<UpdateCenter />} />
        </Route>
      </Routes>
      <Toaster />
      <UpdateHistoryHost />
    </BrowserRouter>
  );
}

export default App;
