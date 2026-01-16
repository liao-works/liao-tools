import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { mockProcessExcel, mockValidateFile } from '@/mocks/excel';
import type { ExcelProcessType, ExcelProcessResult, ExcelProgress } from '@/types';

const STEPS = [
  { id: 1, title: '选择处理类型', description: 'UPS或DPD' },
  { id: 2, title: '上传文件', description: '主文件和明细表' },
  { id: 3, title: '开始处理', description: '生成结果文件' },
];

export function ProcessFlow() {
  const [currentStep, setCurrentStep] = useState(1);
  const [processType, setProcessType] = useState<ExcelProcessType | null>(null);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [detailFile, setDetailFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ExcelProgress | null>(null);
  const [result, setResult] = useState<ExcelProcessResult | null>(null);
  
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const detailFileInputRef = useRef<HTMLInputElement>(null);

  const handleMainFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validation = await mockValidateFile(file);
      
      if (validation.valid) {
        setMainFile(file);
        setResult(null);
      } else {
        alert(`文件验证失败：\n${validation.errors.join('\n')}`);
      }
    }
  };

  const handleDetailFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validation = await mockValidateFile(file);
      
      if (validation.valid) {
        setDetailFile(file);
      } else {
        alert(`文件验证失败：\n${validation.errors.join('\n')}`);
      }
    }
  };

  const handleProcess = async () => {
    if (!mainFile || !processType) return;

    setProcessing(true);
    setProgress(null);
    setResult(null);

    try {
      const data = await mockProcessExcel(mainFile, detailFile, processType, (prog) => {
        setProgress(prog);
      });
      setResult(data);
      setCurrentStep(3);
    } catch (error) {
      console.error('处理失败:', error);
    } finally {
      setProcessing(false);
    }
  };

  const canProceedToStep2 = processType !== null;
  const canProceedToStep3 = mainFile !== null;

  return (
    <div className="space-y-6">
      {/* 步骤指示器 */}
      <Card>
        <CardHeader>
          <CardTitle>处理流程</CardTitle>
          <CardDescription>按照以下步骤完成数据处理</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                      currentStep >= step.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted bg-background text-muted-foreground'
                    )}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <span className="font-semibold">{step.id}</span>
                    )}
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 transition-colors',
                      currentStep > step.id ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 步骤1: 选择处理类型 */}
      {currentStep === 1 && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card
            className={cn(
              'cursor-pointer transition-all hover:shadow-lg',
              processType === 'UPS' && 'border-primary bg-primary/5'
            )}
            onClick={() => setProcessType('UPS')}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                UPS总结单
              </CardTitle>
              <CardDescription>处理UPS快递数据，生成总结单模板</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• 自动填充订单信息</li>
                <li>• 生成收件人地址</li>
                <li>• 计算包裹数量</li>
              </ul>
            </CardContent>
          </Card>

          <Card
            className={cn(
              'cursor-pointer transition-all hover:shadow-lg',
              processType === 'DPD' && 'border-primary bg-primary/5'
            )}
            onClick={() => setProcessType('DPD')}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                DPD数据预报
              </CardTitle>
              <CardDescription>处理DPD快递数据，生成预报模板</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• 格式化运单信息</li>
                <li>• 生成发件人数据</li>
                <li>• 计算重量体积</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {processType && currentStep === 1 && (
        <div className="flex justify-end">
          <Button onClick={() => setCurrentStep(2)} disabled={!canProceedToStep2}>
            下一步
          </Button>
        </div>
      )}

      {/* 步骤2: 上传文件 */}
      {currentStep >= 2 && (
        <div className="space-y-4">
          {/* 主数据文件 */}
          <Card>
            <CardHeader>
              <CardTitle>主数据文件</CardTitle>
              <CardDescription>上传需要处理的Excel文件（必需）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => mainFileInputRef.current?.click()}
              >
                <input
                  ref={mainFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleMainFileChange}
                  className="hidden"
                />
                <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium">点击或拖拽文件到此处上传</p>
                <p className="text-xs text-muted-foreground mt-1">支持.xlsx和.xls格式</p>
              </div>
              {mainFile && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <span className="text-sm flex-1">{mainFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(mainFile.size / 1024).toFixed(2)} KB
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 单件明细表（可选） */}
          <Card>
            <CardHeader>
              <CardTitle>单件明细表（可选）</CardTitle>
              <CardDescription>上传明细表以补充详细信息</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => detailFileInputRef.current?.click()}
              >
                <input
                  ref={detailFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleDetailFileChange}
                  className="hidden"
                />
                <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium">点击或拖拽文件到此处上传</p>
                <p className="text-xs text-muted-foreground mt-1">可选，支持.xlsx和.xls格式</p>
              </div>
              {detailFile && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <span className="text-sm flex-1">{detailFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(detailFile.size / 1024).toFixed(2)} KB
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 处理按钮 */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              上一步
            </Button>
            <Button onClick={handleProcess} disabled={!canProceedToStep3 || processing}>
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  处理中...
                </>
              ) : (
                '开始处理'
              )}
            </Button>
          </div>

          {/* 进度显示 */}
          {progress && (
            <Card>
              <CardHeader>
                <CardTitle>处理进度</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={progress.percentage} />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{progress.message}</span>
                  <span className="font-medium">{progress.percentage}%</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 步骤3: 处理结果 */}
      {result && currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              处理完成
            </CardTitle>
            <CardDescription>文件已成功处理</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">处理行数</p>
                <p className="text-2xl font-bold">{result.processedRows}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">输出文件</p>
                <p className="text-sm font-mono truncate">{result.outputPath}</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-lg bg-destructive/10 p-3">
                <p className="text-sm font-medium text-destructive mb-2">处理中发现的问题：</p>
                {result.errors.map((error, index) => (
                  <p key={index} className="text-sm text-muted-foreground">
                    • {error}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button className="flex-1">
                <Download className="mr-2 h-4 w-4" />
                下载结果文件
              </Button>
              <Button variant="outline" onClick={() => {
                setCurrentStep(1);
                setMainFile(null);
                setDetailFile(null);
                setResult(null);
                setProcessType(null);
              }}>
                处理新文件
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
