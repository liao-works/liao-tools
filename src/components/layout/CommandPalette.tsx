import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUpRight, CornerDownLeft, X } from 'lucide-react';

const commands = [
  { label:'工作台', detail:'全部工具', path:'/', keywords:'首页 home' },
  { label:'英国 / 北爱关税查询', detail:'HS Code 单码与批量', path:'/tax', keywords:'tax tariff 税率 HS' },
  { label:'Alta 禁运查询', detail:'禁运条目及例外', path:'/alta', keywords:'禁止 出口 合规' },
  { label:'Amazon 商品查询', detail:'ASIN、尺寸与价格', path:'/revcal', keywords:'亚马逊 收益 计算器' },
  { label:'汇率查询', detail:'货币换算与人民币中间价', path:'/exchange', keywords:'汇率 exchange currency 美元 人民币 换算 中间价' },
  { label:'Excel 数据拆分', detail:'海铁、空运工作簿', path:'/excel', keywords:'表格 图片 合并单元格' },
  { label:'系统工具', detail:'常用及自定义程序', path:'/system-tools', keywords:'工具箱 launcher' },
  { label:'Todo 清单', detail:'待办与桌面小组件', path:'/todo', keywords:'task 任务' },
  { label:'文本处理', detail:'分割元素、尺寸合并与数字统计', path:'/text-tools', keywords:'文本 文本处理 text 格式化 cbm 尺寸' },
  { label:'数据维护', detail:'税率数据库与审计', path:'/tax?tab=update', keywords:'同步 更新 审计' },
  { label:'应用更新', detail:'检查版本、完整性验证、安装', path:'/updates', keywords:'升级 自动更新 release version' },
  { label:'偏好设置', detail:'主题与应用配置', path:'/settings', keywords:'settings 外观' },
];

interface CommandPaletteProps { open: boolean; onClose: () => void }
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const filtered = useMemo(() => commands.filter(item =>
    (item.label + ' ' + item.detail + ' ' + item.keywords).toLowerCase().includes(query.toLowerCase().trim())
  ), [query]);
  useEffect(() => { if (open) { setQuery(''); setActive(0); window.requestAnimationFrame(() => input.current?.focus()); } }, [open]);
  const go = (path: string) => { navigate(path); onClose(); };
  if (!open) return null;
  return (
    <div className="lt-command-backdrop" onMouseDown={onClose} role="presentation">
      <div className="lt-command-dialog" role="dialog" aria-modal="true" aria-label="快速打开工具"
        onMouseDown={event => event.stopPropagation()}>
        <div className="lt-command-input-wrap">
          <Search size={20} aria-hidden="true"/>
          <input ref={input} aria-label="搜索工具" placeholder="输入工具名称或关键词…" value={query}
            onChange={event => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={event => {
              if (event.key === 'Escape') { onClose(); return; }
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive(x => Math.min(x + 1, filtered.length - 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActive(x => Math.max(x - 1, 0)); }
              if (event.key === 'Enter' && filtered[active]) go(filtered[active].path);
            }}/>
          <button className="lt-icon-button" type="button" onClick={onClose} aria-label="关闭搜索"><X size={17}/></button>
        </div>
        <div className="lt-command-list" role="listbox">
          {filtered.length ? filtered.map((item, index) => (
            <button key={item.path} type="button" role="option" aria-selected={active === index}
              className={['lt-command-result', active === index ? 'is-selected' : ''].join(' ')}
              onMouseEnter={() => setActive(index)} onClick={() => go(item.path)}>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              {active === index ? <CornerDownLeft size={16}/> : <ArrowUpRight size={16}/>}
            </button>
          )) : <div className="lt-command-empty">没有找到匹配的工具。试试“关税”、“Excel”或“系统”。</div>}
        </div>
        <div className="lt-command-help">↑ ↓ 选择 <span>Enter 打开</span> <span>Esc 关闭</span></div>
      </div>
    </div>
  );
}
