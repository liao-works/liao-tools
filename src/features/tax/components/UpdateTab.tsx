import { useState, useEffect } from 'react';
import { RefreshCw, Download, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { mockCheckUpdate, mockDownloadUpdate, mockVersionInfo } from '@/mocks/tax';
import type { TaxVersionInfo } from '@/types';

export function UpdateTab() {
  const [versionInfo, setVersionInfo] = useState<TaxVersionInfo>(mockVersionInfo);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleCheckUpdate = async () => {
    setChecking(true);
    setLogs([]);
    addLog('开始检查更新...');

    try {
      const data = await mockCheckUpdate();
      setVersionInfo(data);
      addLog('检查完成');
      
      if (data.hasUpdate) {
        addLog(`发现新版本: ${data.remote.version}`);
        addLog(`新增记录: ${data.remote.records - data.local.records} 条`);
      } else {
        addLog('当前已是最新版本');
      }
    } catch (error) {
      addLog(`检查失败: ${error}`);
    } finally {
      setChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setDownloading(true);
    setDownloadProgress(0);
    addLog('开始下载更新...');

    try {
      await mockDownloadUpdate((downloaded, total, percentage) => {
        setDownloadProgress(percentage);
        if (percentage % 25 === 0 && percentage > 0 && percentage < 100) {
          addLog(`下载进度: ${percentage}%`);
        }
      });
      addLog('下载完成');
      addLog('正在安装更新...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      addLog('更新安装成功！');
      
      // 更新本地版本信息
      setVersionInfo({
        ...versionInfo,
        local: versionInfo.remote,
        hasUpdate: false,
      });
    } catch (error) {
      addLog(`更新失败: ${error}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 版本对比 */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* 本地版本 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              本地版本
            </CardTitle>
            <CardDescription>当前使用的数据版本</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">版本号</span>
              <span className="text-sm font-medium">{versionInfo.local.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">记录数</span>
              <span className="text-sm font-medium">{versionInfo.local.records.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">更新日期</span>
              <span className="text-sm font-medium">{versionInfo.local.date}</span>
            </div>
          </CardContent>
        </Card>

        {/* 远程版本 */}
        <Card className={versionInfo.hasUpdate ? 'border-primary' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${versionInfo.hasUpdate ? 'bg-green-500' : 'bg-gray-400'}`} />
              远程版本
            </CardTitle>
            <CardDescription>
              {versionInfo.hasUpdate ? '🎉 有可用更新' : '✅ 已是最新版本'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">版本号</span>
              <span className="text-sm font-medium">{versionInfo.remote.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">记录数</span>
              <span className="text-sm font-medium">{versionInfo.remote.records.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">发布日期</span>
              <span className="text-sm font-medium">{versionInfo.remote.date}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 操作按钮 */}
      <Card>
        <CardHeader>
          <CardTitle>更新操作</CardTitle>
          <CardDescription>检查并下载最新的税率数据</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleCheckUpdate} disabled={checking} className="flex-1">
              {checking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  检查中...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  检查更新
                </>
              )}
            </Button>
            <Button
              onClick={handleDownloadUpdate}
              disabled={!versionInfo.hasUpdate || downloading}
              variant={versionInfo.hasUpdate ? 'default' : 'secondary'}
              className="flex-1"
            >
              {downloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  下载中...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  立即更新
                </>
              )}
            </Button>
          </div>

          {downloading && (
            <div className="space-y-2">
              <Progress value={downloadProgress} />
              <p className="text-sm text-center text-muted-foreground">
                {downloadProgress.toFixed(1)}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 更新日志 */}
      {versionInfo.changelog && versionInfo.changelog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>更新日志</CardTitle>
            <CardDescription>最近的数据更新记录</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {versionInfo.changelog.map((log, index) => (
                <div key={index} className="flex gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{log.message}</p>
                    <p className="text-xs text-muted-foreground">{log.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 操作日志 */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>操作日志</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted p-4">
              <div className="space-y-1 font-mono text-sm">
                {logs.map((log, index) => (
                  <div key={index} className="text-muted-foreground">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
