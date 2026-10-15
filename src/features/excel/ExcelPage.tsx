import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileSpreadsheet, Loader2, Play, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileOperationFeedback, type FileOperationState } from '@/components/workflow/FileOperationFeedback';
import { useToast } from '@/hooks/use-toast';
import { getFileName } from '@/lib/file-opener';
import type { ProcessConfig, ProcessType, ProcessRequest, ProcessResponse } from '@/lib/api/excel';
import { ProcessTypeLabels } from '@/lib/api/excel';
import { ProcessConfigPanel } from './components/ProcessConfigPanel';

const processModes: { type: ProcessType; detail: string }[] = [
  { type: 'sea-rail-with-image', detail: '海铁货物 · 使用有图模式配置' },
  { type: 'sea-rail-no-image', detail: '海铁货物 · 不复制图片' },
  { type: 'air-freight', detail: '空运货物 · 使用空运列索引' },
];

export function ExcelPage() {
  const [processType, setProcessType] = useState<ProcessType>('sea-rail-with-image');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [operation, setOperation] = useState<FileOperationState>({ kind: 'idle' });
  const [tab, setTab] = useState('process');
  const { toast } = useToast();
  const busy = operation.kind === 'running';

  async function selectFile() {
    if (busy) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
      });
      if (typeof selected === 'string') {
        setSelectedFile(selected);
        setOperation({ kind: 'idle' });
      }
    } catch (error) {
      toast({
        title: '选择文件失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }

  async function processFile() {
    if (!selectedFile || busy) return;
    setOperation({ kind: 'running' });
    try {
      // Read the saved configuration for this processing mode at execution time.
      const config = await invoke<ProcessConfig>('get_excel_config', { processType });
      const request: ProcessRequest = { file_path: selectedFile, config };
      const result = await invoke<ProcessResponse>('process_excel_file', { request });
      if (result.success) {
        setOperation({
          kind: 'success',
          message: result.message || 'Excel 文件处理已完成',
          outputPath: result.output_path,
          logs: result.logs || [],
        });
      } else {
        setOperation({
          kind: 'error',
          message: result.message || 'Excel 文件处理失败',
          logs: result.logs || [],
        });
      }
    } catch (error) {
      setOperation({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
        logs: [],
      });
    }
  }

  function changeMode(next: ProcessType) {
    if (busy) return;
    setProcessType(next);
    // An .xlsx file is valid for every mode, so switching mode should not force re-selection.
    setOperation({ kind: 'idle' });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground-emphasis md:text-3xl">Excel 数据拆分</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          选择海铁或空运模式，直接处理本地 Excel 文件。不会上传到云端。
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="process"><Play className="mr-2 h-4 w-4" />处理文件</TabsTrigger>
          <TabsTrigger value="config" disabled={busy}><Settings2 className="mr-2 h-4 w-4" />高级配置</TabsTrigger>
        </TabsList>

        <TabsContent value="process" className="space-y-4">
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1 · 选择处理模式</CardTitle>
              <p className="text-xs text-muted-foreground">只需选择与文件对应的处理方式；重量列和箱数列按该模式已保存的配置读取。</p>
            </CardHeader>
            <CardContent>
              <div role="group" aria-label="Excel 处理模式" className="grid gap-2 sm:grid-cols-3">
                {processModes.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    disabled={busy}
                    aria-pressed={processType === option.type}
                    onClick={() => changeMode(option.type)}
                    className={
                      'rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ' +
                      (processType === option.type
                        ? 'border-primary bg-primary-subtle'
                        : 'border-border bg-card hover:border-primary/50')
                    }
                  >
                    <span className="block text-sm font-semibold text-foreground-emphasis">{ProcessTypeLabels[option.type]}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.detail}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2 · 选择文件并处理</CardTitle>
              <p className="text-xs text-muted-foreground">支持 .xlsx 格式，源文件由原有处理命令读取。</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 sm:flex-row sm:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  {selectedFile ? (
                    <>
                      <p className="break-all text-sm font-medium text-foreground-emphasis">{getFileName(selectedFile)}</p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">{selectedFile}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">还没有选择 Excel 文件</p>
                  )}
                </div>
                <Button type="button" variant="outline" onClick={() => void selectFile()} disabled={busy}>
                  {selectedFile ? '更换文件' : '选择 Excel 文件'}
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  列索引需要调整时，可打开“高级配置”；通常无需修改。
                </p>
                <Button type="button" disabled={!selectedFile || busy} onClick={() => void processFile()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {busy ? '正在处理' : operation.kind === 'error' ? '重试处理' : '开始处理'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <FileOperationFeedback state={operation} title="Excel 处理完成" />
        </TabsContent>

        <TabsContent value="config">
          <ProcessConfigPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
