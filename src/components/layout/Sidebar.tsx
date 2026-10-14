import { NavLink } from 'react-router-dom';
import {
  Home, Search, ShieldCheck, Package, FileSpreadsheet, Wrench,
  CheckCheck, Settings, Database, Calculator, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { useState } from 'react';
import { UpdateDialog } from '@/components/UpdateDialog';

interface SidebarProps { collapsed: boolean; onToggle: () => void; onNavigate?: () => void }

const groups = [
  { label: '工作空间', items: [{ label: '工作台', href: '/', icon: Home, end: true }] },
  { label: '业务查询', items: [
    { label: '关税查询', href: '/tax', icon: Search },
    { label: 'Alta 禁运查询', href: '/alta', icon: ShieldCheck },
    { label: 'Amazon 商品查询', href: '/revcal', icon: Calculator },
  ] },
  { label: '文件处理', items: [
    { label: 'Excel 数据拆分', href: '/excel', icon: FileSpreadsheet },
    { label: 'UPS / DPD', href: '/ups-dpd', icon: Package },
  ] },
  { label: '效率工具', items: [
    { label: '系统工具', href: '/system-tools', icon: Wrench },
    { label: 'Todo 清单', href: '/todo', icon: CheckCheck },
  ] },
];

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const [updateOpen, setUpdateOpen] = useState(false);
  return (
    <aside className={['lt-sidebar', collapsed ? 'lt-sidebar--collapsed' : ''].join(' ')} aria-label="主导航">
      <div className="lt-brand">
        <NavLink to="/" end className="lt-brand-link" onClick={onNavigate} title="Liao Tools 工作台">
          <span className="lt-brand-symbol">L</span>
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
              <NavLink key={item.href} to={item.href} end={'end' in item ? item.end : false}
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
          <NavLink to="/tax?tab=update" onClick={onNavigate} className="lt-nav-item"
            title={collapsed ? '数据维护' : undefined}><Database size={18}/>{!collapsed && '数据维护'}</NavLink>
          <NavLink to="/settings" onClick={onNavigate}
            className={({ isActive }) => ['lt-nav-item', isActive ? 'is-active' : ''].join(' ')}
            title={collapsed ? '偏好设置' : undefined}><Settings size={18}/>{!collapsed && '偏好设置'}</NavLink>
        </div>
      </nav>
      <div className="lt-sidebar-footer">
        {!collapsed && <div className="lt-footer-note"><span className="lt-footer-dot"/> 本地优先 · 桌面工具集</div>}
        <button className="lt-footer-update" type="button" onClick={() => setUpdateOpen(true)}
          title="检查应用更新"><span>↻</span>{!collapsed && '检查应用更新'}</button>
      </div>
      <UpdateDialog open={updateOpen} onOpenChange={setUpdateOpen}/>
    </aside>
  );
}
