import { useState, useEffect } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { altaApi } from '@/lib/api/alta';
import type { AltaDbStats } from '@/types';
import { useToast } from '@/hooks/use-toast';

export function DataManageTab() {
  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [dbStats, setDbStats] = useState<AltaDbStats | null>(null);
  const { toast } = useToast();

  const loadDbInfo = async () => {
    try {
      const info = await altaApi.getDatabaseInfo();
      setDbStats(info);
    } catch (error) {
      console.error('加载数据库信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDbInfo();
  }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    setLogs([]);

    const addLog = (message: string) => {
      setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    };

    try {
      addLog('开始连接Alta.ru网站...');
      const canConnect = await altaApi.testAltaConnection();
      
      if (!canConnect) {
        addLog('无法连接到Alta.ru，请检查网络连接');
        throw new Error('无法连接到Alta.ru');
      }
      
      addLog('连接成功，开始获取禁运数据...');
      
      const result = await altaApi.updateDatabase();
      
      addLog(`成功获取 ${result.items_count} 条禁运数据`);
      addLog('正在保存到本地数据库...');
      addLog(result.message);
      
      // 重新加载数据库信息
      await loadDbInfo();
      
      toast({
        title: '更新成功',
        description: result.message,
      });
    } catch (error: any) {
      console.error('更新失败:', error);
      addLog(`错误: ${error.message || '更新失败'}`);
      toast({
        title: '更新失败',
        description: error.message || '请检查网络连接或稍后重试',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 数据库信息 */}
      <Card>
        <CardHeader>
          <CardTitle>数据库状态</CardTitle>
          <CardDescription>本地禁运数据库信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : dbStats ? (
            <>
              {/* 数据库为空时的警告 */}
              {dbStats.total_items === 0 && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-amber-600 dark:text-amber-400">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                        数据库为空
                      </p>
                      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                        在使用查询功能前，请先点击下方按钮更新禁运数据
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">总记录数</p>
                  <p className={`text-2xl font-bold ${dbStats.total_items === 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                    {dbStats.total_items.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">最后更新</p>
                  <p className="text-sm font-medium">
                    {dbStats.last_update 
                      ? new Date(dbStats.last_update).toLocaleString('zh-CN')
                      : '从未更新'}
                  </p>
                </div>
              </div>

              <Button 
                onClick={handleUpdate} 
                disabled={updating} 
                className="w-full"
                variant={dbStats.total_items === 0 ? 'default' : 'outline'}
              >
                {updating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    更新中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {dbStats.total_items === 0 ? '立即更新数据' : '更新禁运数据'}
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <p>数据库未初始化</p>
              <Button onClick={handleUpdate} className="mt-4">
                <RefreshCw className="mr-2 h-4 w-4" />
                首次更新
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 操作日志 */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>操作日志</CardTitle>
            <CardDescription>数据更新过程记录</CardDescription>
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

      {/* 数据统计 */}
      {dbStats && (
        <Card>
          <CardHeader>
            <CardTitle>数据统计</CardTitle>
            <CardDescription>禁运数据库详细信息</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">数据库大小</span>
                <span className="text-sm font-medium">
                  {(dbStats.db_size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">数据来源</span>
                <span className="text-sm font-medium">alta.ru</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">更新频率</span>
                <span className="text-sm font-medium">建议每周一次</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">数据完整性</span>
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  {dbStats.total_items > 0 ? '✓ 完整' : '⚠ 待更新'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
