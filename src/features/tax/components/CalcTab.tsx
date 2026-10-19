import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Calculator, Download, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileOpenDialog } from '@/components/common/FileOpenDialog';
import { useToast } from '@/hooks/use-toast';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  taxApi,
  type TaxCalcBatchResult,
  type TaxCalcResult,
} from '@/lib/api/tax';
import { getFileName } from '@/lib/file-opener';
import { queryErrorMessage, validateTaxHsCode } from '@/lib/hs-code';

const CURRENCIES = ['GBP', 'USD', 'CNY', 'EUR'];

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 目的地 / 中国原产 / 币种 / 汇率 / VAT 在单码与批量之间共享 */
export function CalcTab() {
  const [destination, setDestination] = useState<'GB' | 'XI'>('GB');
  const [chinaOrigin, setChinaOrigin] = useState(true);
  const [currency, setCurrency] = useState('GBP');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [vatRate, setVatRate] = useState('20');

  const [code, setCode] = useState('');
  const [goodsValue, setGoodsValue] = useState('');
  const [freight, setFreight] = useState('');
  const [insurance, setInsurance] = useState('');
  const [quantity, setQuantity] = useState('');
  const [calcLoading, setCalcLoading] = useState(false);
  const [inputError, setInputError] = useState('');
  const [result, setResult] = useState<TaxCalcResult | null>(null);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [batchResult, setBatchResult] = useState<TaxCalcBatchResult | null>(null);
  const [showResultFileDialog, setShowResultFileDialog] = useState(false);
  const [showTemplateFileDialog, setShowTemplateFileDialog] = useState(false);
  const [templateFilePath, setTemplateFilePath] = useState<string>('');

  const [hasData, setHasData] = useState<boolean | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    taxApi.checkDataExists()
      .then((exists) => { if (active) setHasData(exists); })
      .catch(() => { if (active) setHasData(null); });
    return () => { active = false; };
  }, []);

  const handleCalc = async () => {
    const validation = validateTaxHsCode(code, false);
    if (!validation.ok) {
      setInputError(validation.message);
      return;
    }
    if (!goodsValue.trim() || !(Number(goodsValue) > 0)) {
      setInputError('请填写大于 0 的货值');
      return;
    }
    setInputError('');
    setCalcLoading(true);
    setResult(null);
    try {
      const data = await taxApi.calcEstimate({
        code: validation.code,
        destination,
        chinaOrigin,
        goodsValue: Number(goodsValue),
        freight: freight.trim() === '' ? 0 : parseNumber(freight, 0),
        insurance: insurance.trim() === '' ? 0 : parseNumber(insurance, 0),
        quantity: quantity.trim() === '' ? null : parseNumber(quantity, 0),
        currency,
        exchangeRate: parseNumber(exchangeRate, 1),
        vatRate: parseNumber(vatRate, 20),
      });
      setResult(data);
    } catch (error) {
      toast({
        title: '试算失败',
        description: queryErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setCalcLoading(false);
    }
  };

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      });
      if (selected && typeof selected === 'string') {
        setFilePath(selected);
        setFileName(selected.split(/[/\\]/).pop() || selected);
        setBatchResult(null);
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      toast({ title: '选择文件失败', description: String(error), variant: 'destructive' });
    }
  };

  const handleBatchCalc = async () => {
    if (!filePath) return;
    setBatchLoading(true);
    setProgress(0);
    setBatchResult(null);
    try {
      const data = await taxApi.calcBatch(filePath, {
        destination,
        chinaOrigin,
        currency,
        exchangeRate: parseNumber(exchangeRate, 1),
        vatRate: parseNumber(vatRate, 20),
      }, (current, total) => {
        setProgress(total > 0 ? (current / total) * 100 : 0);
      });
      setBatchResult(data);
      if (data.outputPath) setShowResultFileDialog(true);
      toast({
        title: '试算完成',
        description: `成功 ${data.success} 条，失败 ${data.failed} 条`,
      });
    } catch (error) {
      console.error('批量试算失败:', error);
      toast({ title: '批量试算失败', description: queryErrorMessage(error), variant: 'destructive' });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const path = await save({
        defaultPath: '关税成本试算模板.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (path) {
        await taxApi.downloadCalcTemplate(path);
        setTemplateFilePath(path);
        setShowTemplateFileDialog(true);
      }
    } catch (error) {
      console.error('下载模板失败:', error);
      toast({ title: '下载模板失败', description: queryErrorMessage(error), variant: 'destructive' });
    }
  };

  const regionLabel = destination === 'XI' ? '北爱尔兰' : '英国';

  return (
    <div className="space-y-4">
      {hasData === false && (
        <Card className="border-warning bg-warning-subtle">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning-fg mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-warning-subtle-fg">数据库为空</h3>
                <p className="text-sm text-warning-fg mt-1">
                  请先下载本地税率数据库，再进行成本试算。
                </p>
                <Link to="/tax?tab=update" className="lt-tax-install-link">前往数据更新 →</Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>单码试算</CardTitle>
          <CardDescription>
            按本地普通第三国税率估算完税价值、关税、反倾销/反补贴附加税与进口 VAT；无法解析的税率会明确标注，不会按 0 计算
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="lt-calc-code">商品编码（10 位）</Label>
              <Input id="lt-calc-code" inputMode="numeric" maxLength={24} value={code}
                placeholder="例如：0101210000"
                onChange={e => { setCode(e.target.value); setInputError(''); setResult(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { void handleCalc(); } }}/>
            </div>
            <div className="space-y-1.5">
              <Label>目的地</Label>
              <Select value={destination} onValueChange={value => {
                setDestination(value as 'GB' | 'XI');
                setResult(null);
              }}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GB">英国 GB</SelectItem>
                  <SelectItem value="XI">北爱尔兰 XI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-calc-value">货值（{currency}）</Label>
              <Input id="lt-calc-value" inputMode="decimal" value={goodsValue}
                placeholder="例如：10000"
                onChange={e => { setGoodsValue(e.target.value); setInputError(''); setResult(null); }}/>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-calc-qty">计税数量（可选）</Label>
              <Input id="lt-calc-qty" inputMode="decimal" value={quantity}
                placeholder="按量计税时必填"
                onChange={e => { setQuantity(e.target.value); setResult(null); }}/>
            </div>
            <div className="space-y-1.5">
              <Label>币种</Label>
              <Select value={currency} onValueChange={value => {
                setCurrency(value);
                if (value === 'GBP') setExchangeRate('1');
              }}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-calc-fx">汇率（1 {currency} = ? GBP）</Label>
              <Input id="lt-calc-fx" inputMode="decimal" value={exchangeRate}
                disabled={currency === 'GBP'}
                onChange={e => setExchangeRate(e.target.value)}/>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-calc-freight">运费（{currency}）</Label>
              <Input id="lt-calc-freight" inputMode="decimal" value={freight} placeholder="可留空"
                onChange={e => { setFreight(e.target.value); setResult(null); }}/>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-calc-insurance">保险费（{currency}）</Label>
              <Input id="lt-calc-insurance" inputMode="decimal" value={insurance} placeholder="可留空"
                onChange={e => { setInsurance(e.target.value); setResult(null); }}/>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="lt-calc-china-origin" checked={chinaOrigin}
                onCheckedChange={checked => { setChinaOrigin(checked === true); setResult(null); }}/>
              <Label htmlFor="lt-calc-china-origin"
                className="text-sm font-normal cursor-pointer">中国原产（计入反倾销 / 反补贴）</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="lt-calc-vat" className="text-sm font-normal">进口 VAT（%）</Label>
              <Input id="lt-calc-vat" inputMode="decimal" value={vatRate} className="w-24"
                onChange={e => setVatRate(e.target.value)}/>
              <span className="text-xs text-muted-foreground">英国标准税率 20%，可修改</span>
            </div>
          </div>
          {inputError && <p role="alert" className="lt-tax-validation">{inputError}</p>}
          <p className="text-xs text-muted-foreground">
            计税数量：当税率表达式含按量计税（如 £15.60/100kg）时必填，单位与表达式一致（500kg 填 5）。
            运费与保险费计入完税价值（CIF）。
          </p>
          <Button className="w-full" onClick={handleCalc}
            disabled={calcLoading || !code.trim() || !goodsValue.trim() || hasData === false}>
            {calcLoading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>试算中…</>
              : <><Calculator className="mr-2 h-4 w-4"/>开始试算</>}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>试算结果 · {result.code}（{regionLabel}）</CardTitle>
            <CardDescription>
              {result.description || '本地记录未提供商品描述'}
              {' · '}完税价值 CIF：{formatMoney(result.customsValue)} GBP
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.warnings.length > 0 && (
              <div role="alert" className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-fg space-y-1">
                {result.warnings.map((warning, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true"/>
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>税费构成</TableHead>
                    <TableHead>官方表达式</TableHead>
                    <TableHead className="text-right">金额（GBP）</TableHead>
                    <TableHead>说明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.lines.map((line, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{line.label}</TableCell>
                      <TableCell className="font-mono text-xs">{line.expression || '—'}</TableCell>
                      <TableCell className="text-right">
                        {line.computable ? formatMoney(line.amount)
                          : <span className="text-warning-fg">无法试算</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{line.note || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">关税合计（GBP）</p>
                <p className="text-lg font-semibold">{formatMoney(result.dutyTotal)}</p>
                <p className="text-xs text-muted-foreground">关税率 {result.dutyRateEffective == null ? '—' : result.dutyRateEffective.toFixed(2) + '%'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">进口 VAT（GBP）</p>
                <p className="text-lg font-semibold">{formatMoney(result.vatTotal)}</p>
                <p className="text-xs text-muted-foreground">税率 {result.vatRate}%，计税基础为完税价值 + 关税</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">税费合计（GBP）</p>
                <p className="text-lg font-semibold">{formatMoney(result.grandTotal)}</p>
                <p className="text-xs text-muted-foreground">综合税率 {result.totalRateEffective == null ? '—' : result.totalRateEffective.toFixed(2) + '%'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">试算状态</p>
                <p className="text-lg font-semibold">{result.fullyComputed
                  ? <span className="text-success-fg">完整</span>
                  : <span className="text-warning-fg">部分完成</span>}</p>
                <p className="text-xs text-muted-foreground">按输入币种 {result.currency} 汇率折算</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              试算基于本地离线税率与「完税价值 + 关税」的 VAT 口径，未包含消费税（烟酒等）、优惠协定税率、
              企业差别税率与条件税率；条件税率或历史数据出现时会单独提示。结果仅供参考，不构成申报依据，
              申报前请核对官方页面。
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>批量 Excel 试算</CardTitle>
          <CardDescription>
            模板列：商品编码、货值、运费、保险费、计税数量；目的地 / 中国原产 / 币种 / 汇率 / VAT 沿用上方设置
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4"/>下载模板
            </Button>
            <Button variant="outline" onClick={handleSelectFile} disabled={batchLoading}>
              <Upload className="mr-2 h-4 w-4"/>选择文件
            </Button>
            {fileName && <p className="text-sm text-muted-foreground self-center">已选择：{fileName}</p>}
          </div>
          <Button className="w-full" onClick={handleBatchCalc}
            disabled={!filePath || batchLoading || hasData === false}>
            {batchLoading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>试算中…</>
              : '开始批量试算'}
          </Button>
          {batchLoading && (
            <div className="space-y-2">
              <Progress value={progress}/>
              <p className="text-sm text-center text-muted-foreground">{progress.toFixed(0)}%</p>
            </div>
          )}
          {batchResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">总数</p>
                  <p className="text-2xl font-bold">{batchResult.total}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">成功</p>
                  <p className="text-2xl font-bold text-success-fg">{batchResult.success}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">失败</p>
                  <p className="text-2xl font-bold text-destructive">{batchResult.failed}</p>
                </div>
              </div>
              {batchResult.errors.length > 0 && (
                <div className="rounded-lg bg-destructive/10 p-3 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-sm font-medium text-destructive">错误详情：</p>
                  {batchResult.errors.slice(0, 10).map((error, index) => (
                    <p key={index} className="text-sm text-muted-foreground">• {error}</p>
                  ))}
                  {batchResult.errors.length > 10 && (
                    <p className="text-sm text-muted-foreground">… 还有 {batchResult.errors.length - 10} 条错误</p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <FileOpenDialog
        open={showTemplateFileDialog}
        onOpenChange={setShowTemplateFileDialog}
        filePath={templateFilePath}
        title="模板下载完成"
        description="关税成本试算模板已下载，是否立即打开编辑？"
        fileName={getFileName(templateFilePath)}
      />
      <FileOpenDialog
        open={showResultFileDialog}
        onOpenChange={setShowResultFileDialog}
        filePath={batchResult?.outputPath || ''}
        title="批量试算完成"
        description="批量成本试算已完成，是否查看结果文件？"
        fileName={batchResult?.outputPath ? getFileName(batchResult.outputPath) : undefined}
      />
    </div>
  );
}
