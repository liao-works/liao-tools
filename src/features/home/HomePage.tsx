import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  ArrowRight, Search, ShieldCheck, Boxes, FileSpreadsheet,
  Wrench, CheckCheck, Languages, Database, Clock3, ArrowUpRight, BookOpen, Info, PackageSearch,
} from 'lucide-react';
import { taxApi } from '@/lib/api/tax';
import { altaApi } from '@/lib/api/alta';
import { HomeTodoCalendar } from '@/features/todo/components/HomeTodoCalendar';
import { RecentTranslations } from '@/features/translate/components/RecentTranslations';

const tools = [
  { name: '关税查询', text: '查询 GB / NI 税率与来源状态', to: '/tax', icon: Search, accent: 'orange' },
  { name: 'Alta 禁运查询', text: '查看限制条目及适用例外', to: '/alta', icon: ShieldCheck, accent: 'blue' },
  { name: 'Amazon 商品查询', text: '商品价格、尺寸与重量信息', to: '/revcal', icon: Boxes, accent: 'blue' },
  { name: 'Excel 数据拆分', text: '海铁、空运表格处理', to: '/excel', icon: FileSpreadsheet, accent: 'green' },
  { name: '系统工具', text: '快速启动常用应用', to: '/system-tools', icon: Wrench, accent: 'green' },
  { name: 'Todo 清单', text: '记录与整理待办任务', to: '/todo', icon: CheckCheck, accent: 'amber' },
  { name: '翻译', text: '邮件翻译、润色与语气解读', to: '/translate', icon: Languages, accent: 'blue' },
  { name: '体积 / 计费重', text: 'CBM、体积重与装柜试算', to: '/cbm', icon: Boxes, accent: 'green' },
  { name: '运单轨迹', text: '批量轨迹查询与预计送达', to: '/tracking', icon: PackageSearch, accent: 'orange' },
];

type Snapshot = { kind: 'loading' | 'ready' | 'unavailable'; label: string };

export function HomePage() {
  const [tax, setTax] = useState<Snapshot>({ kind: 'loading', label: '正在读取本地数据…' });
  const [alta, setAlta] = useState<Snapshot>({ kind: 'loading', label: '正在读取本地数据…' });

  useEffect(() => {
    let alive = true;
    void taxApi.getLocalVersion()
      .then(info => { if (alive) setTax(info.records > 0
        ? { kind: 'ready', label: `${info.records.toLocaleString()} 条 · ${info.version}` }
        : { kind: 'unavailable', label: '尚未安装关税数据' }); })
      .catch(() => { if (alive) setTax({ kind: 'unavailable', label: '本地数据暂不可读取' }); });
    void altaApi.getDatabaseInfo()
      .then(info => { if (alive) setAlta(info.total_items > 0
        ? { kind: 'ready', label: `${info.total_items.toLocaleString()} 条禁运条目` }
        : { kind: 'unavailable', label: '禁运数据库为空' }); })
      .catch(() => { if (alive) setAlta({ kind: 'unavailable', label: '本地数据暂不可读取' }); });
    return () => { alive = false; };
  }, []);

  return <div className="lt-home lt-home--polished lt-home--with-rail">
    <section className="lt-hero lt-hero--editorial" aria-labelledby="welcome-title">
      <div className="lt-hero-copy">
        <span className="lt-kicker">WELCOME TO LIAO TOOLS</span>
        <h1 id="welcome-title"><span className="lt-hero-title-lead">让跨境贸易</span><span className="lt-hero-title-middle">数据处理</span><span className="lt-hero-title-emphasis">更简单</span></h1>
        <p>从关税查询到 Excel 数据处理，从商品信息到物流核对。让常用工具更顺手，专注完成当前工作。</p>
        <div className="lt-hero-actions">
          <Link className="lt-primary-link" to="/tax"><Search size={17}/> 开始查询 <ArrowRight size={16}/></Link>
          <Link className="lt-secondary-link" to="/excel"><BookOpen size={17}/> 处理 Excel</Link>
        </div>
      </div>
      <img className="lt-hero-art" src="/illustrations/trade-hero.svg"
        alt="集装箱、海关单据和关税检索放大镜的原创插画"/>
    </section>

    <section className="lt-home-section" aria-labelledby="tools-title">
      <div className="lt-section-heading">
        <div><h2 id="tools-title">快速开始 · 常用工具</h2><p>选择一个工具，直接进入工作流程</p></div>
        <span className="lt-section-count">7 个核心工具</span>
      </div>
      <div className="lt-tools-grid lt-tools-grid--balanced">
        {tools.map(({ name, text, to, icon: Icon, accent }) =>
          <Link key={to} to={to} className="lt-tool-tile">
            <span className={`lt-tool-icon lt-tool-icon--${accent}`}><Icon size={22} strokeWidth={1.85}/></span>
            <span className="lt-tool-info"><strong>{name}</strong><small>{text}</small></span>
            <ArrowRight size={16} className="lt-tool-arrow" aria-hidden="true"/>
          </Link>)}
      </div>
    </section>

    <aside className="lt-home-rail">
      <HomeTodoCalendar />
      <RecentTranslations />
    </aside>

    <div className="lt-home-bottom">
      <section className="lt-home-panel">
        <div className="lt-panel-heading"><div><Clock3 size={18}/><h2>常用操作</h2></div><span className="lt-muted-caption">按任务快速开始</span></div>
        <div className="lt-workflow-list">
          <Link to="/tax?tab=batch" className="lt-workflow-item">
            <span className="lt-workflow-glyph"><FileSpreadsheet size={18}/></span>
            <span><strong>批量税率查询</strong><small>导入 Excel，生成包含状态的查询结果</small></span>
            <ArrowUpRight size={16}/>
          </Link>
          <Link to="/alta?tab=batch" className="lt-workflow-item">
            <span className="lt-workflow-glyph"><ShieldCheck size={18}/></span>
            <span><strong>批量禁运筛查</strong><small>检查编码命中及限制条目</small></span>
            <ArrowUpRight size={16}/>
          </Link>
        </div>
      </section>
      <section className="lt-home-panel">
        <div className="lt-panel-heading"><div><Database size={18}/><h2>本地数据</h2></div>
          <Link to="/tax?tab=update">数据维护 <ArrowRight size={15}/></Link>
        </div>
        <div className="lt-database-list">
          <div className="lt-database-row">
            <span className="lt-database-icon"><Database size={20}/></span>
            <div><strong>英国 / 北爱关税库</strong><p>{tax.label}</p></div>
            <span className={`lt-data-indicator lt-data-indicator--${tax.kind}`}>{tax.kind === 'ready' ? '本地可用' : tax.kind === 'loading' ? '读取中' : '需检查'}</span>
          </div>
          <div className="lt-database-row">
            <span className="lt-database-icon"><ShieldCheck size={20}/></span>
            <div><strong>Alta 禁运数据库</strong><p>{alta.label}</p></div>
            <span className={`lt-data-indicator lt-data-indicator--${alta.kind}`}>{alta.kind === 'ready' ? '本地可用' : alta.kind === 'loading' ? '读取中' : '需检查'}</span>
          </div>
        </div>
        <div className="lt-data-hint"><Info size={15} aria-hidden="true"/>
          <span>数据可用不代表已经完成最新法规核验。涉及实际申报时，请检查查询结果的来源与状态。</span>
        </div>
      </section>
    </div>
  </div>;
}
