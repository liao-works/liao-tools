import { useState } from 'react';
import { Search, Loader2, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockExactSearch, mockFuzzySearch } from '@/mocks/tax';
import type { TaxTariff } from '@/types';

export function SingleQueryTab() {
  const [code, setCode] = useState('');
  const [fuzzyMode, setFuzzyMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TaxTariff[]>([]);

  const handleSearch = async () => {
    if (!code.trim()) return;

    setLoading(true);
    setResults([]);

    try {
      if (fuzzyMode) {
        const data = await mockFuzzySearch(code);
        setResults(data);
      } else {
        const data = await mockExactSearch(code);
        setResults(data ? [data] : []);
      }
    } catch (error) {
      console.error('查询失败:', error);
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
  };

  const openUrl = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-4">
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
            <Button onClick={handleSearch} disabled={loading || !code.trim()}>
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
                  <TableHead>描述</TableHead>
                  <TableHead>英国税率</TableHead>
                  <TableHead>北爱尔兰税率</TableHead>
                  {fuzzyMode && <TableHead>相似度</TableHead>}
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono">{result.code}</TableCell>
                    <TableCell className="max-w-xs truncate">{result.description}</TableCell>
                    <TableCell className="font-medium">{result.rate}</TableCell>
                    <TableCell className="font-medium">{result.northIrelandRate}</TableCell>
                    {fuzzyMode && (
                      <TableCell>
                        {result.similarity ? `${(result.similarity * 100).toFixed(1)}%` : '-'}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => copyToClipboard(result.rate)}
                          title="复制英国税率"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openUrl(result.url)}
                          title="打开英国税率网址"
                        >
                          <ExternalLink className="h-3 w-3" />
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

      {/* 空状态 */}
      {!loading && results.length === 0 && code && (
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
