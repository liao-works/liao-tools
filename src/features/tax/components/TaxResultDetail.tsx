import { Copy, ExternalLink, RefreshCw, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { TaxTariff } from '@/types';
import { Button } from '@/components/ui/button';

interface Props {
  tariff: TaxTariff;
  onCopy: (value: string) => void;
  onOpenSource: (url: string) => Promise<void>;
  onCompare: (tariff: TaxTariff) => Promise<void>;
  comparing: boolean;
}

function statusText(status?: string | null) {
  if (status === 'verified') return '来源已核验';
  if (status === 'conditional') return '存在条件 · 需核对';
  if (status === 'stale') return '旧缓存 · 未核验';
  return '来源未经核验';
}

export function TaxResultDetail({ tariff, onCopy, onOpenSource, onCompare, comparing }: Props) {
  const needsReview = tariff.uk_rate_status !== 'verified' || tariff.ni_rate_status !== 'verified';
  const sources = [
    { name: '英国税率来源', url: tariff.url, status: tariff.uk_rate_status,
      version: tariff.uk_source_version, verified: tariff.uk_verified_at },
    { name: '北爱尔兰税率来源', url: tariff.north_ireland_url || tariff.northIrelandUrl || '',
      status: tariff.ni_rate_status, version: tariff.ni_source_version, verified: tariff.ni_verified_at },
  ];

  return <div className="lt-tax-result-detail">
    {needsReview && <div className="lt-tax-result-notice" role="status">
      <AlertTriangle size={18} aria-hidden="true"/>
      <span>此记录包含尚未完整核验的税率或条件项。如用于实际业务，请核对对应官方商品页面。</span>
    </div>}
    <div className="lt-tax-result-columns">
      <section className="lt-tax-facts">
        <div className="lt-tax-panel-heading">
          <div><span className="lt-kicker">COMMODITY DETAILS</span><h3>商品与税率详情</h3></div>
          <button type="button" className="lt-tax-text-action" onClick={() => onCopy(tariff.code)}>
            <Copy size={15}/>复制编码
          </button>
        </div>
        <dl>
          <div><dt>商品编码</dt><dd className="font-mono">{tariff.code}</dd></div>
          <div><dt>商品描述</dt><dd>{tariff.description || '本地记录未提供描述'}</dd></div>
          <div><dt>第三国税率字段</dt><dd>{tariff.other_rate || '本地记录未提供'}</dd></div>
          <div><dt>最后记录日期</dt><dd>{tariff.last_updated || '未记录'}</dd></div>
        </dl>
        <p className="lt-tax-facts-warning">反倾销或反补贴税率字段为空时，只表示本地记录未提供，不能视为官方确认没有相关措施。</p>
        <Button variant="outline" disabled={comparing} onClick={() => {void onCompare(tariff);}}>
          {comparing ? <Loader2 size={16} className="mr-2 animate-spin"/> : <RefreshCw size={16} className="mr-2"/>}
          网页临时比对（不修改数据库）
        </Button>
      </section>
      <aside className="lt-tax-sources" aria-labelledby="lt-tax-sources-title">
        <div className="lt-tax-panel-heading">
          <div><span className="lt-kicker">EVIDENCE</span><h3 id="lt-tax-sources-title">来源与核验</h3></div>
          <ShieldCheck size={21} className="text-muted-foreground" aria-hidden="true"/>
        </div>
        <p>仅显示本地记录中的实际来源信息，不自动推断核验结果。</p>
        {sources.map(source => <div className="lt-tax-source-item" key={source.name}>
          <div className="lt-tax-source-title"><strong>{source.name}</strong>
            <span className={source.status === 'verified' ? 'is-verified' : 'needs-review'}>{statusText(source.status)}</span>
          </div>
          <div className="lt-tax-source-meta">来源版本：{source.version || '未记录'}</div>
          <div className="lt-tax-source-meta">核验时间：{source.verified || '未记录'}</div>
          {source.url ? <button type="button" className="lt-tax-source-link"
            onClick={() => {void onOpenSource(source.url);}}>
            打开来源页面 <ExternalLink size={14}/></button> :
            <span className="lt-tax-source-meta">暂无来源链接</span>}
        </div>)}
      </aside>
    </div>
  </div>;
}
