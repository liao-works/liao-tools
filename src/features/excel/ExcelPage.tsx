import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProcessConfigPanel } from './components/ProcessConfigPanel';
import { ProcessLogPanel } from './components/ProcessLogPanel';
import { FileOpenDialog } from '@/components/common/FileOpenDialog';
import { useToast } from '@/hooks/use-toast';
import { getFileName } from '@/lib/file-opener';
import type { ProcessType, ProcessRequest, ProcessResponse } from '@/lib/api/excel';
import { ProcessTypeLabels } from '@/lib/api/excel';
import { FileText, Play, Settings, Upload, CheckCircle2, AlertTriangle, X, FileCheck2, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ExcelPage() {
  const [processType, setProcessType] = useState<ProcessType>('sea-rail-with-image');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [completedPath, setCompletedPath] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [outputFilePath, setOutputFilePath] = useState<string>('');
  const { toast } = useToast();

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        filters: [
          {
            name: 'Excel 文件',
            extensions: ['xlsx'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        setSelectedFile(selected);
        setLogs([]);
        setCompletedPath('');
        setErrorMessage('');
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      toast({
        title: '错误',
        description: '选择文件失败',
        variant: 'destructive',
      });
    }
  };

  const handleProcess = async () => {
    if (!selectedFile) {
      toast({
        title: '提示',
        description: '请先选择 Excel 文件',
      });
      return;
    }

    setProcessing(true);
    setLogs([]);
    setErrorMessage('');
    setCompletedPath('');

    try {
      // 获取配置
      const config = await invoke<any>('get_excel_config', { processType });

      // 处理文件
      const request: ProcessRequest = {
        file_path: selectedFile,
        config,
      };

      const result = await invoke<ProcessResponse>('process_excel_file', { request });

      setLogs(result.logs);

      if (result.success) {
        setCompletedPath(result.output_path);
        setOutputFilePath(result.output_path);
        setShowFileDialog(true);
        
        toast({
          title: '处理完成',
          description: 'Excel 文件处理完成',
        });
      } else {
        setErrorMessage(result.message || '处理失败，请检查文件配置。');
        toast({
          title: '处理失败',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('处理失败:', error);
      setErrorMessage(error?.message || '处理失败，请检查文件配置。');
      toast({
        title: '处理失败',
        description: error?.message || '未知错误',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="lt-feature space-y-6">
      <FeatureHeader eyebrow="FILES / SPREADSHEETS" title="Excel 数据拆分" description="处理海铁或空运工作簿的合并单元格、重量分配及图片，保留原有模板和列配置。" illustrationSrc="/illustrations/file-workflow.svg"/>

      <Tabs defaultValue="process" className="w-full">
        <TabsList>
          <TabsTrigger value="process">
            <Play className="w-4 h-4 mr-2" />
            处理文件
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings className="w-4 h-4 mr-2" />
            配置管理
          </TabsTrigger>
        </TabsList>

        <TabsContent value="process" className="space-y-4">
          <div className="lt-process-steps">
            <div><span className="lt-step-index">01</span><strong>选择处理模式</strong><small>海铁 / 空运</small></div>
            <div><span className="lt-step-index">02</span><strong>导入工作簿</strong><small>使用 .xlsx 文件</small></div>
            <div><span className="lt-step-index">03</span><strong>处理并导出</strong><small>保存拆分结果</small></div>
          </div>
          <div className="lt-operation-grid">
            <Card className="lt-operation-primary">
              <div className="p-6 space-y-6">
                <div>
                  <div className="lt-operation-heading">
                    <span className="lt-step-index">01</span>
                    <div><h2 className="lt-operation-title">选择 Excel 处理方式</h2>
                      <p className="lt-operation-subtitle">根据工作簿的运输场景选择对应的处理规则。</p></div>
                  </div>
                  <div className="lt-mode-card-grid" role="radiogroup" aria-label="Excel 处理类型">
                    {(Object.entries(ProcessTypeLabels) as [ProcessType,string][]).map(([value,label]) =>
                      <label key={value} className={`lt-mode-card ${processType === value ? 'is-selected' : ''}`}>
                        <input type="radio" name="processType" value={value} checked={processType===value}
                          disabled={processing} onChange={evt => {
                            setProcessType(evt.target.value as ProcessType);setSelectedFile(null);
                            setLogs([]);setErrorMessage('');setCompletedPath('');
                          }}/>
                        <span className="lt-mode-card-mark"><FileText size={19}/></span>
                        <strong>{label}</strong><small>{value === 'air-freight' ? '适用于空运拆分流程' :
                          value === 'sea-rail-no-image' ? '不复制工作簿图片' : '含图片处理选项，实际能力由配置决定'}</small>
                      </label>)}
                  </div>
                </div>
                <div className="lt-operation-file-select">
                  <label><span className="lt-step-index">02</span>选择输入文件 <span>必选</span></label>
                  <div className="lt-operation-drop">
                    <span className="lt-operation-file-symbol"><FileText size={24}/></span>
                    <div className="lt-operation-file-details">
                      <strong>{selectedFile ? getFileName(selectedFile) : '选择需要拆分的 Excel 工作簿'}</strong>
                      <small title={selectedFile ?? undefined}>{selectedFile || '.xlsx 文件 · 数据在本地处理'}</small>
                    </div>
                    <Button variant="outline" onClick={handleSelectFile} disabled={processing}>
                      <Upload className="mr-2 h-4 w-4"/>{selectedFile ? '更换' : '选择文件'}
                    </Button>
                    {selectedFile && <button type="button" className="lt-operation-clear"
                      aria-label="移除已选文件" disabled={processing} onClick={() => {
                        setSelectedFile(null);setLogs([]);setCompletedPath('');setErrorMessage('');
                      }}><X size={17}/></button>}
                  </div>
                </div>
                <div className="lt-operation-next">
                  <div className="lt-operation-next-copy"><span className="lt-step-index">03</span>
                    <div><strong>生成处理后的工作簿</strong><p>将使用当前保存的列索引及重量分配配置。</p></div>
                  </div>
                  <Button className="lt-operation-run" onClick={handleProcess} disabled={!selectedFile||processing}>
                    {processing ? <><Loader2 size={16} className="mr-2 animate-spin"/>正在处理…</>
                      : <><Play size={16} className="mr-2"/>开始处理</>}
                  </Button>
                </div>
                {errorMessage && <div className="lt-operation-error" role="alert"><AlertTriangle size={17}/>{errorMessage}</div>}
              </div>
            </Card>
            <aside className="lt-operation-side">
              <div className="lt-operation-side-card">
                <span className="lt-kicker">PROCESSING GUIDE</span>
                <h3>当前处理说明</h3>
                <p>选择与工作簿格式对应的模式。系统使用已保存的 Excel 处理规则执行拆分，处理后可查看原始日志与输出文件。</p>
                <div className="lt-operation-note"><Settings size={17}/> 配置管理：设置重量列、箱数列等真实参数</div>
                <div className="lt-operation-note"><FileCheck2 size={17}/> 图片复制选项以实际功能支持情况为准</div>
                <img className="lt-operation-illustration" src="/illustrations/file-workflow.svg" alt="" aria-hidden="true"/>
              </div>
            </aside>
          </div>
          {completedPath && <div className="lt-operation-output lt-operation-finished">
            <CheckCircle2 size={22} className="text-success-fg"/>
            <div><strong>处理完成 · {getFileName(completedPath)}</strong><span>{completedPath}</span></div>
            <Button variant="outline" onClick={() => setShowFileDialog(true)}>打开结果</Button>
          </div>}
          {logs.length > 0 && <ProcessLogPanel logs={logs}/>}
        </TabsContent>

        <TabsContent value="config">
          <ProcessConfigPanel />
        </TabsContent>
      </Tabs>

      {/* 文件打开对话框 */}
      <FileOpenDialog
        open={showFileDialog}
        onOpenChange={setShowFileDialog}
        filePath={outputFilePath}
        title="Excel 处理完成"
        description="数据拆分处理已完成，是否查看输出文件？"
        fileName={getFileName(outputFilePath)}
      />
    </div>
  );
}
