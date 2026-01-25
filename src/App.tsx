import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { AltaPage } from './features/alta/AltaPage';
import { TaxPage } from './features/tax/TaxPage';
import { ExcelPage } from './features/excel/ExcelPage';
import { UpsUpdPage } from './features/ups-dpd/UpsUpdPage';
import { SystemToolsPage } from './features/system-tools/SystemToolsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { Toaster } from './components/ui/toaster';
import { useDarkMode } from './hooks/use-dark-mode';
import { useTheme } from './hooks/use-theme';

function App() {
  // 初始化暗色模式和主题
  useDarkMode();
  useTheme();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/system-tools" replace />} />
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
