import { useState, useEffect } from 'react';
import { Upload, Download, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { taxApi } from '@/lib/api/tax';
import { open, save } from '@tauri-apps/plugin-dialog';

export function BatchQueryTab() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [results, setResults] = useState<{
    total: number;
    success: number;
    errors: string[];
    outputPath: string;
  } | null>(null);
  const { toast } = useToast();

  // 检查数据是否存在
  useEffect(() => {
    const checkData = async () => {
      const exists = await taxApi.checkDataExists();
      setHasData(exists);
    };
    checkData();
  }, []);

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Excel',
            extensions: ['xlsx', 'xls'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        setFilePath(selected);
        const name = selected.split(/[/\\]/).pop() || selected;
        setFileName(name);
        setResults(null);
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      toast({
        title: '选择文件失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleProcess = async () => {
    if (!filePath) return;

    setProcessing(true);
    setProgress(0);
    setResults(null);

    try {
      const result = await taxApi.batchQuery(filePath, (current, total) => {
        setProgress((current / total) * 100);
      });
      
      setResults(result);
      
      toast({
        title: '处理完成',
        description: `成功查询 ${result.success} 条，失败 ${result.errors.length} 条`,
      });
    } catch (error) {
      console.error('处理失败:', error);
      toast({
        title: '处理失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const path = await save({
        defaultPath: '税率查询模板.xlsx',
        filters: [
          {
            name: 'Excel',
            extensions: ['xlsx'],
          },
        ],
      });

      if (path) {
        await taxApi.downloadTemplate(path);
        toast({
          title: '下载成功',
          description: '模板已保存',
        });
      }
    } catch (error) {
      console.error('下载模板失败:', error);
      toast({
        title: '下载失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleOpenResult = async () => {
    if (results?.outputPath) {
      try {
        await taxApi.openUrl(results.outputPath);
      } catch (error) {
        console.error('打开文件失败:', error);
        toast({
          title: '打开文件失败',
          description: String(error),
          variant: 'destructive',
        });
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* 数据检查提示 */}
      {hasData === false && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                  数据库为空
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  请先在「数据更新」标签页下载税率数据后再进行批量查询
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 模板下载 */}
      <Card>
        <CardHeader>
          <CardTitle>第一步：下载Excel模板</CardTitle>
          <CardDescription>下载模板文件，按格式填写商品编码</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleDownloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            下载模板
          </Button>
        </CardContent>
      </Card>

      {/* 文件上传和处理 */}
      <Card>
        <CardHeader>
          <CardTitle>第二步：上传并处理</CardTitle>
          <CardDescription>支持.xlsx、.xls和.csv格式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Button variant="outline" onClick={handleSelectFile} disabled={processing}>
              <Upload className="mr-2 h-4 w-4" />
              选择文件
            </Button>
            {fileName && (
              <p className="mt-2 text-sm text-muted-foreground">已选择: {fileName}</p>
            )}
          </div>

          <Button
            onClick={handleProcess}
            disabled={!filePath || processing || hasData === false}
            className="w-full"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                处理中...
              </>
            ) : (
              '开始批量查询'
            )}
          </Button>

          {processing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center text-muted-foreground">{progress.toFixed(0)}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 处理结果 */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>处理结果</CardTitle>
            <CardDescription>批量查询完成</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">总数</p>
                <p className="text-2xl font-bold">{results.total}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">成功</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {results.success}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">失败</p>
                <p className="text-2xl font-bold text-destructive">{results.errors.length}</p>
              </div>
            </div>

            {results.errors.length > 0 && (
              <div className="rounded-lg bg-destructive/10 p-3 space-y-1 max-h-40 overflow-y-auto">
                <p className="text-sm font-medium text-destructive">错误详情：</p>
                {results.errors.slice(0, 10).map((error, index) => (
                  <p key={index} className="text-sm text-muted-foreground">
                    • {error}
                  </p>
                ))}
                {results.errors.length > 10 && (
                  <p className="text-sm text-muted-foreground">... 还有 {results.errors.length - 10} 条错误</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Button className="w-full" onClick={handleOpenResult}>
                <ExternalLink className="mr-2 h-4 w-4" />
                打开查询结果
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                结果已保存至: {results.outputPath}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
