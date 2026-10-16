import { Copy, ExternalLink, RefreshCw, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { displayedRate, displayedRateStatus, rateNeedsAttention } from '@/lib/tariff-display';
import type { TaxTariff } from '@/types';
import { Button } from '@/components/ui/button';

interface Props {
  tariff: TaxTariff;
  onCopy: (value: string) => void;
  onOpenSource: (url: string) => Promise<void>;
  onCompare: (tariff: TaxTariff) => Promise<void>;
  comparing: boolean;
}


export function TaxResultDetail({ tariff, onCopy, onOpenSource, onCompare, comparing }: Props) {
  const needsReview =
    rateNeedsAttention(tariff.rate, tariff.uk_rate_status) ||
    rateNeedsAttention(tariff.north_ireland_rate || tariff.northIrelandRate, tariff.ni_rate_status);
  type TradeRemedyDetail = {
    region: 'GB' | 'XI'; type: 'anti_dumping' | 'countervailing';
    measure_type: string; geography: string; expression: string;
    additional_code: string; additional_description: string;
    conditions: string; effective_start: string; effective_end: string;
  };
  let remedies: TradeRemedyDetail[] = [];
  try {
    const parsed: unknown = JSON.parse(tariff.trade_remedy_details || '[]');
    if (Array.isArray(parsed)) {
      remedies = parsed.filter((item): item is TradeRemedyDetail =>
        !!item && typeof item === 'object' &&
        (item.region === 'GB' || item.region === 'XI') &&
        (item.type === 'anti_dumping' || item.type === 'countervailing')
      );
    }
  } catch {
    // Old database metadata has no detail column. The summary remains usable.
  }
  const sources = [
    { name: '英国税率来源', url: tariff.url, rate: tariff.rate, status: tariff.uk_rate_status,
      version: tariff.uk_source_version, verified: tariff.uk_verified_at },
    { name: '北爱尔兰税率来源', url: tariff.north_ireland_url || tariff.northIrelandUrl || '',
      rate: tariff.north_ireland_rate || tariff.northIrelandRate, status: tariff.ni_rate_status, version: tariff.ni_source_version, verified: tariff.ni_verified_at },
  ];

  return <div className="lt-tax-result-detail">
    {needsReview && <div className="lt-tax-result-notice" role="status">
      <AlertTriangle size={18} aria-hidden="true"/>
      <span>本地税率存在明确标识的条件或历史数据，使用前请核对相关来源。</span>
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
          <div><dt>英国普通第三国税率</dt><dd>{displayedRate(tariff.rate)}</dd></div>
          <div><dt>北爱尔兰普通第三国税率</dt><dd>{displayedRate(tariff.north_ireland_rate || tariff.northIrelandRate)}</dd></div>
          <div><dt>最后记录日期</dt><dd>{tariff.last_updated || '未记录'}</dd></div>
        </dl>
        <p className="lt-tax-facts-warning">显示的是本地普通第三国税率。空值表示暂无可显示的普通税率，不表示 0%，特殊用途和优惠税率需另行确认。</p>
        <Button variant="outline" disabled={comparing} onClick={() => {void onCompare(tariff);}}>
          {comparing ? <Loader2 size={16} className="mr-2 animate-spin"/> : <RefreshCw size={16} className="mr-2"/>}
          网页临时比对（不修改数据库）
        </Button>
      </section>
      {remedies.length > 0 && <section className="lt-tax-facts" aria-labelledby="lt-remedies-heading">
        <div className="lt-tax-panel-heading">
          <div>
            <span className="lt-kicker">CHINA TRADE REMEDIES</span>
            <h3 id="lt-remedies-heading">中国原产 · 反倾销和反补贴措施</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          附加税与普通进口关税分开计算。不同生产商、附加代码和条件可能有不同税率，
          请按实际生产商选择，不能把“其他企业”的税率套用到所有企业。
        </p>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {remedies.map((r, index) => <div key={index} className="rounded-lg border p-3 text-sm space-y-1">
            <div className="font-medium">
              {r.region} · {r.type === 'anti_dumping' ? '反倾销' : '反补贴'}
              {r.measure_type === '551' || r.measure_type === '553' ? '（临时）' : '（最终）'}
              {' · '}{r.expression || '税率需查看官方条件'}
            </div>
            {r.additional_code && <div>附加代码：<span className="font-mono">{r.additional_code}</span>
              {r.additional_description && <> · {r.additional_description}</>}</div>}
            {r.conditions && <div>适用条件：{r.conditions}</div>}
            <div className="text-muted-foreground">
              {r.effective_start ? `生效：${r.effective_start}` : '生效日期未记录'}
              {r.effective_end ? ` · 截止：${r.effective_end}` : ''}
              {' · '}中国适用范围：{r.geography === 'CN' ? '中国' : '包括中国的所有国家'}
            </div>
          </div>)}
        </div>
      </section>}
      <aside className="lt-tax-sources" aria-labelledby="lt-tax-sources-title">
        <div className="lt-tax-panel-heading">
          <div><span className="lt-kicker">EVIDENCE</span><h3 id="lt-tax-sources-title">来源与核验</h3></div>
          <ShieldCheck size={21} className="text-muted-foreground" aria-hidden="true"/>
        </div>
        <p>仅展示已保存的实际来源。没有核验状态时不推断数据过期或不可信。</p>
        {sources.map(source => <div className="lt-tax-source-item" key={source.name}>
          <div className="lt-tax-source-title"><strong>{source.name}</strong>
            {displayedRateStatus(source.rate, source.status) && <span className="needs-review">
              {displayedRateStatus(source.rate, source.status)}
            </span>}
          </div>
          <div className="lt-tax-source-meta">来源版本：{source.version || '—'}</div>
          <div className="lt-tax-source-meta">核验时间：{source.verified || '—'}</div>
          {source.url ? <button type="button" className="lt-tax-source-link"
            onClick={() => {void onOpenSource(source.url);}}>
            打开来源页面 <ExternalLink size={14}/></button> :
            <span className="lt-tax-source-meta">暂无来源链接</span>}
        </div>)}
      </aside>
    </div>
  </div>;
}
