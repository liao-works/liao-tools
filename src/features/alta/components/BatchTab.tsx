import { useState } from 'react';
import { Upload, Download, Loader2, FileCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { altaApi } from '@/lib/api/alta';
import type { AltaBatchResult } from '@/types';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  const handleSelectFile = async () => {
    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
      const selected = await openDialog({
        multiple: false,
        filters: [{
          name: 'Excel Files',
          extensions: ['xlsx', 'xls']
        }]
      });

      if (selected) {
        setFilePath(selected as string);
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
      const templatePath = await altaApi.downloadTemplate();
      toast({
        title: '模板已下载',
        description: templatePath,
        duration: 5000,
      });
    } catch (error: any) {
      console.error('下载模板失败:', error);
      toast({
        title: '下载失败',
        description: error.message || '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const copyPathToClipboard = (path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      toast({
        title: '已复制',
        description: '文件路径已复制到剪贴板',
      });
    }).catch((err) => {
      console.error('复制失败:', err);
      toast({
        title: '复制失败',
        description: '请手动复制路径',
        variant: 'destructive',
      });
    });
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
            {result.output_path && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">输出文件：</p>
                    <p className="text-sm font-mono truncate">{result.output_path}</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => copyPathToClipboard(result.output_path)}
                    className="ml-2 shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  点击图标复制路径，然后在文件管理器中打开
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
