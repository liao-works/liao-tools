import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { AltaPage } from './features/alta/AltaPage';
import { TaxPage } from './features/tax/TaxPage';
import { ExcelPage } from './features/excel/ExcelPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { Toaster } from './components/ui/toaster';
import { useDarkMode } from './hooks/use-dark-mode';

function App() {
  // 初始化暗色模式
  useDarkMode();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/alta" replace />} />
          <Route path="alta" element={<AltaPage />} />
          <Route path="tax" element={<TaxPage />} />
          <Route path="excel" element={<ExcelPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
