import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Coins, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { TutorialLink } from '@/components/common/TutorialLink';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { exchangeApi } from '@/lib/api/exchange';
import type { CnParity, ExchangeRates } from '@/lib/api/exchange';
import {
  COMMON_CURRENCIES, convert, currencyMeta, displayUnit,
  formatRate, localToday, rateOf, SELECTABLE_CURRENCIES,
} from './exchange';

const SOURCE_LABELS: Record<string, string> = {
  'er-api': 'ExchangeRate-API',
  frankfurter: '欧央行 ECB',
  'currency-api': 'Currency API',
};

/** 中间价货币对 → 中文标签（USD/CNY → 美元，100JPY/CNY → 100 日元） */
function parityLabel(pair: string): string {
  const [foreign] = pair.split('/');
  const unitMatch = foreign.match(/^(\d+)([A-Z]{3})$/);
  if (unitMatch) {
    return `${unitMatch[1]} ${currencyMeta(unitMatch[2]).name}`;
  }
  return currencyMeta(foreign).name;
}

export function ExchangePage() {
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [parity, setParity] = useState<CnParity | null>(null);
  const [loading, setLoading] = useState(true);
  const [parityLoading, setParityLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parityError, setParityError] = useState<string | null>(null);

  // 换算器状态：默认换算成人民币
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('CNY');

  const loadRates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRates(await exchangeApi.latest());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadParity = useCallback(async () => {
    setParityLoading(true);
    setParityError(null);
    try {
      setParity(await exchangeApi.cnParity());
    } catch (err) {
      setParityError(err instanceof Error ? err.message : String(err));
    } finally {
      setParityLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRates();
    void loadParity();
  }, [loadRates, loadParity]);

  const rateMap = rates?.rates ?? {};
  const converted = useMemo(() => {
    const value = Number.parseFloat(amount);
    return convert(value, from, to, rateMap);
  }, [amount, from, to, rateMap]);

  const fromMeta = currencyMeta(from);
  const toMeta = currencyMeta(to);
  const directRate = rateOf(from, to, rateMap);
  const inverseRate = rateOf(to, from, rateMap);

  const tableRows = useMemo(
    () => COMMON_CURRENCIES.filter((item) => rateMap[item.code] > 0),
    [rateMap],
  );

  const stale = rates != null && rates.date < localToday();
  const amountValue = Number.parseFloat(amount);

  return (
    <div className="lt-feature space-y-4">
      <FeatureHeader
        eyebrow="业务查询"
        title="汇率查询"
        description="常用货币换算、对人民币汇率与人民币中间价，每日更新且离线可用"
        icon={<Coins size={26} strokeWidth={1.8} />}
        action={<TutorialLink featureId="exchange" variant="outline" />}
      />

      {rates && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>数据日期 {rates.date}</span>
          <span>来源 {SOURCE_LABELS[rates.source] ?? rates.source}</span>
          {stale && (
            <span className="inline-flex items-center gap-1 text-warning-fg">
              <TriangleAlert size={13} /> 已离线使用 {rates.date} 的缓存汇率
            </span>
          )}
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={loading} onClick={() => void loadRates()}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 刷新
          </Button>
        </div>
      )}

      {loading && !rates ? (
        <Card><CardContent className="py-10"><LoadingSpinner text="正在获取汇率…" /></CardContent></Card>
      ) : error && !rates ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadRates()}>重试</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">货币换算</CardTitle>
              <CardDescription>输入金额即可双向换算，默认换算成人民币</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input value={amount} onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal" className="h-9 w-36 text-sm" placeholder="金额" />
                <CurrencySelect value={from} onChange={setFrom} />
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
                  aria-label="交换币种" title="交换币种"
                  onClick={() => { setFrom(to); setTo(from); }}>
                  <ArrowLeftRight size={15} />
                </Button>
                <CurrencySelect value={to} onChange={setTo} />
              </div>
              <div>
                {converted != null ? (
                  <p className="text-2xl font-semibold tabular-nums">
                    {Number.isFinite(amountValue) ? amountValue : '-'} {fromMeta.name}
                    <span className="mx-2 text-muted-foreground">≈</span>
                    {formatRate(converted)} {toMeta.name}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">请输入有效金额</p>
                )}
                {directRate != null && inverseRate != null && (
                  <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
                    1 {from} = {formatRate(directRate)} {to} · 1 {to} = {formatRate(inverseRate)} {from}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">常用币种对人民币汇率</CardTitle>
              <CardDescription>点击行可填入上方换算器</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>币种</TableHead>
                    <TableHead className="text-right">单位</TableHead>
                    <TableHead className="text-right">兑人民币</TableHead>
                    <TableHead className="text-right">人民币兑</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map((item) => {
                    const unit = displayUnit(item.code);
                    const cnyPerUnit = rateOf(item.code, 'CNY', rateMap) ?? 0;
                    const unitPerCny = rateOf('CNY', item.code, rateMap) ?? 0;
                    return (
                      <TableRow key={item.code}
                        className="cursor-pointer"
                        onClick={() => { setFrom(item.code); setTo('CNY'); }}>
                        <TableCell>
                          <span className="font-medium">{item.code}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{item.name}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{unit}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatRate(cnyPerUnit * unit)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatRate(unitPerCny / unit)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">人民币中间价</CardTitle>
              <CardDescription>
                {parity ? `${parity.date} · 中国外汇交易中心` : '中国外汇交易中心'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {parityLoading && !parity ? (
                <LoadingSpinner size="sm" text="正在获取中间价…" />
              ) : parity ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {parity.items.map((item) => (
                    <div key={item.pair} className="rounded-lg border border-border bg-card px-3 py-2">
                      <div className="text-xs text-muted-foreground">{parityLabel(item.pair)}</div>
                      <div className="text-base font-semibold tabular-nums">{item.value.toFixed(4)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-xs text-muted-foreground">
                    中间价暂时无法获取：{parityError}。上方汇率表为市场参考汇率，可正常使用。
                  </p>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void loadParity()}>
                    重试
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function CurrencySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[150px] shrink-0 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SELECTABLE_CURRENCIES.map((item) => (
          <SelectItem key={item.code} value={item.code}>
            {item.code} · {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
