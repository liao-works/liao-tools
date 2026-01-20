import { useState } from 'react';
import { Upload, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { FileOpenDialog } from '@/components/common/FileOpenDialog';
import { altaApi } from '@/lib/api/alta';
import { getFileName } from '@/lib/file-opener';
import type { AltaBatchResult } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { open, save } from '@tauri-apps/plugin-dialog';

const MATCH_OPTIONS = [
  { value: 4, label: '4位匹配' },
  { value: 6, label: '6位匹配' },
  { value: 8, label: '8位匹配' },
  { value: undefined, label: '完全匹配' },
];

interface BatchTabProps {
  onSwitchToManage: () => void;
}

export function BatchTab({ onSwitchToManage }: BatchTabProps) {
  const [filePath, setFilePath] = useState<string>('');
  const [matchLength, setMatchLength] = useState<number | undefined>(6);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<AltaBatchResult | null>(null);
  const [showResultFileDialog, setShowResultFileDialog] = useState(false);
  const [showTemplateFileDialog, setShowTemplateFileDialog] = useState(false);
  const [templateFilePath, setTemplateFilePath] = useState<string>('');
  const { toast } = useToast();

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Excel Files',
          extensions: ['xlsx', 'xls']
        }]
      });

      if (selected && typeof selected === 'string') {
        setFilePath(selected);
        setResult(null);
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      toast({
        title: '选择文件失败',
        description: '请重试',
        variant: 'destructive',
      });
    }
  };

  const handleProcess = async () => {
    if (!filePath) return;

    setProcessing(true);
    setResult(null);

    try {
      const data = await altaApi.batchProcess(filePath, matchLength);
      setResult(data);
      
      // 如果有输出文件，显示对话框
      if (data.output_path) {
        setShowResultFileDialog(true);
      }
      
      toast({
        title: '处理完成',
        description: `成功处理 ${data.total} 条记录，其中 ${data.forbidden} 条禁运`,
      });
    } catch (error: any) {
      console.error('处理失败:', error);

      // 检查是否是数据库为空的错误
      if (error.code === 'DATABASE_EMPTY') {
        toast({
          title: '数据库为空',
          description: '请先到"数据管理"标签更新禁运数据',
          variant: 'destructive',
          action: (
            <button
              onClick={onSwitchToManage}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary"
            >
              去更新
            </button>
          ),
        });
      } else {
        toast({
          title: '处理失败',
          description: error.message || '请检查文件格式或稍后重试',
          variant: 'destructive',
        });
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const path = await save({
        defaultPath: 'Alta查询模板.xlsx',
        filters: [
          {
            name: 'Excel',
            extensions: ['xlsx'],
          },
        ],
      });

      if (path) {
        await altaApi.downloadTemplate(path);
        setTemplateFilePath(path);
        setShowTemplateFileDialog(true);
        
        toast({
          title: '下载成功',
          description: '模板已保存',
        });
      }
    } catch (error: any) {
      console.error('下载模板失败:', error);
      toast({
        title: '下载失败',
        description: error.message || '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* 模板下载 */}
      <Card>
        <CardHeader>
          <CardTitle>第一步：下载Excel模板</CardTitle>
          <CardDescription>下载模板文件，按格式填写HS编码</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleDownloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            下载模板
          </Button>
        </CardContent>
      </Card>

      {/* 文件选择 */}
      <Card>
        <CardHeader>
          <CardTitle>第二步：选择填写好的Excel文件</CardTitle>
          <CardDescription>支持.xlsx和.xls格式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Button
              variant="outline"
              onClick={handleSelectFile}
              disabled={processing}
            >
              <Upload className="mr-2 h-4 w-4" />
              选择文件
            </Button>
            {filePath && (
              <p className="mt-2 text-sm text-muted-foreground">
                已选择: {filePath.split(/[/\\]/).pop()}
              </p>
            )}
          </div>

          {/* 匹配位数选择 */}
          <div className="space-y-2">
            <Label>匹配位数</Label>
            <div className="flex gap-2">
              {MATCH_OPTIONS.map((option) => (
                <Button
                  key={option.value || 'full'}
                  variant={matchLength === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMatchLength(option.value)}
                  disabled={processing}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* 处理按钮 */}
          <Button onClick={handleProcess} disabled={!filePath || processing} className="w-full">
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                处理中...
              </>
            ) : (
              '开始处理'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 结果统计 */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>处理结果</CardTitle>
            <CardDescription>批量处理完成</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">总计</p>
                <p className="text-2xl font-bold">{result.total}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">禁运</p>
                <p className="text-2xl font-bold text-destructive">{result.forbidden}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">正常</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{result.safe}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">无效</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{result.invalid}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 模板文件打开对话框 */}
      <FileOpenDialog
        open={showTemplateFileDialog}
        onOpenChange={setShowTemplateFileDialog}
        filePath={templateFilePath}
        title="模板下载完成"
        description="Excel 模板已下载，是否立即打开编辑？"
        fileName={getFileName(templateFilePath)}
      />

      {/* 处理结果文件打开对话框 */}
      <FileOpenDialog
        open={showResultFileDialog}
        onOpenChange={setShowResultFileDialog}
        filePath={result?.output_path || ''}
        title="Alta 禁运查询完成"
        description="禁运商品批量查询已完成，是否查看结果文件？"
        fileName={result?.output_path ? getFileName(result.output_path) : undefined}
      />
    </div>
  );
}
