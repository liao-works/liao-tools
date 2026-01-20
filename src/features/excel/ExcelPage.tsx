import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ProcessConfigPanel } from './components/ProcessConfigPanel';
import { ProcessLogPanel } from './components/ProcessLogPanel';
import { FileOpenDialog } from '@/components/common/FileOpenDialog';
import { useToast } from '@/hooks/use-toast';
import { getFileName } from '@/lib/file-opener';
import type { ProcessType, ProcessRequest, ProcessResponse } from '@/lib/api/excel';
import { ProcessTypeLabels } from '@/lib/api/excel';
import { FileText, Play, Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ExcelPage() {
  const [processType, setProcessType] = useState<ProcessType>('sea-rail-with-image');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
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
        setOutputFilePath(result.output_path);
        setShowFileDialog(true);
        
        toast({
          title: '处理完成',
          description: 'Excel 文件处理完成',
        });
      } else {
        toast({
          title: '处理失败',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('处理失败:', error);
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
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Excel 数据拆分工具</h2>
        <p className="text-muted-foreground">
          支持海铁/空运数据的合并单元格拆分处理
        </p>
      </div>

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
          <Card className="p-6">
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">处理类型</Label>
                <div className="flex flex-wrap gap-4">
                  {(Object.entries(ProcessTypeLabels) as [ProcessType, string][]).map(([value, label]) => (
                    <div key={value} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={value}
                        name="processType"
                        value={value}
                        checked={processType === value}
                        onChange={(e) => {
                          setProcessType(e.target.value as ProcessType);
                          setSelectedFile(null);
                          setLogs([]);
                        }}
                        className="w-4 h-4 text-primary border-gray-300 focus:ring-2 focus:ring-primary cursor-pointer"
                      />
                      <Label
                        htmlFor={value}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">选择文件</Label>
                <div className="flex gap-2">
                  <Button onClick={handleSelectFile} variant="outline" className="flex-1">
                    <FileText className="w-4 h-4 mr-2" />
                    {selectedFile ? '更换文件' : '选择 Excel 文件'}
                  </Button>
                </div>
                {selectedFile && (
                  <p className="text-sm text-muted-foreground truncate" title={selectedFile}>
                    {selectedFile}
                  </p>
                )}
              </div>

              <Button
                onClick={handleProcess}
                disabled={!selectedFile || processing}
                className="w-full"
              >
                {processing ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    处理中...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    开始处理
                  </>
                )}
              </Button>
            </div>
          </Card>

          {logs.length > 0 && <ProcessLogPanel logs={logs} />}
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
