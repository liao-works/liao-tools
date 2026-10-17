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
    measure_type: string; geography: string; geography_description?: string; expression: string;
    enterprise_rates?: Array<{
      region: 'GB' | 'XI'; type: 'anti_dumping' | 'countervailing'; measure_type: string;
      enterprise: string; enterprise_description?: string;
      additional_code: string; additional_code_resolved: boolean;
      other_enterprises: boolean; expression: string;
      expression_origin: 'measure' | 'condition' | 'unavailable';
      condition?: string; condition_id?: string; condition_code?: string;
      certificate_code?: string; certificate_description?: string;
      action_code?: string; action?: string; condition_group_ids?: string[];
      condition_required?: boolean; effective_status?: 'active' | 'expired' | 'future' | 'unknown';
      applicability?: string; source_id?: string;
      selection_status?: 'exact_official_expression' | 'requires_condition' |
        'expression_unavailable' | 'unresolved_applicability' | 'enterprise_or_condition_unresolved';
    }>;
    additional_code: string; additional_description: string; additional_code_ids?: string[];
    conditions: string; effective_start: string; effective_end: string;
    effective_status?: 'active' | 'expired' | 'future' | 'unknown';
    applicability?: string; unresolved_exclusion?: boolean; source_id?: string;
    expression_resolution?: 'source_value' | 'source_scalar' | 'resolved_single' | 'linked_but_empty' | 'unresolved_link' | 'multiple' | 'source_blank' | 'missing';
    expression_options?: Array<{ id: string; type: string; expression: string; resolved: boolean; link_resolved?: boolean }>;
    condition_details?: Array<{
      id: string; resolved: boolean; condition_code?: string; condition?: string;
      action_code?: string; action?: string; certificate_code?: string; certificate_description?: string;
      duty_expression?: string; condition_duty_amount?: string; condition_monetary_unit_code?: string;
      condition_measurement_unit_code?: string; condition_measurement_unit_qualifier_code?: string;
      requirement?: string; group_ids?: string[];
    }>;
    condition_rates?: Array<{
      condition_id: string; group_ids?: string[]; condition_code?: string; condition?: string;
      action_code?: string; action?: string; certificate_code?: string; certificate_description?: string;
      expression: string; requirement?: string;
    }>;
    condition_groups?: Array<{ id: string; resolved: boolean; condition_code?: string; condition_ids: string[] }>;
    footnotes?: string; footnote_ids?: string[]; regulation_id?: string; regulation_url?: string;
    legal_acts?: Array<{ id: string; regulation_id: string; regulation_url: string; description?: string; resolved: boolean }>;
    source_relationship_ids?: Record<string, string[]>;
    unresolved_relationships?: Array<{ relationship: string; id: string }>;
  };
  type RateOption = {
    region: 'GB' | 'XI'; measure_type: string; measure_type_description: string;
    geography: string; geography_description: string; expression: string;
    expression_available?: boolean; additional_code: string;
    additional_description: string; conditions: string; excluded_areas: string;
    effective_start: string; effective_end: string; source_id: string;
    quota_order_number?: string; footnotes?: string; regulation_id?: string;
    source_relationship_ids?: Record<string, string[]>;
    expression_options?: Array<{ id: string; type: string; expression: string; resolved: boolean; link_resolved?: boolean }>;
    expression_count?: number;
    expression_resolution?: 'resolved_single' | 'source_scalar' | 'multiple' | 'unresolved_link' | 'linked_but_empty' | 'source_blank' | 'missing';
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
        {remedies.some(r => (r.enterprise_rates?.length || 0) > 0) && <div className="mb-4">
          <h4 className="font-medium mb-2">企业／出口商对应税率</h4>
          <p className="text-sm text-muted-foreground mb-2">
            按官方附加代码区分具体企业与 Other（其他企业），分别列出反倾销、反补贴税率。
            同一企业若有多条条件税率会逐条列出；此表是官方措施记录，不是自动算出的应缴税额。
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th scope="col" className="px-3 py-2">地区／税种</th>
                  <th scope="col" className="px-3 py-2">企业／出口商</th>
                  <th scope="col" className="px-3 py-2">附加代码</th>
                  <th scope="col" className="px-3 py-2">税率</th>
                  <th scope="col" className="px-3 py-2">适用条件</th>
                  <th scope="col" className="px-3 py-2">生效状态</th>
                </tr>
              </thead>
              <tbody>
                {remedies.flatMap((r, remedyIndex) =>
                  (r.enterprise_rates || []).map((entry, entryIndex) => (
                    <tr key={`${remedyIndex}-${entryIndex}`} className="border-b align-top last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {entry.region === 'GB' ? '英国' : '北爱尔兰'} ·
                        {entry.type === 'anti_dumping' ? '反倾销' : '反补贴'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{entry.enterprise || '官方未提供企业名称'}</span>
                        {entry.other_enterprises && <span className="block text-muted-foreground">其他企业税率，非所有企业统一税率</span>}
                        {!entry.additional_code_resolved && <span className="block text-amber-700">企业与税率关联需确认</span>}
                      </td>
                      <td className="px-3 py-2 font-mono">{entry.additional_code || '—'}</td>
                      <td className="px-3 py-2 font-medium">
                        {entry.expression || '官方未提供独立税率'}
                        {entry.expression_origin === 'condition' && <span className="block text-muted-foreground font-normal">条件税率</span>}
                      </td>
                      <td className="px-3 py-2">
                        {entry.certificate_code ? '凭证 ' + entry.certificate_code : ''}
                        {entry.certificate_description ? ' · ' + entry.certificate_description : ''}
                        {entry.condition_code ? ' · 条件 ' + entry.condition_code : ''}
                        {entry.condition ? ' · ' + entry.condition : ''}
                        {entry.action ? ' · ' + entry.action : ''}
                        {entry.condition_group_ids?.length ? ' · 条件组 ' + entry.condition_group_ids.join(', ') : ''}
                        {entry.selection_status === 'unresolved_applicability' && <span className="block text-amber-700">对中国的适用性尚未解析</span>}
                        {entry.selection_status === 'enterprise_or_condition_unresolved' && <span className="block text-amber-700">不能自动绑定到单一企业</span>}
                        {entry.condition_required && !(entry.condition || entry.certificate_code || entry.condition_code) && <span>存在官方适用条件，详见下方</span>}
                        {!entry.condition_required && !entry.condition && !entry.certificate_code ? '无附加条件记录' : ''}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{effectiveStatusLabel(entry.effective_status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>}
        {remedies.length > 0 && !remedies.some(r => (r.enterprise_rates?.length || 0) > 0) &&
          <p className="text-sm text-muted-foreground mb-3">当前本地税率数据库尚未提供企业与税率对应表；请更新关税数据。下方仍可查看已保存的官方措施。</p>}
        <div className="max-h-80 overflow-y-auto space-y-2">
          {remedies.map((r, index) => <div key={index} className="rounded-lg border p-3 text-sm space-y-2">
            <div className="font-medium">
              {r.region} · {r.type === 'anti_dumping' ? '反倾销' : '反补贴'}
              {r.measure_type === '551' || r.measure_type === '553' ? '（临时）' : '（最终）'}
              {' · '}{r.expression || (r.condition_rates && r.condition_rates.length > 0
                ? '主税率表达式为空；条件税率见下方'
                : r.expression_resolution === 'linked_but_empty'
                  ? '官方关联税率表达式为空'
                  : r.expression_resolution === 'unresolved_link'
                    ? '官方税率关联未解析'
                    : r.expression_resolution === 'multiple'
                      ? '存在多个官方税率表达式'
                      : r.region === 'GB' && r.expression_resolution === 'source_blank'
                        ? 'GB 条件税率表达式尚未采集到（不表示 0%）'
                        : '官方原始措施未提供税率表达式（不表示 0%）')}
              {' · '}{effectiveStatusLabel(r.effective_status)}
            </div>
            {r.applicability === 'unresolved' && <div className="text-amber-700">
              官方排除地区关联未完全解析；本条不计入汇总税率，请核对原始措施。
            </div>}
            {r.additional_code && <div>附加代码：<span className="font-mono">{r.additional_code}</span>
              {r.additional_description && <> · {r.additional_description}</>}</div>}
            {r.conditions && <div>适用条件：{r.conditions}</div>}
            {r.condition_rates && r.condition_rates.length > 0 && <div>
              <strong>条件税率表达式</strong>
              <ul className="list-disc pl-5">
                {r.condition_rates.map((rate, rateIndex) => <li key={rate.condition_id || rateIndex}>
                  {rate.expression}
                  {rate.condition_code ? ' · 条件 ' + rate.condition_code : ''}
                  {rate.certificate_code ? ' · 凭证 ' + rate.certificate_code : ''}
                  {rate.certificate_description ? ' · ' + rate.certificate_description : ''}
                  {rate.action ? ' · ' + rate.action : ''}
                  {rate.requirement ? ' · ' + rate.requirement : ''}
                  {rate.group_ids && rate.group_ids.length > 0 ? ' · 条件组 ' + rate.group_ids.join(', ') : ''}
                </li>)}
              </ul>
            </div>}
            {r.condition_details && r.condition_details.length > 0 && <details>
              <summary className="cursor-pointer">官方条件明细（{r.condition_details.length}）</summary>
              <ul className="list-disc pl-5 mt-1">
                {r.condition_details.map((condition, conditionIndex) => <li key={condition.id || conditionIndex}>
                  {condition.condition_code ? '条件 ' + condition.condition_code + '：' : ''}
                  {condition.condition || '官方未提供条件描述'}
                  {condition.duty_expression ? ' · 税率 ' + condition.duty_expression : ' · 此条件没有单独的税率表达式'}
                  {condition.certificate_code ? ' · 凭证 ' + condition.certificate_code : ''}
                  {condition.certificate_description ? ' · ' + condition.certificate_description : ''}
                  {condition.action ? ' · ' + condition.action : ''}
                  {condition.requirement ? ' · ' + condition.requirement : ''}
                  {condition.group_ids && condition.group_ids.length > 0 ? ' · 条件组 ' + condition.group_ids.join(', ') : ''}
                  {!condition.resolved ? ' · 官方条件关联未解析' : ''}
                </li>)}
              </ul>
            </details>}
            {r.expression_options && r.expression_options.length > 0 &&
              r.expression_resolution !== 'resolved_single' && r.expression_resolution !== 'source_scalar' && <div>
                <strong>主税率表达式关联</strong>
                <ul className="list-disc pl-5">
                  {r.expression_options.map((option, optionIndex) => <li key={option.id || optionIndex}>
                    {option.expression || '表达式为空或未解析'}{option.id ? ' · ' + option.id : ''}
                    {!option.resolved ? ' · 未解析' : ''}
                  </li>)}
                </ul>
            </div>}
            {r.regulation_id && <div>法规编号：{r.regulation_id}</div>}
            {r.regulation_url && <div className="flex flex-wrap gap-2">
              {r.regulation_url.split('|').filter(Boolean).map((url, urlIndex) =>
                <button key={url + urlIndex} type="button" className="lt-tax-source-link"
                  onClick={() => { void onOpenSource(url); }}>
                  查看官方法规 <ExternalLink size={13}/>
                </button>)}
            </div>}
            {r.footnotes && <div>官方脚注：{r.footnotes}</div>}
            {r.source_id && <div className="text-muted-foreground">来源措施 ID：{r.source_id}</div>}
            {r.unresolved_relationships && r.unresolved_relationships.length > 0 && <div className="text-amber-700">
              官方关联记录未能解析：
              {r.unresolved_relationships.map((item, unresolvedIndex) =>
                <span key={item.relationship + item.id + unresolvedIndex}>
                  {unresolvedIndex ? '；' : ' '}{item.relationship} / {item.id || '无编号'}
                </span>)}
            </div>}
            {r.source_relationship_ids && Object.entries(r.source_relationship_ids).some(([, ids]) => ids.length > 0) &&
              <details className="text-muted-foreground">
                <summary className="cursor-pointer">官方关联记录编号</summary>
                {Object.entries(r.source_relationship_ids).filter(([, ids]) => ids.length > 0).map(([name, ids]) =>
                  <div key={name}>{name}：{ids.join(', ')}</div>)}
              </details>}
            <div className="text-muted-foreground">
              {r.effective_start ? '生效：' + r.effective_start : '生效日期未记录'}
              {r.effective_end ? ' · 截止：' + r.effective_end : ''}
              {' · '}适用范围：{r.applicability === 'unresolved'
                ? '适用性未完全解析（不计入汇总）'
                : (r.geography_description || (r.geography === 'CN' ? '中国' : '包括中国的所有国家'))}
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
