import { useState, useEffect } from 'react';
import { Search, Loader2, Copy, ExternalLink, AlertCircle, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { taxApi } from '@/lib/api/tax';
import { listen } from '@tauri-apps/api/event';
import type { TaxTariff } from '@/types';

interface UpdateLog {
  code: string;
  message: string;
  level: 'info' | 'success' | 'error';
  timestamp: number;
}

interface UpdateProgress {
  code: string;
  progress: number;
  stage: string;
}

export function SingleQueryTab() {
  const [code, setCode] = useState('');
  const [fuzzyMode, setFuzzyMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TaxTariff[]>([]);
  const [searched, setSearched] = useState(false); // 标记是否已搜索
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [updatingCode, setUpdatingCode] = useState<string | null>(null); // 正在更新的商品编码
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [updateLogs, setUpdateLogs] = useState<UpdateLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const { toast } = useToast();

  // 检查数据是否存在
  useEffect(() => {
    const checkData = async () => {
      const exists = await taxApi.checkDataExists();
      setHasData(exists);
    };
    checkData();
  }, []);

  // 监听更新进度和日志事件
  useEffect(() => {
    let isMounted = true;
    let progressUnlisten: (() => void) | undefined;
    let logUnlisten: (() => void) | undefined;

    const setupListeners = async () => {
      // 监听进度事件
      const progressListener = await listen<UpdateProgress>('update-progress', (event) => {
        if (!isMounted) return;
        setUpdateProgress(event.payload);
        if (event.payload.progress === 100) {
          // 更新完成后2秒清除进度条和关闭日志窗口
          setTimeout(() => {
            if (isMounted) {
              setUpdateProgress(null);
              setShowLogs(false);
              // 再延迟一点清理日志数据
              setTimeout(() => {
                if (isMounted) {
                  setUpdateLogs([]);
                }
              }, 300);
            }
          }, 2000);
        }
      });

      // 监听日志事件
      const logListener = await listen<Omit<UpdateLog, 'timestamp'>>('update-log', (event) => {
        if (!isMounted) return;
        const log: UpdateLog = {
          ...event.payload,
          timestamp: Date.now(),
        };
        setUpdateLogs((prev) => {
          // 防止重复日志（检查最后一条日志是否相同）
          const lastLog = prev[prev.length - 1];
          if (lastLog && 
              lastLog.code === log.code && 
              lastLog.message === log.message && 
              Math.abs(lastLog.timestamp - log.timestamp) < 100) {
            // 如果是100毫秒内的相同日志，认为是重复的
            return prev;
          }
          return [...prev, log];
        });
        setShowLogs(true);
      });

      if (isMounted) {
        progressUnlisten = progressListener;
        logUnlisten = logListener;
      } else {
        // 如果组件已卸载，立即清理
        progressListener();
        logListener();
      }
    };

    setupListeners();

    return () => {
      isMounted = false;
      if (progressUnlisten) progressUnlisten();
      if (logUnlisten) logUnlisten();
    };
  }, []);

  const handleSearch = async () => {
    if (!code.trim()) return;

    setLoading(true);
    setResults([]);
    setSearched(true); // 标记已搜索

    try {
      if (fuzzyMode) {
        const data = await taxApi.fuzzySearch(code);
        setResults(data);
      } else {
        const data = await taxApi.exactSearch(code);
        setResults(data ? [data] : []);
      }
    } catch (error) {
      console.error('查询失败:', error);
      toast({
        title: '查询失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: '复制成功',
      description: '税率已复制到剪贴板',
    });
  };

  const openUrl = async (url: string) => {
    try {
      await taxApi.openUrl(url);
    } catch (error) {
      console.error('打开网址失败:', error);
      toast({
        title: '打开失败',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleAutoUpdate = async (tariff: TaxTariff) => {
    setUpdatingCode(tariff.code);
    setUpdateLogs([]); // 清空之前的日志
    
    try {
      const result = await taxApi.updateSingleRow(tariff.code);
      
      if (result.success) {
        // 更新本地状态中的数据
        setResults((prev) =>
          prev.map((item) => {
            if (item.code === tariff.code) {
              return {
                ...item,
                rate: result.newUkRate || item.rate,
                north_ireland_rate: result.newNiRate || item.north_ireland_rate,
                description: result.newDescription || item.description,
              };
            }
            return item;
          })
        );
        
        toast({
          title: '更新成功',
          description: result.message,
        });
      } else {
        toast({
          title: '更新失败',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('更新失败:', error);
      toast({
        title: '更新失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setUpdatingCode(null);
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
                  请先在「数据更新」标签页下载税率数据后再进行查询
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 搜索区域 */}
      <Card>
        <CardHeader>
          <CardTitle>税率查询</CardTitle>
          <CardDescription>输入商品编码查询其税率信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="请输入商品编码，如：0101210000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={loading || !code.trim() || hasData === false}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  查询中
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  查询
                </>
              )}
            </Button>
          </div>

          {/* 模糊匹配开关 */}
          <div className="flex items-center space-x-2">
            <Switch id="fuzzy-mode" checked={fuzzyMode} onCheckedChange={setFuzzyMode} />
            <Label htmlFor="fuzzy-mode">
              模糊匹配
              <span className="ml-2 text-xs text-muted-foreground">
                （启用后将搜索相似编码）
              </span>
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* 结果表格 */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>查询结果</CardTitle>
            <CardDescription>
              找到 {results.length} 条记录
              {fuzzyMode && '（按相似度排序）'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品编码</TableHead>
                  <TableHead>英国税率</TableHead>
                  <TableHead>北爱尔兰税率</TableHead>
                  <TableHead>反倾销税率</TableHead>
                  <TableHead>反补贴税率</TableHead>
                  {fuzzyMode && <TableHead>相似度</TableHead>}
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono">{result.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{result.rate}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(result.rate)}
                          title="复制英国税率"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">
                          {result.north_ireland_rate || result.northIrelandRate || '-'}
                        </span>
                        {(result.north_ireland_rate || result.northIrelandRate) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              copyToClipboard(
                                result.north_ireland_rate || result.northIrelandRate || ''
                              )
                            }
                            title="复制北爱尔兰税率"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">
                          {result.anti_dumping_rate || '-'}
                        </span>
                        {result.anti_dumping_rate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(result.anti_dumping_rate || '')}
                            title="复制反倾销税率"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">
                          {result.countervailing_rate || '-'}
                        </span>
                        {result.countervailing_rate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(result.countervailing_rate || '')}
                            title="复制反补贴税率"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    {fuzzyMode && (
                      <TableCell>
                        {result.similarity ? `${(result.similarity * 100).toFixed(1)}%` : '-'}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openUrl(result.url)}
                          title="打开英国税率网址"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                        {result.north_ireland_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openUrl(result.north_ireland_url!)}
                            title="打开北爱尔兰税率网址"
                          >
                            <ExternalLink className="h-3 w-3 text-blue-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleAutoUpdate(result)}
                          disabled={updatingCode === result.code}
                          title="自动更新当前行"
                        >
                          {updatingCode === result.code ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 空状态 - 只在已搜索且无结果时显示 */}
      {!loading && results.length === 0 && searched && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <p className="text-muted-foreground">未找到匹配的税率信息</p>
            <p className="text-sm text-muted-foreground mt-2">
              请尝试{fuzzyMode ? '精确查询' : '模糊查询'}模式
            </p>
          </CardContent>
        </Card>
      )}

      {/* 底部进度条 */}
      {updateProgress && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 z-50">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">
                  正在更新商品 {updateProgress.code}
                </span>
                <span className="text-sm text-muted-foreground">
                  {updateProgress.stage}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                {updateProgress.progress}%
              </span>
            </div>
            <Progress value={updateProgress.progress} className="h-2" />
          </div>
        </div>
      )}

      {/* 右下角日志窗口 */}
      {showLogs && updateLogs.length > 0 && (
        <div className="fixed bottom-20 right-4 w-96 bg-background border rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between p-3 border-b">
            <h3 className="text-sm font-medium">更新日志</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setShowLogs(false);
                // 关闭时清理日志，避免下次显示旧日志
                setTimeout(() => setUpdateLogs([]), 300);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-80 overflow-y-auto p-3 space-y-2 text-sm font-mono">
            {updateLogs.map((log, index) => (
              <div
                key={index}
                className={`flex gap-2 ${
                  log.level === 'error'
                    ? 'text-red-600'
                    : log.level === 'success'
                    ? 'text-green-600'
                    : 'text-muted-foreground'
                }`}
              >
                <span className="text-xs opacity-60">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
