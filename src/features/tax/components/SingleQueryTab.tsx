import { useState, useEffect } from 'react';
import { Search, Loader2, Copy, ExternalLink, AlertCircle, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { taxApi } from '@/lib/api/tax';
import { listen } from '@tauri-apps/api/event';
import type { TaxTariff } from '@/types';
import { TaxResultDetail } from './TaxResultDetail';
import { Link } from 'react-router-dom';
import { validateTaxHsCode } from '@/lib/hs-code';
import { displayedRate, displayedRateStatus, rateNeedsAttention } from '@/lib/tariff-display';

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


function TariffOverview({ tariff }: { tariff: TaxTariff }) {
  const niRate = tariff.north_ireland_rate || tariff.northIrelandRate;
  const cards = [
    { label: '英国 (GB) 进口税率', rate: tariff.rate, status: tariff.uk_rate_status },
    { label: '北爱尔兰 (NI) 进口税率', rate: niRate, status: tariff.ni_rate_status },
    { label: '反倾销税率', rate: tariff.anti_dumping_rate },
    { label: '反补贴税率', rate: tariff.countervailing_rate },
  ];
  return <div className="lt-rate-grid">
    {cards.map(item => {
      const status = displayedRateStatus(item.rate, item.status);
      return <div className="lt-rate-card" key={item.label}>
        <span className="lt-rate-label">{item.label}</span>
        <strong>{displayedRate(item.rate)}</strong>
        {status && <span className="lt-rate-state lt-rate-state--review">{status}</span>}
      </div>;
    })}
  </div>;
}

export function SingleQueryTab() {
  const [code, setCode] = useState('');
  const [fuzzyMode, setFuzzyMode] = useState(false);
  const [inputError, setInputError] = useState('');
  const [requestError, setRequestError] = useState('');
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
    const validation = validateTaxHsCode(code, fuzzyMode);
    if (!validation.ok) {
      setInputError(validation.message);
      return;
    }
    setInputError('');
    setRequestError('');
    setLoading(true);
    setResults([]);
    setSearched(true); // 标记已搜索

    try {
      if (fuzzyMode) {
        const data = await taxApi.fuzzySearch(validation.code);
        setResults(data);
      } else {
        const data = await taxApi.exactSearch(validation.code);
        setResults(data ? [data] : []);
      }
    } catch (error) {
      console.error('查询失败:', error);
      setRequestError('查询失败，请检查本地数据库或稍后重试。');
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
        // HTML parsing is comparison only; never replace a verified local rate.
        toast({
          title: '网页比对完成（未修改本地数据）',
          description: result.message,
        });
      } else {
        toast({
          title: '网页比对失败',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('网页比对失败:', error);
      toast({
        title: '网页比对失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setUpdatingCode(null);
    }
  };

  return (
    <div className="lt-tax-query space-y-4">
      {/* 数据检查提示 */}
      {hasData === false && (
        <Card className="border-warning bg-warning-subtle">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning-fg mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-warning-subtle-fg">
                  数据库为空
                </h3>
                <p className="text-sm text-warning-fg mt-1">
                  请先下载本地税率数据库，再进行精确或模糊查询。
                </p>
                <Link to="/tax?tab=update" className="lt-tax-install-link">前往数据更新 →</Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      <Card className="lt-tax-form">
        <CardHeader>
          <CardTitle>商品编码查询</CardTitle>
          <CardDescription>默认查询中国原产商品进入英国的普通第三国进口税率；空值显示 —，特殊条件税率不自动套用</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="lt-tax-form-fields">
            <div className="lt-hs-field">
              <label htmlFor="lt-hs-input">输入商品编码 <small>HS Code</small></label>
              <div className="lt-hs-input-wrap">
                <Search size={17} aria-hidden="true"/>
                <Input id="lt-hs-input" inputMode="numeric" maxLength={24} value={code}
                  placeholder={fuzzyMode ? '输入 4–10 位商品编码' : '例如：0101210000'}
                  aria-invalid={!!inputError} aria-describedby={inputError ? 'lt-code-error' : 'lt-code-help'}
                  onChange={e => {setCode(e.target.value);setInputError('');setRequestError('');setSearched(false);setResults([]);}}
                  onKeyDown={handleKeyPress}/>
                {code && <button type="button" aria-label="清空编码" title="清空编码"
                  onClick={() => {setCode('');setInputError('');setRequestError('');setSearched(false);setResults([]);}}>
                  <X size={16}/>
                </button>}
              </div>
            </div>
            <div className="lt-query-mode">
              <span className="lt-query-mode-label">查询方式</span>
              <div className="lt-query-mode-options" role="group" aria-label="查询方式">
                <button type="button" className={!fuzzyMode ? 'is-active' : ''} aria-pressed={!fuzzyMode}
                  onClick={() => {setFuzzyMode(false);setInputError('');setRequestError('');setSearched(false);setResults([]);}}>精确</button>
                <button type="button" className={fuzzyMode ? 'is-active' : ''} aria-pressed={fuzzyMode}
                  onClick={() => {setFuzzyMode(true);setInputError('');setRequestError('');setSearched(false);setResults([]);}}>模糊</button>
              </div>
            </div>
            <Button className="lt-tax-run" onClick={handleSearch}
              disabled={loading || !code.trim() || hasData === false}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>查询中…</>
                : <><Search className="mr-2 h-4 w-4"/>开始查询</>}
            </Button>
          </div>
          <p className="lt-tax-hint" id="lt-code-help">{fuzzyMode
            ? '模糊查询支持 4–10 位编码；相似结果仅供选码，不能直接作为税率依据。'
            : '精确查询请输入 10 位商品编码，允许包含空格或连字符。'}</p>
          {inputError && <p role="alert" id="lt-code-error" className="lt-tax-validation">{inputError}</p>}
          {requestError && <p role="alert" className="lt-tax-validation">{requestError}</p>}
        </CardContent>
      </Card>

      {/* 结果表格 */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{results.length === 1 && !fuzzyMode ? `查询结果 · ${results[0].code}` : '查询结果'}</CardTitle>
            <CardDescription>
              {results.length === 1 && !fuzzyMode && results[0].description ? results[0].description : `找到 ${results.length} 条记录`}
              {fuzzyMode && '（相似编码仅供选择，不代表税率相同）'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {results.length === 1 && !fuzzyMode && <TariffOverview tariff={results[0]}/>}
            {results.length === 1 && !fuzzyMode &&
              <TaxResultDetail tariff={results[0]} onCopy={copyToClipboard}
                onOpenSource={openUrl} onCompare={handleAutoUpdate}
                comparing={updatingCode === results[0].code}/>}
            {(fuzzyMode || results.length !== 1) && <div className="lt-result-table"><Table>
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
                        <div className="flex flex-col">
                          <span className="font-medium">{displayedRate(result.rate)}</span>
                          {rateNeedsAttention(result.rate, result.uk_rate_status) && (
                            <span className="text-xs text-muted-foreground">
                              {displayedRateStatus(result.rate, result.uk_rate_status)}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(result.rate)}
                          disabled={!result.rate}
                          title="复制英国税率"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">
                          {displayedRate(result.north_ireland_rate || result.northIrelandRate)}
                          {rateNeedsAttention(result.north_ireland_rate || result.northIrelandRate, result.ni_rate_status) && (
                            <span className="block text-xs text-muted-foreground">
                              {displayedRateStatus(result.north_ireland_rate || result.northIrelandRate, result.ni_rate_status)}
                            </span>
                          )}
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
                          {displayedRate(result.anti_dumping_rate)}
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
                          {displayedRate(result.countervailing_rate)}
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
                            <ExternalLink className="h-3 w-3 text-info-fg" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleAutoUpdate(result)}
                          disabled={updatingCode === result.code}
                          title="网页临时比对（不修改本地数据）"
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
            </Table></div>}
          </CardContent>
        </Card>
      )}

      {/* 空状态 - 只在已搜索且无结果时显示 */}
      {!loading && results.length === 0 && searched && !requestError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <img src="/illustrations/empty-query.svg" alt="" aria-hidden="true" className="lt-tax-no-result-art"/>
            <p className="font-medium text-foreground">没有匹配的本地税率记录</p>
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
                  正在比对商品 {updateProgress.code}
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
            <h3 className="text-sm font-medium">比对日志</h3>
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
                    ? 'text-danger-fg'
                    : log.level === 'success'
                    ? 'text-success-fg'
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
