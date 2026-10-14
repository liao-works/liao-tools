import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowRight, Search, ShieldCheck, Calculator, FileSpreadsheet, Package, Wrench, CheckCheck, Database, Clock3 } from 'lucide-react';
import { taxApi } from '@/lib/api/tax';
import { altaApi } from '@/lib/api/alta';

const features = [
  { name: '关税查询', text:'查询英国与北爱税率、来源与核验状态', href:'/tax', Icon: Search, accent:'orange' },
  { name: 'Alta 禁运查询', text:'匹配禁运清单，识别条目与例外', href:'/alta', Icon: ShieldCheck, accent:'blue' },
  { name: 'Amazon 商品查询', text:'查询商品尺寸、重量及价格信息', href:'/revcal', Icon: Calculator, accent:'blue' },
  { name: 'Excel 数据拆分', text:'海铁 / 空运合并单元格与重量分配', href:'/excel', Icon: FileSpreadsheet, accent:'green' },
  { name: 'UPS / DPD 处理', text:'物流总结单与预报模板填充', href:'/ups-dpd', Icon: Package, accent:'amber' },
  { name: '系统工具', text:'快速打开系统程序与自定义工具', href:'/system-tools', Icon: Wrench, accent:'green' },
  { name: 'Todo 清单', text:'记录任务，支持桌面小组件', href:'/todo', Icon: CheckCheck, accent:'amber' },
];

export function HomePage() {
  const [tax, setTax] = useState<{version:string;records:number}|null>(null);
  const [alta, setAlta] = useState<{total_items:number;last_update?:string}|null>(null);
  useEffect(() => {
    let alive = true;
    void taxApi.getLocalVersion().then(x => { if (alive) setTax(x); }).catch(() => {});
    void altaApi.getDatabaseInfo().then(x => { if (alive) setAlta(x); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <div className="lt-home">
      <section className="lt-hero">
        <div className="lt-hero-copy">
          <span className="lt-kicker">LIAO TOOLS · WORKSPACE</span>
          <h1>常用工具，<br/><span>顺手就好。</span></h1>
          <p>从海关编码查询到物流表格处理。专注当前任务，把复杂的操作留给工具。</p>
          <div className="lt-hero-actions">
            <Link className="lt-primary-link" to="/tax"><Search size={17}/> 开始查询 <ArrowRight size={16}/></Link>
            <Link className="lt-secondary-link" to="/excel"><FileSpreadsheet size={17}/> 处理文件</Link>
          </div>
        </div>
        <img className="lt-hero-art" src="/illustrations/trade-scene.svg" alt="集装箱、海关单证与放大镜的贸易工作插画"/>
      </section>

      <section className="lt-home-section" aria-labelledby="lt-tool-heading">
        <div className="lt-section-heading"><div><h2 id="lt-tool-heading">快速开始</h2><p>选择一个工具，直接进入工作</p></div><span>7 个常用工具</span></div>
        <div className="lt-tools-grid">
          {features.map(({ name, text, href, Icon, accent }) =>
            <Link className="lt-tool-tile" to={href} key={href}>
              <span className={['lt-tool-icon', 'lt-tool-icon--' + accent].join(' ')}><Icon size={21} strokeWidth={1.8}/></span>
              <span className="lt-tool-info"><strong>{name}</strong><small>{text}</small></span>
              <ArrowRight size={17} className="lt-tool-arrow"/>
            </Link>
          )}
        </div>
      </section>
      <div className="lt-home-bottom">
        <section className="lt-home-panel">
          <div className="lt-panel-heading"><div><Clock3 size={18}/><h2>使用建议</h2></div></div>
          <div className="lt-tip">
            <span className="lt-tip-number">01</span><div><strong>查询编码</strong><p>输入完整 10 位 HS Code，可分别查看英国与北爱税率和核验状态。</p></div>
            <Link to="/tax">开始 <ArrowRight size={15}/></Link>
          </div>
          <div className="lt-tip">
            <span className="lt-tip-number">02</span><div><strong>批量处理 Excel</strong><p>将需要查询的编码填写到模板，再由本地数据库批量处理。</p></div>
            <Link to="/tax?tab=batch">打开 <ArrowRight size={15}/></Link>
          </div>
          <div className="lt-tip">
            <span className="lt-tip-number">03</span><div><strong>物流文件转换</strong><p>选择 UPS / DPD 模板和源数据，生成可直接打开的结果文件。</p></div>
            <Link to="/ups-dpd">打开 <ArrowRight size={15}/></Link>
          </div>
        </section>
        <section className="lt-home-panel">
          <div className="lt-panel-heading"><div><Database size={18}/><h2>本地数据</h2></div><Link to="/tax?tab=update">数据维护 <ArrowRight size={15}/></Link></div>
          <div className="lt-database-row"><span className="lt-database-icon"><Database size={19}/></span>
            <div><strong>英国 / 北爱关税库</strong><p>{tax && tax.records > 0 ? tax.records.toLocaleString() + ' 条 · ' + tax.version : '尚未安装或无法读取本地数据'}</p></div>
            <Link to="/tax?tab=update">查看</Link>
          </div>
          <div className="lt-database-row"><span className="lt-database-icon"><ShieldCheck size={19}/></span>
            <div><strong>Alta 禁运数据库</strong><p>{alta && alta.total_items > 0 ? alta.total_items.toLocaleString() + ' 条匹配条目' : '尚未初始化或无法读取本地数据'}</p></div>
            <Link to="/alta?tab=manage">查看</Link>
          </div>
          <div className="lt-data-hint"><span>ⓘ</span> 本地数据可离线查询。税率是否适用于实际申报，仍需结合结果状态和官方来源判断。</div>
        </section>
      </div>
    </div>
  );
}
