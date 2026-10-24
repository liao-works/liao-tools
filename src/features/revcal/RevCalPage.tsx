import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { TutorialLink } from '@/components/common/TutorialLink';
import { useState } from 'react';
import { Calculator, Download, FileSpreadsheet, Loader2, Plus, Search, Trash2, ExternalLink, SlidersHorizontal } from 'lucide-react';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

function formatPrice(p: RevCalProduct): string {
  if (p.price == null) return '—';
  return String(p.price);
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
  const [exporting, setExporting] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<RevCalProduct | null>(null);
  const [sortKey, setSortKey] = useState<'code' | 'price' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const { toast } = useToast();

  const handleSingleSearch = async () => {
    const keywords = singleCode.trim();
    if (!keywords) {
      toast({ title: '请输入查询码', variant: 'destructive' });
      return;
    }
    setQuerying(true);
    setFilterText('');
    setOnlyFailed(false);
    try {
      const products = await revCalApi.search(keywords, countryCode);
      setResults([{ code: keywords, products, error: null }]);
      if (products.length === 0) {
        toast({ title: '未找到商品', description: keywords });
      }
    } catch (error) {
      setResults([{ code: keywords, products: [], error: String(error) }]);
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
    setFilterText('');
    setOnlyFailed(false);
    setProgress({ current: 0, total: codes.length, code: '', status: '' });
    try {
      const result = await revCalApi.batchSearch(codes, countryCode, (p) => {
        setProgress({ current: p.current, total: p.total, code: p.code, status: p.status });
      });
      setResults(result.results);
      const dupNote = raw.length > codes.length ? `（已去除 ${raw.length - codes.length} 个重复）` : '';
      toast({
        title: '批量查询完成',
        description: `成功 ${result.success} 条，未找到/失败 ${result.failed} 条${dupNote}`,
      });
    } catch (error) {
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
        defaultPath: `Amazon商品查询_${countryCode}_${ts}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (!path) return;
      const savedPath = await revCalApi.exportExcel(results, path, splitDimensions);
      toast({ title: '导出成功', description: savedPath });
      await openFileWithShell(savedPath);
    } catch (error) {
      toast({ title: '导出失败', description: String(error), variant: 'destructive' });
    } finally {
      setExporting(false);
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

  return (
    <div className="lt-feature space-y-6">
      <FeatureHeader eyebrow="PRODUCT / AMAZON" title="Amazon 商品查询" description="查询商品尺寸、重量、价格与商品信息。支持单码、多站点和 Excel 批量导出；结果来自第三方公开接口。" illustrationSrc="/illustrations/product-lookup.svg" action={<TutorialLink featureId="revcal" variant="outline" />}/>

      <div className="lt-product-toolbar">
        <div><span className="lt-step-index">01</span>
          <div><strong>选择 Amazon 查询站点</strong><small>切换站点时会清空当前结果，避免混用不同国家的数据</small></div>
        </div>
        <Select value={countryCode} disabled={batchRunning || querying} onValueChange={value => {
          setCountryCode(value);setResults([]);setFilterText('');setOnlyFailed(false);setSelectedProduct(null);
          setProgress({current:0,total:0,code:'',status:''});
        }}>
          <SelectTrigger className="lt-product-country"><SelectValue placeholder="选择 Amazon 站点"/></SelectTrigger>
          <SelectContent className="max-h-[280px]">
            {COUNTRY_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>
              Amazon {option.value}
            </SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="lt-product-search-grid">
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !querying) void handleSingleSearch();
                }}
              />
              <Button onClick={() => void handleSingleSearch()} disabled={querying || batchRunning}>
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
              disabled={batchRunning}
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
              <Button onClick={() => void handleBatchSearch()} disabled={batchRunning || querying}>
                {batchRunning && <Loader2 className="h-4 w-4 animate-spin" />}
                开始批量查询
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lt-product-result-options">
        <div><SlidersHorizontal size={17}/><strong>结果展示与导出</strong></div>
        <label htmlFor="split-dimensions" className="lt-product-checkbox">
          <Checkbox id="split-dimensions" checked={splitDimensions}
            onCheckedChange={value => setSplitDimensions(value === true)}/>
          分列展示和导出长 / 宽 / 高 / 重量
        </label>
      </div>

      {/* 结果表 */}
      <Card className="lt-product-results">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">查询结果</CardTitle>
            <CardDescription>
              {results.length === 0 ? '结果将显示在这里' : `已查询 ${results.length} 个编码，${foundCount} 个编码找到商品`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {setResults([]);setSelectedProduct(null);setFilterText('');setOnlyFailed(false);}}
              disabled={results.length === 0}
            >
              <Trash2 className="h-4 w-4" />
              清空
            </Button>
            <Button size="sm" onClick={() => void handleExport()} disabled={exporting || results.length === 0}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              导出 Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="lt-product-empty">
              <img src="/illustrations/product-lookup.svg" alt="" aria-hidden="true"/>
              <strong>暂无商品查询结果</strong>
              <p>选择 Amazon 站点，输入 ASIN / UPC / EAN / ISBN 或关键词，或导入 Excel 批量查询。</p>
            </div>
          ) : (
            <> 
              <div className="lt-product-stats">
                <div><small>查询编码</small><strong>{results.length}</strong></div>
                <div><small>命中编码</small><strong>{foundCount}</strong></div>
                <div><small>未找到或失败</small><strong>{results.length - foundCount}</strong></div>
                <div><small>商品结果</small><strong>{rows.filter(row => row.product).length}</strong></div>
              </div>
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
                     <TableHead className="text-right whitespace-nowrap">操作</TableHead>
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
                          <a
                            href={row.product.product_link ?? '#'}
                            target="_blank"
                            rel="noreferrer"
                            title="在 Amazon 打开商品页面"
                            className="text-foreground underline-offset-2 hover:text-primary hover:underline"
                          >
                            {row.product.asin}
                          </a>
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
                      <TableCell className="text-right">{row.product &&
                        <Button variant="outline" size="sm" onClick={() => setSelectedProduct(row.product)}>详情</Button>}
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
      <Dialog open={selectedProduct != null} onOpenChange={isOpen => {if(!isOpen)setSelectedProduct(null);}}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[590px]">
          <DialogHeader>
            <DialogTitle>商品信息详情</DialogTitle>
            <DialogDescription>来自当前 Amazon 站点查询结果，价格和详情请以来源页面为准。</DialogDescription>
          </DialogHeader>
          {selectedProduct && <div className="lt-product-detail">
            <div className="lt-product-detail-hero">
              <div className="lt-product-detail-image"><ProductImage url={selectedProduct.image_url}/></div>
              <div><h3>{selectedProduct.title || '未提供商品名称'}</h3>
                <p>ASIN · {selectedProduct.asin}</p>
                <p>品牌 · {selectedProduct.brand || '未提供'}</p>
                {selectedProduct.product_link && <a href={selectedProduct.product_link} target="_blank" rel="noreferrer">
                  在 Amazon 查看 <ExternalLink size={14}/></a>}
              </div>
            </div>
            <dl>
              <div><dt>价格</dt><dd>{formatPrice(selectedProduct)} {selectedProduct.currency || ''}</dd></div>
              <div><dt>尺寸</dt><dd>{selectedProduct.dimensions_official || '未提供'}</dd></div>
              <div><dt>重量</dt><dd>{selectedProduct.weight ?? '未提供'} {selectedProduct.weight_unit || ''}</dd></div>
              <div><dt>类目</dt><dd>{selectedProduct.fee_category || '未提供'}</dd></div>
              <div><dt>销售排名</dt><dd>{selectedProduct.sales_rank ?? '未提供'} {selectedProduct.sales_rank_context || ''}</dd></div>
              <div><dt>评论数</dt><dd>{selectedProduct.reviews_count ?? '未提供'}</dd></div>
              <div><dt>评分</dt><dd>{selectedProduct.rating || '未提供'}</dd></div>
            </dl>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
