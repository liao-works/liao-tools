import { useState, useEffect } from 'react';
import { Search, Loader2, Copy, ExternalLink, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { taxApi } from '@/lib/api/tax';
import type { TaxTariff } from '@/types';

export function SingleQueryTab() {
  const [code, setCode] = useState('');
  const [fuzzyMode, setFuzzyMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TaxTariff[]>([]);
  const [searched, setSearched] = useState(false); // 标记是否已搜索
  const [hasData, setHasData] = useState<boolean | null>(null);
  const { toast } = useToast();

  // 检查数据是否存在
  useEffect(() => {
    const checkData = async () => {
      const exists = await taxApi.checkDataExists();
      setHasData(exists);
    };
    checkData();
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
    toast({
      title: '开发中',
      description: '自动更新功能正在开发中',
    });
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
                          title="自动更新当前行"
                        >
                          <RefreshCw className="h-3 w-3" />
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
    </div>
  );
}
