import { useState } from 'react';
import { AlertCircle, Calculator, Download, ExternalLink, FileSpreadsheet, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { revCalApi } from '@/lib/api/revcal';
import { openFileWithShell } from '@/lib/file-opener';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { RevCalProduct, RevCalQueryResult } from '@/types';

/** Boutique Amazon 国家选项（与官方 revcalpublic 下拉一致，16 国，接口实测全部可用） */
const COUNTRY_OPTIONS = [
  { value: 'GB' },
  { value: 'DE' },
  { value: 'FR' },
  { value: 'IT' },
  { value: 'ES' },
  { value: 'IN' },
  { value: 'AE' },
  { value: 'TR' },
  { value: 'SA' },
  { value: 'NL' },
  { value: 'SE' },
  { value: 'PL' },
  { value: 'EG' },
  { value: 'BE' },
  { value: 'ZA' },
  { value: 'IE' },
];

/** 官方国旗图标（Amazon 官方 CDN，小写国家码） */
const flagUrl = (cc: string) => `https://d1uznvntk80v7s.cloudfront.net/flags/${cc.toLowerCase()}.svg`;

function formatPrice(p: RevCalProduct): string {
  if (p.price == null) return '—';
  return p.currency ? `${p.price} ${p.currency}` : String(p.price);
}

function ProductImage({ url }: { url: string | null }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
    </div>
  );
}

export function RevCalPage() {
  const [countryCode, setCountryCode] = useState('GB');
  const [splitDimensions, setSplitDimensions] = useState(false);
  const [singleCode, setSingleCode] = useState('');
  const [batchCodes, setBatchCodes] = useState('');
  const [querying, setQuerying] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, code: '', status: '' });
  const [results, setResults] = useState<RevCalQueryResult[]>([]);
  const [resultsCountry, setResultsCountry] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [sortKey, setSortKey] = useState<'code' | 'price' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const { toast } = useToast();

  const handleSingleSearch = async () => {
    if (querying || batchRunning) return;
    const keywords = singleCode.trim();
    if (!keywords) {
      toast({ title: '请输入查询码', variant: 'destructive' });
      return;
    }
    setQuerying(true);
    setQueryError(null);
    setExportPath(null);
    try {
      const products = await revCalApi.search(keywords, countryCode);
      setResults([{ code: keywords, products, error: null }]);
      setResultsCountry(countryCode);
      if (products.length === 0) {
        toast({ title: '未找到商品', description: keywords });
      }
    } catch (error) {
      setResults([{ code: keywords, products: [], error: String(error) }]);
      setResultsCountry(countryCode);
      setQueryError(String(error));
      toast({ title: '查询失败', description: String(error), variant: 'destructive' });
    } finally {
      setQuerying(false);
    }
  };

  const handleSelectExcel = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (!selected || typeof selected !== 'string') return;
      const codes = await revCalApi.readExcelCodes(selected);
      if (codes.length === 0) {
        toast({
          title: '未读取到编码',
          description: '请确认第一列从第二行开始填写查询码',
          variant: 'destructive',
        });
        return;
      }
      setBatchCodes(codes.join('\n'));
      const fileName = selected.split(/[/\\]/).pop() || selected;
      toast({ title: 'Excel 已读取', description: `${fileName}：${codes.length} 个编码` });
    } catch (error) {
      toast({ title: '读取 Excel 失败', description: String(error), variant: 'destructive' });
    }
  };

  const handleBatchSearch = async () => {
    if (querying || batchRunning) return;
    const raw = batchCodes
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean);
    // 去重：重复码会白白消耗接口配额
    const codes = [...new Set(raw)];
    if (codes.length === 0) {
      toast({ title: '请输入要查询的编码', variant: 'destructive' });
      return;
    }
    setBatchRunning(true);
    setQueryError(null);
    setExportPath(null);
    setProgress({ current: 0, total: codes.length, code: '', status: '' });
    try {
      const result = await revCalApi.batchSearch(codes, countryCode, (p) => {
        setProgress({ current: p.current, total: p.total, code: p.code, status: p.status });
      });
      setResults(result.results);
      setResultsCountry(countryCode);
      const dupNote = raw.length > codes.length ? `（已去除 ${raw.length - codes.length} 个重复）` : '';
      toast({
        title: '批量查询完成',
        description: `成功 ${result.success} 条，未找到/失败 ${result.failed} 条${dupNote}`,
      });
    } catch (error) {
      setQueryError(String(error));
      toast({ title: '批量查询失败', description: String(error), variant: 'destructive' });
    } finally {
      setBatchRunning(false);
    }
  };

  const handleExport = async () => {
    if (results.length === 0) return;
    setExporting(true);
    try {
      const now = new Date();
      const ts =
        [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0'),
        ].join('') +
        '_' +
        [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0')].join(
          ''
        );
      const path = await save({
        defaultPath: `收益计算器结果_${countryCode}_${ts}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (!path) return;
      const savedPath = await revCalApi.exportExcel(results, path, splitDimensions);
      setExportPath(savedPath);
      toast({ title: '导出成功', description: savedPath });
    } catch (error) {
      toast({ title: '导出失败', description: String(error), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleCountryChange = (next: string) => {
    if (querying || batchRunning || exporting) return;
    if (next === countryCode) return;
    setCountryCode(next);
    // Results from one marketplace must never be shown as data from another.
    setResults([]);
    setResultsCountry(null);
    setExportPath(null);
    setQueryError(null);
    setProgress({ current: 0, total: 0, code: '', status: '' });
  };

  const handleOpenExport = async () => {
    if (!exportPath) return;
    try {
      await openFileWithShell(exportPath);
    } catch (error) {
      toast({ title: '无法打开导出文件', description: String(error), variant: 'destructive' });
    }
  };

  // 展开成表格行：每个商品一行，再按筛选/排序条件加工
  const rows = results.flatMap((result) => {
    if (result.products.length === 0) {
      return [
        {
          key: `err-${result.code}-${result.error ?? 'notfound'}`,
          code: result.code,
          status: result.error ? '查询失败' : '未找到',
          error: result.error,
          product: null as RevCalProduct | null,
        },
      ];
    }
    return result.products.map((product, i) => ({
      key: `${result.code}-${product.asin}-${i}`,
      code: result.code,
      status: '成功',
      error: null,
      product,
    }));
  });

  const visibleRows = rows.filter((row) => {
    if (onlyFailed && row.status === '成功') return false;
    if (!filterText.trim()) return true;
    const t = filterText.trim().toLowerCase();
    return (
      row.code.toLowerCase().includes(t) ||
      (row.product?.asin ?? '').toLowerCase().includes(t) ||
      (row.product?.title ?? '').toLowerCase().includes(t)
    );
  });
  if (sortKey) {
    const dir = sortDir === 'asc' ? 1 : -1;
    visibleRows.sort((a, b) => {
      if (sortKey === 'price') {
        const pa = a.product?.price ?? null;
        const pb = b.product?.price ?? null;
        // 无价格的行始终排在最后
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return (pa - pb) * dir;
      }
      return a.code.localeCompare(b.code) * dir;
    });
  }

  const toggleSort = (key: 'code' | 'price') => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIndicator = (key: 'code' | 'price') =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const foundCount = results.filter((r) => r.products.length > 0).length;
  const failedCount = results.filter((r) => r.error).length;
  const emptyCount = results.filter((r) => !r.error && r.products.length === 0).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground-emphasis md:text-3xl">Amazon 商品查询</h1>
        <p className="text-muted-foreground">
          查询 Amazon 商品尺寸、重量与价格。支持单码、批量和 Excel 导出；仅展示实际接口返回的数据。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
        <span className="text-sm font-semibold">Amazon 站点</span>
        <Select value={countryCode} onValueChange={handleCountryChange} disabled={batchRunning || querying || exporting}>
          <SelectTrigger className="w-[152px]" aria-label="Amazon 站点"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-[280px]">
            {COUNTRY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="flex items-center gap-2">
                  <img src={flagUrl(opt.value)} alt="" aria-hidden="true" className="h-3.5 w-5 rounded-sm object-cover"
                    onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                  {opt.value}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">切换站点会清除旧站点的查询结果，避免误用跨站点价格。</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 单码查询 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              单码查询
            </CardTitle>
            <CardDescription>输入 ASIN / UPC / EAN / ISBN 或商品关键词</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="例如：B0GD7VRN9V"
                value={singleCode}
                onChange={(e) => setSingleCode(e.target.value)}
                disabled={querying || batchRunning}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !querying && !batchRunning) void handleSingleSearch();
                }}
              />
              <Button onClick={() => void handleSingleSearch()} disabled={querying || batchRunning || !singleCode.trim()}>
                {querying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                查询
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 批量查询 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />
              批量查询
            </CardTitle>
            <CardDescription>每行一个编码，或从 Excel 导入（第一列），逐条查询（约 1 条/秒）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={'B0GD7VRN9V\nB09B9615X2\n…'}
              value={batchCodes}
              onChange={(e) => setBatchCodes(e.target.value)}
              disabled={batchRunning || querying}
            />
            {batchRunning && progress.total > 0 && (
              <div className="space-y-1">
                <Progress value={(progress.current / progress.total) * 100} />
                <p className="text-xs text-muted-foreground">
                  {progress.status.startsWith('retry') ? '补查 ' : ''}
                  {progress.current}/{progress.total}：{progress.code}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void handleSelectExcel()} disabled={batchRunning || querying}>
                <FileSpreadsheet className="h-4 w-4" />
                上传 Excel
              </Button>
              <Button onClick={() => void handleBatchSearch()} disabled={batchRunning || querying || !batchCodes.trim()}>
                {batchRunning && <Loader2 className="h-4 w-4 animate-spin" />}
                开始批量查询
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor="split-dimensions" className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox id="split-dimensions" checked={splitDimensions} onCheckedChange={(value) => setSplitDimensions(value === true)} />
          将长 / 宽 / 高 / 重量分列显示与导出
        </label>
        {(querying || batchRunning) && <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在查询 {countryCode} 站点</span>}
      </div>

      {queryError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger bg-danger-subtle p-4 text-sm text-danger-fg">
          <AlertCircle className="h-4 w-4 shrink-0" />{queryError}
        </div>
      )}

      {exportPath && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Excel 文件已导出</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">{exportPath}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleOpenExport()}><ExternalLink className="h-4 w-4" /> 打开导出文件</Button>
        </div>
      )}

      {/* 结果表 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">查询结果</CardTitle>
            <CardDescription>
              {resultsCountry || countryCode} 站点 · {results.length} 条查询 · 命中 {foundCount} · 未找到 {emptyCount} · 失败 {failedCount}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setResults([]); setResultsCountry(null); setExportPath(null); setQueryError(null); }}
              disabled={results.length === 0 || querying || batchRunning}
            >
              <Trash2 className="h-4 w-4" />
              清空
            </Button>
            <Button size="sm" onClick={() => void handleExport()} disabled={exporting || querying || batchRunning || results.length === 0}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              导出 Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无查询结果，请先在上方查询单码或批量编码
            </p>
          ) : (
            <>
              {/* 筛选工具栏 */}
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Input
                  placeholder="筛选查询码 / ASIN / 标题…"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="h-8 w-[240px]"
                />
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox checked={onlyFailed} onCheckedChange={(v) => setOnlyFailed(v === true)} />
                  只看失败
                </label>
                {(filterText || onlyFailed) && (
                  <span className="text-xs text-muted-foreground">
                    显示 {visibleRows.length} / {rows.length} 行
                  </span>
                )}
              </div>
              {visibleRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">没有匹配的行</p>
              ) : (
            <div className="max-h-[480px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort('code')}
                    >
                      查询码{sortIndicator('code')}
                    </TableHead>
                    <TableHead className="whitespace-nowrap">状态</TableHead>
                    <TableHead className="w-12 whitespace-nowrap">图片</TableHead>
                    <TableHead className="whitespace-nowrap">ASIN</TableHead>
                    <TableHead className="min-w-[260px] whitespace-nowrap">商品名称</TableHead>
                    {splitDimensions ? (
                      <>
                        <TableHead className="text-right whitespace-nowrap">长</TableHead>
                        <TableHead className="text-right whitespace-nowrap">宽</TableHead>
                        <TableHead className="text-right whitespace-nowrap">高</TableHead>
                        <TableHead className="text-right whitespace-nowrap">重量</TableHead>
                      </>
                    ) : (
                      <TableHead className="whitespace-nowrap">Dimensions du produit</TableHead>
                    )}
                    <TableHead
                      className="cursor-pointer select-none text-right whitespace-nowrap"
                      onClick={() => toggleSort('price')}
                    >
                      Prix{sortIndicator('price')}
                    </TableHead>
                    <TableHead className="whitespace-nowrap">错误信息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.key} className="hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap font-mono text-xs">{row.code}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge
                          variant={
                            row.status === '成功'
                              ? 'default'
                              : row.status === '未找到'
                                ? 'secondary'
                                : 'destructive'
                          }
                          className="whitespace-nowrap"
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ProductImage url={row.product?.image_url ?? null} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {row.product ? (
                          row.product.product_link ? <a
                            href={row.product.product_link}
                            target="_blank"
                            rel="noreferrer"
                            title="在 Amazon 打开商品页面"
                            className="text-foreground underline-offset-2 hover:text-primary hover:underline"
                          >
                            {row.product.asin}
                          </a> : <span>{row.product.asin}</span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate" title={row.product?.title}>
                        {row.product?.title ?? '—'}
                      </TableCell>
                      {splitDimensions ? (
                        <>
                          <TableCell className="text-right whitespace-nowrap text-xs">
                            {row.product?.length ?? '—'}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap text-xs">
                            {row.product?.width ?? '—'}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap text-xs">
                            {row.product?.height ?? '—'}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap text-xs">
                            {row.product?.weight ?? '—'}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell className="whitespace-nowrap text-xs">
                          {row.product ? row.product.dimensions_official || '—' : '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-right whitespace-nowrap text-sm font-medium">
                        {row.product ? formatPrice(row.product) : '—'}
                      </TableCell>
                      <TableCell
                        className="max-w-[180px] truncate text-xs text-destructive"
                        title={row.error ?? undefined}
                      >
                        {row.error ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
