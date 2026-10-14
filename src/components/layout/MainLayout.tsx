import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, Moon, Sun } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { UpdateDialog } from '@/components/UpdateDialog';
import { checkForUpdates, loadUpdateSettings, updateLastCheckTime } from '@/lib/updater';
import { useDarkMode } from '@/hooks/use-dark-mode';

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('lt-sidebar-collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [autoUpdateOpen, setAutoUpdateOpen] = useState(false);
  const { isDark, toggleDarkMode } = useDarkMode();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { localStorage.setItem('lt-sidebar-collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); event.stopPropagation(); setCommandOpen(x => !x);
      } else if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
  useEffect(() => {
    const check = async () => {
      try {
        const cfg = await loadUpdateSettings();
        if (!cfg.auto_check) return;
        const elapsed = (Math.floor(Date.now()/1000) - cfg.last_check_time)/3600;
        if (elapsed < (cfg.check_interval_hours || 24)) return;
        const info = await checkForUpdates();
        await updateLastCheckTime();
        if (info.has_update) setAutoUpdateOpen(true);
      } catch (error) { console.error('更新检查失败', error); }
    };
    const timer = window.setTimeout(() => { void check(); }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="lt-app">
      {mobileOpen && <button className="lt-mobile-scrim" type="button" onClick={() => setMobileOpen(false)} aria-label="关闭导航"/>}
      <div className={['lt-sidebar-host', mobileOpen ? 'lt-sidebar-host--open' : ''].join(' ')}>
        <Sidebar collapsed={collapsed && !mobileOpen} onToggle={() => setCollapsed(x => !x)}
          onNavigate={() => setMobileOpen(false)}/>
      </div>
      <div className="lt-main">
        <header className="lt-topbar">
          <button type="button" className="lt-icon-button lt-mobile-menu" aria-label="展开导航" onClick={() => setMobileOpen(true)}><Menu size={20}/></button>
          <button type="button" className="lt-top-search" onClick={() => setCommandOpen(true)}>
            <Search size={17}/><span>搜索工具、查询 HS Code、快速打开功能…</span><kbd>Ctrl K</kbd>
          </button>
          <div className="lt-top-actions">
            <span className="lt-local-note"><i/>本地桌面工具</span>
            <button type="button" className="lt-icon-button" title={isDark ? '切换到浅色模式' : '切换到深色模式'}
              onClick={toggleDarkMode}>{isDark ? <Sun size={18}/> : <Moon size={18}/>}</button>
            <button type="button" className="lt-avatar" title="偏好设置" onClick={() => navigate('/settings')}>L</button>
          </div>
        </header>
        <main className="lt-content" id="main-content"><Outlet/></main>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)}/>
      <UpdateDialog open={autoUpdateOpen} onOpenChange={setAutoUpdateOpen} autoCheck/>
    </div>
  );
}
