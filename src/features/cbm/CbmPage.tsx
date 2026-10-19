import { useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Calculator,
  Download,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileOpenDialog } from '@/components/common/FileOpenDialog';
import { useToast } from '@/hooks/use-toast';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  CBM_PRESETS,
  cbmApi,
  type CbmBatchResult,
  type CbmResult,
} from '@/lib/api/cbm';
import { getFileName } from '@/lib/file-opener';
import { queryErrorMessage } from '@/lib/hs-code';

const LENGTH_UNITS = ['cm', 'm', 'mm', 'in', 'ft'];
const WEIGHT_UNITS = ['kg', 'g', 'lb'];

interface CbmRowInput {
  id: number;
  name: string;
  length: string;
  width: string;
  height: string;
  quantity: string;
  weight: string;
}

let rowSeed = 0;
function emptyRow(): CbmRowInput {
  rowSeed += 1;
  return { id: rowSeed, name: '', length: '', width: '', height: '', quantity: '1', weight: '' };
}

function fmt(value: number, digits = 2): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function CbmPage() {
  const [preset, setPreset] = useState<string>('air');
  const [customDivisor, setCustomDivisor] = useState('6000');
  const [lengthUnit, setLengthUnit] = useState('cm');
  const [weightUnit, setWeightUnit] = useState('kg');

  const [rows, setRows] = useState<CbmRowInput[]>([emptyRow()]);
  const [calcLoading, setCalcLoading] = useState(false);
  const [result, setResult] = useState<CbmResult | null>(null);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [batchResult, setBatchResult] = useState<CbmBatchResult | null>(null);
  const [showResultFileDialog, setShowResultFileDialog] = useState(false);
  const [showTemplateFileDialog, setShowTemplateFileDialog] = useState(false);
  const [templateFilePath, setTemplateFilePath] = useState<string>('');

  const { toast } = useToast();

  const divisor = preset === 'custom'
    ? (Number(customDivisor) > 0 ? Number(customDivisor) : 6000)
    : CBM_PRESETS.find(item => item.value === preset)?.divisor ?? 6000;

  const updateRow = (id: number, patch: Partial<CbmRowInput>) => {
    setRows(prev => prev.map(row => (row.id === id ? { ...row, ...patch } : row)));
    setResult(null);
  };

  const removeRow = (id: number) => {
    setRows(prev => {
      const next = prev.filter(row => row.id !== id);
      return next.length > 0 ? next : [emptyRow()];
    });
    setResult(null);
  };

  const handleCalculate = async () => {
    const packages = rows
      .filter(row => row.length.trim() !== '' || row.width.trim() !== '' || row.height.trim() !== '')
      .map(row => ({
        name: row.name,
        length: Number(row.length) || 0,
        width: Number(row.width) || 0,
        height: Number(row.height) || 0,
        lengthUnit,
        weight: row.weight.trim() === '' ? 0 : Number(row.weight) || 0,
        weightUnit,
        quantity: row.quantity.trim() === '' ? 1 : Number(row.quantity) || 1,
      }));
    if (packages.length === 0) {
      toast({ title: '请至少填写一行尺寸数据', variant: 'destructive' });
      return;
    }
    setCalcLoading(true);
    setResult(null);
    try {
      const data = await cbmApi.calculate({ packages, divisor });
      setResult(data);
    } catch (error) {
      toast({ title: '试算失败', description: queryErrorMessage(error), variant: 'destructive' });
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
      const data = await cbmApi.calcBatch(filePath, { lengthUnit, weightUnit, divisor }, (current, total) => {
        setProgress(total > 0 ? (current / total) * 100 : 0);
      });
      setBatchResult(data);
      if (data.outputPath) setShowResultFileDialog(true);
      toast({
        title: '试算完成',
        description: `成功 ${data.success} 行，失败 ${data.failed} 行`,
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
        defaultPath: '体积计费重模板.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (path) {
        await cbmApi.downloadTemplate(path);
        setTemplateFilePath(path);
        setShowTemplateFileDialog(true);
      }
    } catch (error) {
      console.error('下载模板失败:', error);
      toast({ title: '下载模板失败', description: queryErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <div className="lt-feature space-y-6">
      <FeatureHeader eyebrow="LOGISTICS / CBM" title="体积 / 计费重计算"
        description="按包裹尺寸计算 CBM、体积重与计费重（实重与体积重取大），并估算常用柜型装柜数量；纯本地计算。"
        illustrationSrc="/illustrations/trade-scene.svg"/>

      <Card>
        <CardHeader>
          <CardTitle>计费参数</CardTitle>
          <CardDescription>
            体积重 = 长 × 宽 × 高 × 件数 ÷ 系数；计费重取实重与体积重中的较大值
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label>计费模式</Label>
            <Select value={preset} onValueChange={value => { setPreset(value); setResult(null); }}>
              <SelectTrigger className="w-56"><SelectValue/></SelectTrigger>
              <SelectContent>
                {CBM_PRESETS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {preset === 'custom' && (
            <div className="space-y-1.5">
              <Label htmlFor="lt-cbm-divisor">系数（cm³/kg）</Label>
              <Input id="lt-cbm-divisor" inputMode="decimal" className="w-32" value={customDivisor}
                onChange={e => { setCustomDivisor(e.target.value); setResult(null); }}/>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>尺寸单位</Label>
            <Select value={lengthUnit} onValueChange={value => { setLengthUnit(value); setResult(null); }}>
              <SelectTrigger className="w-28"><SelectValue/></SelectTrigger>
              <SelectContent>
                {LENGTH_UNITS.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>重量单位</Label>
            <Select value={weightUnit} onValueChange={value => { setWeightUnit(value); setResult(null); }}>
              <SelectTrigger className="w-28"><SelectValue/></SelectTrigger>
              <SelectContent>
                {WEIGHT_UNITS.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>包裹明细</CardTitle>
          <CardDescription>同一行的长宽高为单件尺寸；多件同规格包裹填件数即可，不同规格逐行添加</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={row.id} className="flex flex-wrap items-center gap-2">
                <Input className="w-36" placeholder={`名称 ${index + 1}（可选）`} value={row.name}
                  onChange={e => updateRow(row.id, { name: e.target.value })}/>
                <Input className="w-24" inputMode="decimal" placeholder="长" value={row.length}
                  aria-label={`第 ${index + 1} 行长度`}
                  onChange={e => updateRow(row.id, { length: e.target.value })}/>
                <Input className="w-24" inputMode="decimal" placeholder="宽" value={row.width}
                  aria-label={`第 ${index + 1} 行宽度`}
                  onChange={e => updateRow(row.id, { width: e.target.value })}/>
                <Input className="w-24" inputMode="decimal" placeholder="高" value={row.height}
                  aria-label={`第 ${index + 1} 行高度`}
                  onChange={e => updateRow(row.id, { height: e.target.value })}/>
                <Input className="w-20" inputMode="decimal" placeholder="件数" value={row.quantity}
                  aria-label={`第 ${index + 1} 行件数`}
                  onChange={e => updateRow(row.id, { quantity: e.target.value })}/>
                <Input className="w-24" inputMode="decimal" placeholder="实重" value={row.weight}
                  aria-label={`第 ${index + 1} 行实重`}
                  onChange={e => updateRow(row.id, { weight: e.target.value })}/>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                  aria-label={`删除第 ${index + 1} 行`} title="删除该行"
                  onClick={() => removeRow(row.id)}>
                  <Trash2 className="h-4 w-4"/>
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRows(prev => [...prev, emptyRow()])}>
              <Plus className="mr-2 h-4 w-4"/>添加一行
            </Button>
            <Button className="flex-1" onClick={handleCalculate} disabled={calcLoading}>
              {calcLoading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>计算中…</>
                : <><Calculator className="mr-2 h-4 w-4"/>开始计算</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>计算结果</CardTitle>
            <CardDescription>
              系数 1:{fmt(result.divisor, 0)}（{CBM_PRESETS.find(item => item.divisor === result.divisor)?.label || '自定义'}）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.errors.length > 0 && (
              <div role="alert" className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-fg space-y-1">
                {result.errors.map((error, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true"/>
                    <span>{error}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">总体积</p>
                <p className="text-2xl font-bold">{fmt(result.totalVolumeCbm, 3)} <span className="text-sm font-normal">m³</span></p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">总实重</p>
                <p className="text-2xl font-bold">{fmt(result.totalActualWeightKg)} <span className="text-sm font-normal">kg</span></p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">体积重</p>
                <p className="text-2xl font-bold">{fmt(result.totalVolumetricWeightKg)} <span className="text-sm font-normal">kg</span></p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">计费重</p>
                <p className="text-2xl font-bold text-success-fg">{fmt(result.chargeableWeightKg)} <span className="text-sm font-normal">kg</span></p>
                <p className="text-xs text-muted-foreground">按{result.chargeBasis}计费</p>
              </div>
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>尺寸 (cm)</TableHead>
                    <TableHead className="text-right">件数</TableHead>
                    <TableHead className="text-right">总体积 (m³)</TableHead>
                    <TableHead className="text-right">总实重 (kg)</TableHead>
                    <TableHead className="text-right">体积重 (kg)</TableHead>
                    <TableHead className="text-right">计费重 (kg)</TableHead>
                    <TableHead>计费方式</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.packages.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.name || `第 ${item.line} 行`}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {fmt(item.lengthCm, 1)} × {fmt(item.widthCm, 1)} × {fmt(item.heightCm, 1)}
                      </TableCell>
                      <TableCell className="text-right">{fmt(item.quantity, 0)}</TableCell>
                      <TableCell className="text-right">{fmt(item.totalVolumeCbm, 3)}</TableCell>
                      <TableCell className="text-right">{fmt(item.totalActualWeightKg)}</TableCell>
                      <TableCell className="text-right">{fmt(item.volumetricWeightKg)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(item.chargeableWeightKg)}</TableCell>
                      <TableCell>
                        <span className={item.chargeBasis === '体积重' ? 'text-info-fg' : ''}>{item.chargeBasis}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-1.5">
                <Boxes size={16} aria-hidden="true"/>柜型估算（参考值）
              </h4>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>柜型</TableHead>
                      <TableHead>内尺寸</TableHead>
                      <TableHead className="text-right">容积 (m³)</TableHead>
                      <TableHead className="text-right">参考载重 (kg)</TableHead>
                      <TableHead className="text-right">按体积需柜</TableHead>
                      <TableHead className="text-right">按重需柜</TableHead>
                      <TableHead className="text-right">建议柜数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.containers.map(container => (
                      <TableRow key={container.name}>
                        <TableCell className="font-medium">{container.name}</TableCell>
                        <TableCell className="font-mono text-xs">{container.internal}</TableCell>
                        <TableCell className="text-right">{fmt(container.capacityCbm, 1)}</TableCell>
                        <TableCell className="text-right">{fmt(container.payloadKg, 0)}</TableCell>
                        <TableCell className="text-right">{container.containersByVolume || '—'}</TableCell>
                        <TableCell className="text-right">{container.containersByWeight || '—'}</TableCell>
                        <TableCell className="text-right font-medium">{container.containersNeeded || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                柜型容积与载重为行业常用约数，未考虑装箱排版损失；实际以船公司与运输路线限重为准。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>批量 Excel 试算</CardTitle>
          <CardDescription>模板列：名称（可选）、长、宽、高、件数、实重；单位与计费模式沿用上方设置</CardDescription>
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
          <Button className="w-full" onClick={handleBatchCalc} disabled={!filePath || batchLoading}>
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
        description="体积 / 计费重模板已下载，是否立即打开编辑？"
        fileName={getFileName(templateFilePath)}
      />
      <FileOpenDialog
        open={showResultFileDialog}
        onOpenChange={setShowResultFileDialog}
        filePath={batchResult?.outputPath || ''}
        title="批量试算完成"
        description="批量体积 / 计费重试算已完成，是否查看结果文件？"
        fileName={batchResult?.outputPath ? getFileName(batchResult.outputPath) : undefined}
      />
    </div>
  );
}
