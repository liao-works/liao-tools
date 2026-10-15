import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Copy, ExternalLink, FileSearch, Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { taxApi } from '@/lib/api/tax';
import { parseHsCode, queryErrorMessage } from '@/lib/hs-code';
import type { TaxTariff } from '@/types';

type QueryState =
  | { kind: 'idle' }
  | { kind: 'loading'; step: 'search' | 'selection' }
  | { kind: 'candidates'; items: TaxTariff[] }
  | { kind: 'detail'; tariff: TaxTariff }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

type Mode = 'exact' | 'fuzzy';

function statusText(status?: string | null): string {
  if (status === 'verified') return '已核验';
  if (status === 'conditional') return '有适用条件';
  if (status === 'stale') return '旧缓存 · 未重新核验';
  if (status === 'pending') return '待核验';
  return '来源未核验';
}

function statusStyle(status?: string | null): string {
  if (status === 'verified') return 'text-success-subtle-fg bg-success-subtle';
  if (status === 'conditional' || status === 'stale') return 'text-warning-subtle-fg bg-warning-subtle';
  return 'text-muted-foreground bg-muted';
}

function RatePanel({
  title, rate, status, sourceVersion, verifiedAt, onCopy,
}: {
  title: string;
  rate: string | undefined;
  status: string | null | undefined;
  sourceVersion?: string | null;
  verifiedAt?: string | null;
  onCopy: (rate: string) => void;
}) {
  const shownRate = rate?.trim();
  const displayStatus = shownRate ? status : status === 'verified' ? 'pending' : status;
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground-emphasis">{title}</h3>
        <span className={'rounded-md px-2 py-1 text-xs font-medium ' + statusStyle(displayStatus)}>
          {statusText(displayStatus)}
        </span>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <span className="break-words text-2xl font-semibold tabular-nums text-foreground-emphasis">
          {shownRate || '待核验'}
        </span>
        {shownRate && (
          <Button type="button" variant="ghost" size="icon" title={'复制' + title + '原始税率'} onClick={() => onCopy(shownRate)}>
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
      {displayStatus === 'conditional' && <p className="mt-2 text-xs leading-5 text-warning-fg">该税率附带适用条件，不能作为无条件确定税率。</p>}
      {displayStatus === 'stale' && <p className="mt-2 text-xs leading-5 text-warning-fg">这是旧版缓存值，使用前请对照官方来源。</p>}
      {!shownRate && <p className="mt-2 text-xs text-muted-foreground">当前记录没有可直接展示的确定税率。</p>}
      <div className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <p>来源版本：{sourceVersion || '未提供'}</p>
        <p>核验时间：{verifiedAt || '未提供'}</p>
      </div>
    </section>
  );
}

interface Props {
  onSwitchToUpdate?: () => void;
}

export function SingleQueryTab({ onSwitchToUpdate }: Props) {
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<Mode>('exact');
  const [state, setState] = useState<QueryState>({ kind: 'idle' });
  const [inputError, setInputError] = useState('');
  const [dataState, setDataState] = useState<'checking' | 'ready' | 'missing' | 'unknown'>('checking');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const requestId = useRef(0);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    taxApi.checkDataExists()
      .then((exists) => { if (mounted) setDataState(exists ? 'ready' : 'missing'); })
      .catch(() => { if (mounted) setDataState('unknown'); });
    return () => { mounted = false; requestId.current += 1; };
  }, []);

  function changeQuery(value: string) {
    requestId.current += 1;
    setCode(value);
    setInputError('');
    setState({ kind: 'idle' });
  }

  function changeMode(next: Mode) {
    requestId.current += 1;
    setMode(next);
    setState({ kind: 'idle' });
    setInputError('');
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === 'loading') return;
    const parsed = parseHsCode(code, mode === 'exact' ? 10 : 4, 10);
    if (parsed.error) {
      setInputError(parsed.error);
      setState({ kind: 'idle' });
      return;
    }
    setInputError('');
    const current = ++requestId.current;
    setState({ kind: 'loading', step: 'search' });
    try {
      if (mode === 'exact') {
        const tariff = await taxApi.exactSearch(parsed.code);
        if (requestId.current !== current) return;
        setState(tariff ? { kind: 'detail', tariff } : { kind: 'empty' });
      } else {
        const items = await taxApi.fuzzySearch(parsed.code, 20);
        if (requestId.current !== current) return;
        setState(items.length ? { kind: 'candidates', items } : { kind: 'empty' });
      }
    } catch (error) {
      if (requestId.current === current) setState({ kind: 'error', message: queryErrorMessage(error) });
    }
  }

  async function selectCandidate(candidate: TaxTariff) {
    const current = ++requestId.current;
    setState({ kind: 'loading', step: 'selection' });
    try {
      // Candidate matching does not authorize copying another HS code's tax rate.
      const tariff = await taxApi.exactSearch(candidate.code);
      if (requestId.current !== current) return;
      setState(tariff ? { kind: 'detail', tariff } : { kind: 'empty' });
    } catch (error) {
      if (requestId.current === current) setState({ kind: 'error', message: queryErrorMessage(error) });
    }
  }

  async function copyRate(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: '税率原文已复制' });
    } catch (error) {
      toast({ title: '复制失败', description: queryErrorMessage(error), variant: 'destructive' });
    }
  }

  async function openSource(url: string) {
    try {
      await taxApi.openUrl(url);
    } catch (error) {
      toast({ title: '无法打开来源', description: queryErrorMessage(error), variant: 'destructive' });
    }
  }

  async function compareWithWebsite(tariff: TaxTariff) {
    setComparing(true);
    try {
      const result = await taxApi.updateSingleRow(tariff.code);
      toast({
        title: result.success ? '网页比对完成 · 正式库未修改' : '网页比对未完成',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
    } catch (error) {
      toast({ title: '网页比对失败', description: queryErrorMessage(error), variant: 'destructive' });
    } finally {
      setComparing(false);
    }
  }

  const selected = state.kind === 'detail' ? state.tariff : null;
  const niRate = selected?.north_ireland_rate ?? selected?.northIrelandRate;
  const niUrl = selected?.north_ireland_url ?? selected?.northIrelandUrl;
  const noData = dataState === 'missing';

  return (
    <div className="space-y-4">
      {noData && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning bg-warning-subtle p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-warning-fg" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-warning-subtle-fg">本地没有可查询的税率数据</p>
            <p className="mt-1 text-xs text-warning-fg">安装正式数据后可以离线查询；网络不可用不等于本地数据失效。</p>
          </div>
          {onSwitchToUpdate && <Button type="button" size="sm" variant="outline" onClick={onSwitchToUpdate}>前往数据更新</Button>}
        </div>
      )}

      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">HS 编码查询</CardTitle>
          <p className="text-xs text-muted-foreground">从本地关税库查询，同一记录分别展示英国（GB）和北爱尔兰（NI）字段。</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="查询方式">
            <Button type="button" size="sm" variant={mode === 'exact' ? 'default' : 'outline'} onClick={() => changeMode('exact')}>10 位精确查询</Button>
            <Button type="button" size="sm" variant={mode === 'fuzzy' ? 'default' : 'outline'} onClick={() => changeMode('fuzzy')}>模糊查找编码</Button>
          </div>
          <form onSubmit={(event) => void search(event)} className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <label htmlFor="tax-code" className="sr-only">HS 编码</label>
              <Input
                id="tax-code"
                value={code}
                onChange={(event) => changeQuery(event.target.value)}
                placeholder={mode === 'exact' ? '输入 10 位编码，如 0101210000' : '输入 4–10 位编码查找候选'}
                aria-invalid={!!inputError}
                aria-describedby={inputError ? 'tax-code-error' : undefined}
                className="h-10 font-mono"
              />
              {inputError && <p id="tax-code-error" role="alert" className="mt-1.5 text-xs text-danger-fg">{inputError}</p>}
            </div>
            <Button className="h-10 shrink-0" type="submit" disabled={state.kind === 'loading' || noData}>
              {state.kind === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {state.kind === 'loading' ? '查询中' : '查询'}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            {mode === 'fuzzy' ? '模糊查找仅用于选择编码，候选记录不能直接用于税率确认。' : '允许粘贴带空格或连字符的编码，不自动补零。'}
          </p>
        </CardContent>
      </Card>

      {state.kind === 'idle' && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <FileSearch className="mx-auto mb-3 h-6 w-6" aria-hidden="true" />
          输入 HS 编码后开始查询
        </div>
      )}
      {state.kind === 'loading' && <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{state.step === 'selection' ? '正在读取选中编码的准确记录…' : '正在读取本地记录…'}</p>}
      {state.kind === 'empty' && (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="font-medium">没有找到匹配记录</p>
          <p className="mt-2 text-sm text-muted-foreground">请检查编码，或切换到模糊查找选择候选编码。</p>
        </div>
      )}
      {state.kind === 'error' && (
        <div role="alert" className="rounded-xl border border-danger bg-danger-subtle p-5">
          <p className="font-medium text-danger-subtle-fg">查询失败</p>
          <p className="mt-1 break-words text-sm text-danger-fg">{state.message}</p>
          <p className="mt-2 text-xs text-muted-foreground">错误不是“未命中”，本地数据库状态请在数据更新中查看。</p>
        </div>
      )}
      {state.kind === 'candidates' && (
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">选择准确的商品编码</CardTitle>
            <p className="text-xs text-warning-fg">以下是相似编码候选，不代表税率相同。选择一项后会执行该编码的精确查询。</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {state.items.map((item, index) => (
              <button key={item.code + '-' + index} type="button" onClick={() => void selectCandidate(item)}
                className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-semibold text-foreground-emphasis">{item.code}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description || '暂无商品描述'}</span>
                </span>
                {typeof item.similarity === 'number' && <span className="text-xs tabular-nums text-muted-foreground">{(item.similarity * 100).toFixed(1)}%</span>}
                <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {selected && (
        <div className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-5">
              <div>
                <div className="text-xs text-muted-foreground">已查询的准确编码</div>
                <h3 className="mt-1 font-mono text-xl font-semibold tracking-wide text-foreground-emphasis">{selected.code}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.description || '暂无商品描述'}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setSourceOpen(true)}>
                <FileSearch className="h-4 w-4" /> 来源与核验详情
              </Button>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <RatePanel title="英国 · GB" rate={selected.rate} status={selected.uk_rate_status}
              sourceVersion={selected.uk_source_version} verifiedAt={selected.uk_verified_at} onCopy={(value) => void copyRate(value)} />
            <RatePanel title="北爱尔兰 · NI" rate={niRate} status={selected.ni_rate_status}
              sourceVersion={selected.ni_source_version} verifiedAt={selected.ni_verified_at} onCopy={(value) => void copyRate(value)} />
          </div>
          <Card className="shadow-none">
            <CardContent className="space-y-3 pt-5 text-sm">
              <h3 className="font-semibold text-foreground-emphasis">其他税率字段</h3>
              {([
                ['反倾销税', selected.anti_dumping_rate],
                ['反补贴税', selected.countervailing_rate],
                ['其他税率', selected.other_rate],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="text-muted-foreground">{label}</span><span className="break-words text-right font-medium">{value || '未提供'}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={sourceOpen && !!selected} onOpenChange={setSourceOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>数据来源与核验</DialogTitle>
            <DialogDescription>编码 {selected?.code} 的英国和北爱记录分别有独立的核验状态。</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              {([
                { name: '英国 GB', rate: selected.rate, status: selected.uk_rate_status, version: selected.uk_source_version, verified: selected.uk_verified_at, url: selected.url },
                { name: '北爱 NI', rate: niRate, status: selected.ni_rate_status, version: selected.ni_source_version, verified: selected.ni_verified_at, url: niUrl },
              ]).map((entry) => (
                <section key={entry.name} className="rounded-lg border border-border p-4">
                  <h3 className="font-semibold">{entry.name} · {statusText(entry.status)}</h3>
                  <dl className="mt-3 grid grid-cols-[90px_1fr] gap-y-2 text-xs">
                    <dt className="text-muted-foreground">原始税率</dt><dd className="break-words">{entry.rate || '待核验'}</dd>
                    <dt className="text-muted-foreground">来源版本</dt><dd>{entry.version || '未提供'}</dd>
                    <dt className="text-muted-foreground">核验时间</dt><dd>{entry.verified || '未提供'}</dd>
                  </dl>
                  {entry.url && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void openSource(entry.url)}>
                    <ExternalLink className="h-3.5 w-3.5" /> 官方来源
                  </Button>}
                </section>
              ))}
              <div className="text-xs text-muted-foreground">本地记录更新时间：{selected.last_updated || '未提供'}</div>
              <div className="rounded-lg border border-warning bg-warning-subtle p-3 text-xs leading-5 text-warning-fg">
                {selected.uk_rate_status !== 'verified' || selected.ni_rate_status !== 'verified'
                  ? '记录可能包含待核验、条件或旧版字段。请根据各地区的来源与条件判断，不把旧缓存视为已核验。'
                  : '两地区均标记已核验；具体税率仍以官方适用条件和最新来源为准。'}
              </div>
              <Button type="button" variant="outline" disabled={comparing} onClick={() => void compareWithWebsite(selected)}>
                {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {comparing ? '比对中…' : '网页临时比对（不修改正式库）'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
