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
    effective_status?: 'active' | 'expired' | 'future' | 'unknown';
  };
  type RateOption = {
    region: 'GB' | 'XI'; measure_type: string; measure_type_description: string;
    geography: string; geography_description: string; expression: string;
    expression_available?: boolean; additional_code: string;
    additional_description: string; conditions: string; excluded_areas: string;
    effective_start: string; effective_end: string; source_id: string;
    quota_order_number?: string; footnotes?: string; regulation_id?: string;
    source_relationship_ids?: Record<string, string[]>;
    expression_options?: Array<{ id: string; type: string; expression: string; resolved: boolean }>;
    expression_count?: number;
    expression_resolution?: 'resolved_single' | 'source_scalar' | 'multiple' | 'unresolved_link' | 'missing';
    single_expression_available?: boolean;
    unresolved_relationships?: Array<{ relationship: string; id: string }>;
    geography_ids?: string[];
    special_use?: boolean; conditional?: boolean; china_applicable?: boolean;
    applicability?: string;
    effective_status?: 'active' | 'expired' | 'future' | 'unknown';
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
  let rateOptions: RateOption[] = [];
  try {
    const parsed: unknown = JSON.parse(tariff.rate_options || '[]');
    if (Array.isArray(parsed)) {
      rateOptions = parsed.filter((item): item is RateOption =>
        !!item && typeof item === 'object' &&
        (item.region === 'GB' || item.region === 'XI') &&
        typeof item.measure_type === 'string' &&
        typeof item.expression === 'string'
      );
    }
  } catch {
    // Older databases have no rate_options column/data.
  }
  const conditionalOptions = rateOptions.filter(option =>
    option.china_applicable === true &&
    (option.applicability !== 'default' || !option.expression_available)
  );
  const effectiveStatusLabel = (status?: RateOption['effective_status']) => {
    if (status === 'active') return '当前有效';
    if (status === 'expired') return '已过期';
    if (status === 'future') return '尚未生效';
    return '生效日期不明确';
  };

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
      {conditionalOptions.length > 0 && <section className="lt-tax-facts" aria-labelledby="lt-rate-options-heading">
        <div className="lt-tax-panel-heading">
          <div>
            <span className="lt-kicker">OFFICIAL DUTY MEASURES</span>
            <h3 id="lt-rate-options-heading">条件税率与其他官方措施</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          保留明确适用于中国或 Erga Omnes 的官方措施，包括条件税率、特殊用途及其他税种措施；
          当前、过期、未来和生效日期不明的记录都会标注。只有可确定的无条件普通税率进入默认栏，
          其他税率不会被自动套用。反倾销和反补贴在下方独立列出。
        </p>
        <div className="max-h-96 overflow-y-auto space-y-2">
          {conditionalOptions.map((option, index) => <div key={index} className="rounded-lg border p-3 text-sm space-y-1">
            <div className="font-medium">
              {option.region} · {option.measure_type}
              {option.measure_type_description ? ' · ' + option.measure_type_description : ''}
              {' · '}{option.expression_resolution === 'multiple'
                ? `多个官方税率表达式（${option.expression_count || option.expression_options?.length || 0} 项）`
                : option.expression || (option.expression_resolution === 'unresolved_link'
                  ? '官方税率关联未解析' : '官方未提供税率表达式')}
              {' · '}{effectiveStatusLabel(option.effective_status)}
              {' · '}{option.applicability === 'unresolved' ? '关联信息未完全解析' : ''}
            </div>
            <div className="text-muted-foreground">
              适用范围：{option.geography_description || option.geography || '未提供'}
              {option.china_applicable ? ' · 中国原产可适用范围' : ''}
              {option.special_use ? ' · 特殊用途' : ''}
            </div>
            {option.expression_options && option.expression_options.length > 1 && <div>
              <strong>全部官方税率表达式</strong>
              <ul className="list-disc pl-5">
                {option.expression_options.map((item, expressionIndex) => <li key={item.id || expressionIndex}>
                  {item.expression || '表达式未解析'}{item.id ? ` · ${item.id}` : ''}
                  {!item.resolved ? ' · 未解析' : ''}
                </li>)}
              </ul>
            </div>}
            {option.unresolved_relationships && option.unresolved_relationships.length > 0 && <div className="text-amber-700">
              官方关联记录未能在当前快照中解析，不能把这条记录当作确定的默认税率：
              {option.unresolved_relationships.map((item, unresolvedIndex) =>
                <span key={item.relationship + item.id + unresolvedIndex}>
                  {unresolvedIndex ? '；' : ' '}{item.relationship} / {item.id || '无编号'}
                </span>)}
            </div>}
            {option.geography_ids && option.geography_ids.length > 1 &&
              <div>适用地理区域编码：{option.geography_ids.join(', ')}</div>}
            {option.additional_code && <div>附加代码：<span className="font-mono">{option.additional_code}</span>
              {option.additional_description ? <> · {option.additional_description}</> : ''}</div>}
            {option.conditions && <div>适用条件：{option.conditions}</div>}
            {option.excluded_areas && <div>排除地区：{option.excluded_areas}</div>}
            {option.quota_order_number && <div>配额订单号：{option.quota_order_number}</div>}
            {option.regulation_id && <div>法规编号：{option.regulation_id}</div>}
            {option.footnotes && <div>官方脚注：{option.footnotes}</div>}
            {option.source_relationship_ids && Object.entries(option.source_relationship_ids).some(([, ids]) => ids.length > 0) &&
              <details className="text-muted-foreground">
                <summary className="cursor-pointer">官方关联记录编号</summary>
                {Object.entries(option.source_relationship_ids).filter(([, ids]) => ids.length > 0).map(([name, ids]) =>
                  <div key={name}>{name}：{ids.join(', ')}</div>)}
              </details>}
            <div className="text-muted-foreground">
              {option.effective_start ? '生效：' + option.effective_start : '生效日期未记录'}
              {option.effective_end ? ' · 截止：' + option.effective_end : ''}
              {option.source_id ? ' · 来源措施：' + option.source_id : ''}
            </div>
          </div>)}
        </div>
      </section>}

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
              {' · '}{effectiveStatusLabel(r.effective_status)}
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
