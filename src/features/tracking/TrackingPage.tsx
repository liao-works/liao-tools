import { useState } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Loader2,
  PackageSearch,
  Save,
} from 'lucide-react';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileOpenDialog } from '@/components/common/FileOpenDialog';
import { useToast } from '@/hooks/use-toast';
import { save } from '@tauri-apps/plugin-dialog';
import {
  MAX_BATCH_SIZE,
  TRACKING_APPLY_URL,
  TRACKING_DOCS_URL,
  TRACKING_TOKEN_STORAGE_KEY,
  trackingApi,
  trackingStatusLabel,
  type TrackingRow,
} from '@/lib/api/tracking';
import { getFileName, openUrlPath } from '@/lib/file-opener';
import { queryErrorMessage } from '@/lib/hs-code';

/** 单号分隔：换行、逗号、分号、空白均可 */
function parseNumbers(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[\s,;，；]+/)
    .map(item => item.trim())
    .filter(item => item.length > 0 && seen.add(item));
}

function loadStoredToken(): string {
  try {
    return localStorage.getItem(TRACKING_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function TrackingPage() {
  const [apiKey, setApiKey] = useState(loadStoredToken);
  const [numbersText, setNumbersText] = useState('');
  const [querying, setQuerying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<TrackingRow[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; success: number; failed: number } | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportPath, setExportPath] = useState('');
  const { toast } = useToast();

  const numbers = parseNumbers(numbersText);

  const handleSaveToken = () => {
    try {
      localStorage.setItem(TRACKING_TOKEN_STORAGE_KEY, apiKey.trim());
      toast({ title: '已保存', description: 'API Key 已保存在本机，仅用于本应用调用 17TRACK 接口。' });
    } catch (error) {
      toast({ title: '保存失败', description: String(error), variant: 'destructive' });
    }
  };

  const handleQuery = async () => {
    if (numbers.length === 0) {
      toast({ title: '请输入至少一个运单号', variant: 'destructive' });
      return;
    }
    if (!apiKey.trim()) {
      toast({ title: '请先填写并保存 17TRACK API Key', variant: 'destructive' });
      return;
    }
    setQuerying(true);
    setProgress(0);
    setRows(null);
    setSummary(null);
    try {
      const result = await trackingApi.batchQuery(numbers, apiKey.trim(), (current, total) => {
        setProgress(total > 0 ? (current / total) * 100 : 0);
      });
      setRows(result.rows);
      setSummary({ total: result.total, success: result.success, failed: result.failed });
      toast({
        title: '查询完成',
        description: `成功 ${result.success} 票，失败 ${result.failed} 票`,
      });
    } catch (error) {
      toast({ title: '轨迹查询失败', description: queryErrorMessage(error), variant: 'destructive' });
    } finally {
      setQuerying(false);
    }
  };

  const handleExport = async () => {
    if (!rows || rows.length === 0) return;
    try {
      const path = await save({
        defaultPath: `轨迹查询结果_${new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (path) {
        await trackingApi.exportResults(rows, path);
        setExportPath(path);
        setShowExportDialog(true);
      }
    } catch (error) {
      toast({ title: '导出失败', description: queryErrorMessage(error), variant: 'destructive' });
    }
  };

  const batches = Math.max(1, Math.ceil(numbers.length / MAX_BATCH_SIZE));

  return (
    <div className="lt-feature space-y-6">
      <FeatureHeader eyebrow="LOGISTICS / TRACKING" title="运单轨迹查询"
        description="通过 17TRACK 开放接口批量查询运单轨迹：自动识别承运商、里程碑状态与预计送达；需要自备 API Key。"
        illustrationSrc="/illustrations/trade-scene.svg"/>

      <Card>
        <CardHeader>
          <CardTitle>接口设置</CardTitle>
          <CardDescription>
            查询能力来自 17TRACK 开放接口（覆盖 3500+ 承运商）；需要自备 API Key，新注册账号有 100 单免费测试额度
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground">
            <li>
              前往 <button type="button" className="lt-tax-source-link" onClick={() => { void openUrlPath(TRACKING_APPLY_URL); }}>
                17TRACK 开放平台 <ExternalLink size={13}/>
              </button>，注册账号并开通 API 服务（免费）
            </li>
            <li>
              登录 API 控制台，在「设置 → 访问密钥」页复制密钥（即 17token）；用法详见
              <button type="button" className="lt-tax-source-link ml-1" onClick={() => { void openUrlPath(TRACKING_DOCS_URL); }}>
                接口开发文档 <ExternalLink size={13}/>
              </button>
            </li>
            <li>把密钥粘贴到下方输入框并保存，即可开始批量查询</li>
          </ol>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 flex-1 min-w-64">
              <Label htmlFor="lt-tracking-token">API Key（17token）</Label>
              <Input id="lt-tracking-token" type="password" value={apiKey}
                placeholder="仅保存在本机，不会上传到其他服务器"
                onChange={e => setApiKey(e.target.value)}/>
            </div>
            <Button variant="outline" onClick={handleSaveToken} disabled={!apiKey.trim()}>
              <Save className="mr-2 h-4 w-4"/>保存
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            额度按注册单号计费（已注册过的单号重复查询不重复计费，以官方计费规则为准）；在控制台更换密钥后，新密钥最长 5 分钟生效、旧密钥立即失效。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>批量查询</CardTitle>
          <CardDescription>
            粘贴运单号，支持换行、逗号、分号或空格分隔；自动去重，每 {MAX_BATCH_SIZE} 票一批、自动限速
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="lt-tracking-numbers">运单号列表</Label>
          <textarea id="lt-tracking-numbers" value={numbersText}
            className="flex min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder={'RR123456789CN\nLP00451203912345, 4204239293606'}
            onChange={e => { setNumbersText(e.target.value); setRows(null); setSummary(null); }}/>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              共 {numbers.length} 个单号{numbers.length > 0 && <>，将分 {batches} 批查询</>}
            </p>
            <Button onClick={handleQuery}
              disabled={querying || numbers.length === 0 || !apiKey.trim()}>
              {querying
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>查询中…</>
                : <><PackageSearch className="mr-2 h-4 w-4"/>开始查询</>}
            </Button>
          </div>
          {querying && (
            <div className="space-y-2">
              <Progress value={progress}/>
              <p className="text-sm text-center text-muted-foreground">{progress.toFixed(0)}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      {rows && summary && (
        <Card>
          <CardHeader>
            <CardTitle>查询结果</CardTitle>
            <CardDescription>
              成功 {summary.success} 票 · 失败 {summary.failed} 票；轨迹同步可能有延迟，刚注册的单号可稍后重查
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
                <Download className="mr-2 h-4 w-4"/>导出 Excel
              </Button>
            </div>
            {summary.failed > 0 && (
              <div className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-fg flex items-start gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true"/>
                <span>部分单号未获取到轨迹，原因见「查询备注」列；额度耗尽或 Key 无效时请处理后重试。</span>
              </div>
            )}
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>运单号</TableHead>
                    <TableHead>承运商</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>最新事件</TableHead>
                    <TableHead className="text-right">运输天数</TableHead>
                    <TableHead>预计送达</TableHead>
                    <TableHead>查询备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.number}-${index}`}>
                      <TableCell className="font-mono text-xs">{row.number}</TableCell>
                      <TableCell className="text-sm">{row.carrier || '—'}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {row.status
                          ? <span className={row.status === 'Delivered' ? 'text-success-fg'
                              : row.status === 'Exception' || row.status === 'DeliveryFailure' ? 'text-destructive' : ''}>
                              {trackingStatusLabel(row.status)}
                            </span>
                          : '—'}
                        {row.subStatus && <span className="block text-xs text-muted-foreground">{row.subStatus}</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.latestEventDescription
                          ? <>
                              <span className="block">{row.latestEventDescription}</span>
                              <span className="block text-xs text-muted-foreground">
                                {[row.latestEventTime, row.latestEventLocation].filter(Boolean).join(' · ')}
                              </span>
                            </>
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">{row.transitDays ?? '—'}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{row.estimatedDelivery || '—'}</TableCell>
                      <TableCell className="text-sm">
                        {row.error
                          ? <span className="text-warning-fg">{row.error}</span>
                          : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              状态与轨迹来自 17TRACK 聚合，可能存在同步延迟；异常件与派送失败请以承运商官网为准。
            </p>
          </CardContent>
        </Card>
      )}

      <FileOpenDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        filePath={exportPath}
        title="导出完成"
        description="轨迹查询结果已导出，是否打开查看？"
        fileName={getFileName(exportPath)}
      />
    </div>
  );
}
