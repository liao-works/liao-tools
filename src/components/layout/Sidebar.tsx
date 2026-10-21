import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Home, Search, ShieldCheck, FileSpreadsheet, Wrench,
  CheckCheck, Languages, Settings, Database, Calculator, PanelLeftClose, PanelLeftOpen, RefreshCw,
  Boxes, PackageSearch, Ship
} from 'lucide-react';
import { useDataUpdateStatusStore } from '@/stores/data-update-status-store';
import { useAppUpdateStatusStore } from '@/stores/app-update-status-store';

interface SidebarProps { collapsed: boolean; onToggle: () => void; onNavigate?: () => void }

const groups = [
  { label: '工作空间', items: [{ label: '工作台', href: '/', icon: Home, end: true }] },
  { label: '业务查询', items: [
    { label: '关税查询', href: '/tax', icon: Search },
    { label: 'Alta 禁运查询', href: '/alta', icon: ShieldCheck },
    { label: 'Amazon 商品查询', href: '/revcal', icon: Calculator },
    { label: '体积 / 计费重', href: '/cbm', icon: Boxes },
    { label: '运单轨迹', href: '/tracking', icon: PackageSearch },
    { label: '船司查询', href: '/shipping', icon: Ship },
  ] },
  { label: '文件处理', items: [
    { label: 'Excel 数据拆分', href: '/excel', icon: FileSpreadsheet },
  ] },
  { label: '效率工具', items: [
    { label: '系统工具', href: '/system-tools', icon: Wrench },
    { label: 'Todo 清单', href: '/todo', icon: CheckCheck },
    { label: '翻译', href: '/translate', icon: Languages },
  ] },
];

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  // 任一远程数据库（关税 / 禁运清单）有更新时，数据维护入口显示绿点并在悬停时提示。
  const dataUpdatePending = useDataUpdateStatusStore(
    (s) => s.tax.hasUpdate === true || s.alta.hasUpdate === true,
  );
  const maintenanceTitle = dataUpdatePending
    ? '远程数据库已更新，需要更新数据'
    : (collapsed ? '数据维护' : undefined);

  // 应用有新版本时，「应用更新」入口显示同样的绿点提示。
  const appUpdate = useAppUpdateStatusStore((s) => s.hasUpdate === true);
  const appLatestVersion = useAppUpdateStatusStore((s) => s.latestVersion);
  const appUpdateTitle = appUpdate
    ? (appLatestVersion ? `发现新版本 v${appLatestVersion}，需要更新应用` : '发现新版本，需要更新应用')
    : (collapsed ? '应用更新' : undefined);

  return (
    <aside className={['lt-sidebar', collapsed ? 'lt-sidebar--collapsed' : ''].join(' ')} aria-label="主导航">
      <div className="lt-brand">
        <NavLink to="/" end className="lt-brand-link" onClick={onNavigate} title="Liao Tools 工作台">
          <img className="lt-brand-symbol" src="/app-icon.svg" alt="" aria-hidden="true" />
          {!collapsed && <span className="lt-brand-title">Liao <strong>Tools</strong></span>}
        </NavLink>
        <button className="lt-icon-button lt-collapse" type="button" onClick={onToggle}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'} aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}>
          {collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}
        </button>
      </div>
      <nav className="lt-navigation">
        {groups.map(group => (
          <div className="lt-nav-group" key={group.label}>
            {!collapsed && <div className="lt-nav-label">{group.label}</div>}
            {group.items.map(item => (
              <NavLink key={item.href} to={item.href} end={item.href === '/'}
                onClick={onNavigate} title={collapsed ? item.label : undefined}
                className={({ isActive }) => ['lt-nav-item', isActive ? 'is-active' : ''].join(' ')}>
                <item.icon size={18} strokeWidth={1.8} aria-hidden="true"/>
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="lt-nav-group lt-nav-group--bottom">
          {!collapsed && <div className="lt-nav-label">管理</div>}
          <NavLink to="/data-maintenance" onClick={onNavigate}
            className={({ isActive }) => ['lt-nav-item', isActive ? 'is-active' : ''].join(' ')}
            title={maintenanceTitle} aria-label={dataUpdatePending ? '数据维护（远程数据库有更新）' : undefined}>
            <Database size={18}/>{!collapsed && '数据维护'}
            {dataUpdatePending && <span className="lt-nav-dot" aria-hidden="true"/>}
          </NavLink>
          <NavLink to="/usage" onClick={onNavigate}
            className={({ isActive }) => ['lt-nav-item', isActive ? 'is-active' : ''].join(' ')}
            title={collapsed ? '使用统计' : undefined}><BarChart3 size={18}/>{!collapsed && '使用统计'}</NavLink>
          <NavLink to="/updates" onClick={onNavigate}
            className={({ isActive }) => ['lt-nav-item', isActive ? 'is-active' : ''].join(' ')}
            title={appUpdateTitle} aria-label={appUpdate ? '应用更新（发现新版本）' : undefined}>
            <RefreshCw size={18}/>{!collapsed && '应用更新'}
            {appUpdate && <span className="lt-nav-dot" aria-hidden="true"/>}
          </NavLink>
          <NavLink to="/settings" onClick={onNavigate}
            className={({ isActive }) => ['lt-nav-item', isActive ? 'is-active' : ''].join(' ')}
            title={collapsed ? '偏好设置' : undefined}><Settings size={18}/>{!collapsed && '偏好设置'}</NavLink>
        </div>
      </nav>
      <div className="lt-sidebar-footer">
        {!collapsed && <div className="lt-footer-note"><span className="lt-footer-dot"/> 本地优先 · 桌面工具集</div>}
        <NavLink className="lt-footer-update" to="/updates" onClick={onNavigate}
          title="打开应用更新页面"><RefreshCw size={17}/>{!collapsed && '应用更新'}</NavLink>
      </div>
    </aside>
  );
}
