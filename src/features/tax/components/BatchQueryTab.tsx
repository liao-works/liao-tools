import { useState, useRef } from 'react';
import { Upload, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { mockBatchQuery } from '@/mocks/tax';

export function BatchQueryTab() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ success: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResults(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setProcessing(true);
    setProgress(0);
    setResults(null);

    try {
      const data = await mockBatchQuery(file, (current, total) => {
        setProgress((current / total) * 100);
      });
      setResults({
        success: data.results.length,
        errors: data.errors,
      });
    } catch (error) {
      console.error('处理失败:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadTemplate = () => {
    // 创建简单的CSV模板
    const csvContent = '商品编码\n0101210000\n0201100000\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '税率查询模板.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={processing}
            >
              <Upload className="mr-2 h-4 w-4" />
              选择文件
            </Button>
            {file && (
              <p className="mt-2 text-sm text-muted-foreground">
                已选择: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          <Button onClick={handleProcess} disabled={!file || processing} className="w-full">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">成功查询</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {results.success}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">错误数量</p>
                <p className="text-2xl font-bold text-destructive">{results.errors.length}</p>
              </div>
            </div>

            {results.errors.length > 0 && (
              <div className="rounded-lg bg-destructive/10 p-3 space-y-1">
                <p className="text-sm font-medium text-destructive">错误详情：</p>
                {results.errors.map((error, index) => (
                  <p key={index} className="text-sm text-muted-foreground">
                    • {error}
                  </p>
                ))}
              </div>
            )}

            <Button className="w-full" variant="outline">
              <Download className="mr-2 h-4 w-4" />
              下载查询结果
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
