import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { MainLayout } from './components/layout/MainLayout';
import { AltaPage } from './features/alta/AltaPage';
import { TaxPage } from './features/tax/TaxPage';
import { ExcelPage } from './features/excel/ExcelPage';
import { UpsUpdPage } from './features/ups-dpd/UpsUpdPage';
import { SystemToolsPage } from './features/system-tools/SystemToolsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { TodoPage } from './features/todo/TodoPage';
import { TodoWidget } from './features/todo/TodoWidget';
import { Toaster } from './components/ui/toaster';
import { useDarkMode } from './hooks/use-dark-mode';
import { useTheme } from './hooks/use-theme';

function TodoShortcutBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const register = async () => {
      unlisten = await listen('sticky-notes-open-main-for-input', () => {
        navigate('/todo');
        [0, 60, 180].forEach((delay) => {
          window.setTimeout(() => {
            window.dispatchEvent(new Event('todo:focus-main-input'));
          }, delay);
        });
      });
    };

    void register();

    return () => {
      unlisten?.();
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
          <Route index element={<Navigate to="/system-tools" replace />} />
          <Route path="todo" element={<TodoPage />} />
          <Route path="alta" element={<AltaPage />} />
          <Route path="tax" element={<TaxPage />} />
          <Route path="excel" element={<ExcelPage />} />
          <Route path="ups-dpd" element={<UpsUpdPage />} />
          <Route path="system-tools" element={<SystemToolsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
