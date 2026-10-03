import { useState } from 'react';
import { Calculator, Download, FileSpreadsheet, Loader2, Plus, Search, Trash2 } from 'lucide-react';
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

/** 官方合并格式下的单位文案（法语，与官方页面一致） */
const UNIT_FR: Record<string, string> = {
  centimeters: 'centimètres',
  kilograms: 'kilogrammes',
  inches: 'pouces',
  pounds: 'livres',
  grams: 'grammes',
  millimeters: 'millimètres',
};

function frNum(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function unitFr(unit: string | null): string {
  if (!unit) return '';
  return UNIT_FR[unit] ?? unit;
}

/** 官方合并格式：20,2 X 30,3 X 35 centimètres 4,85 kilogrammes */
function formatDimensionsOfficial(p: RevCalProduct): string {
  const parts: string[] = [];
  if (p.length != null && p.width != null && p.height != null) {
    parts.push(
      `${frNum(p.length)} X ${frNum(p.width)} X ${frNum(p.height)} ${unitFr(p.dimension_unit)}`.trim()
    );
  }
  if (p.weight != null) {
    parts.push(`${frNum(p.weight)} ${unitFr(p.weight_unit)}`.trim());
  }
  return parts.join(' ');
}

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
  const [progress, setProgress] = useState({ current: 0, total: 0, code: '' });
  const [results, setResults] = useState<RevCalQueryResult[]>([]);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleSingleSearch = async () => {
    const keywords = singleCode.trim();
    if (!keywords) {
      toast({ title: '请输入查询码', variant: 'destructive' });
      return;
    }
    setQuerying(true);
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
    const codes = batchCodes
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.length === 0) {
      toast({ title: '请输入要查询的编码', variant: 'destructive' });
      return;
    }
    setBatchRunning(true);
    setProgress({ current: 0, total: codes.length, code: '' });
    try {
      const result = await revCalApi.batchSearch(codes, countryCode, (p) => {
        setProgress({ current: p.current, total: p.total, code: p.code });
      });
      setResults(result.results);
      toast({
        title: '批量查询完成',
        description: `成功 ${result.success} 条，未找到/失败 ${result.failed} 条`,
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
        defaultPath: `收益计算器结果_${ts}.xlsx`,
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

  // 展开成表格行：每个商品一行
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

  const foundCount = results.filter((r) => r.products.length > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Amazon 收益计算器</h2>
        <p className="text-muted-foreground">
          通过 Amazon 收益计算器公开接口查询商品尺寸与价格，支持批量查询与 Excel 导出
        </p>
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !querying) void handleSingleSearch();
                }}
              />
              <Button onClick={() => void handleSingleSearch()} disabled={querying}>
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
                  {progress.current}/{progress.total}：{progress.code}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void handleSelectExcel()} disabled={batchRunning}>
                <FileSpreadsheet className="h-4 w-4" />
                上传 Excel
              </Button>
              <Button onClick={() => void handleBatchSearch()} disabled={batchRunning}>
                {batchRunning && <Loader2 className="h-4 w-4 animate-spin" />}
                开始批量查询
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Boutique Amazon 选择（带国旗，与官方一致）+ 尺寸拆分开关 */}
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Boutique Amazon</span>
          <Select value={countryCode} onValueChange={setCountryCode}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {COUNTRY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-2">
                    <img
                      src={flagUrl(opt.value)}
                      alt={opt.value}
                      className="h-3.5 w-5 rounded-[2px] object-cover"
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                    <span>{opt.value}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="split-dimensions"
            checked={splitDimensions}
            onCheckedChange={(v) => setSplitDimensions(v === true)}
          />
          <label
            htmlFor="split-dimensions"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            拆分尺寸（长 / 宽 / 高 / 重量 分列显示）
          </label>
        </div>
      </div>

      {/* 结果表 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">查询结果</CardTitle>
            <CardDescription>
              共 {results.length} 条查询，命中 {foundCount} 条
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResults([])}
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
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无查询结果，请先在上方查询单码或批量编码
            </p>
          ) : (
            <div className="max-h-[480px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">查询码</TableHead>
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
                    <TableHead className="text-right whitespace-nowrap">Prix</TableHead>
                    <TableHead className="whitespace-nowrap">错误信息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
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
                          {row.product ? formatDimensionsOfficial(row.product) || '—' : '—'}
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
        </CardContent>
      </Card>
    </div>
  );
}
