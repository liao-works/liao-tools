import { useState } from 'react';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { altaApi } from '@/lib/api/alta';
import type { AltaQueryResult, AltaMatchedItem } from '@/types';
import { useToast } from '@/hooks/use-toast';

/**
 * 解析原始文本，获取主编码和例外编码
 */
function parseRawText(rawText: string | null | undefined): { main: string[]; exceptions: string[] } {
  if (!rawText) {
    console.log('parseRawText: raw_text 为空');
    return { main: [], exceptions: [] };
  }

  console.log('parseRawText 输入:', rawText);

  // 检查是否有例外标记（俄语或中文）
  const hasException = rawText.includes('за исключением') ||
                       rawText.includes('кроме') ||
                       rawText.includes('[含例外]');

  if (!hasException) {
    // 没有例外，所有编码都是主编码
    const codes = rawText.match(/\d{4,10}/g) || [];
    console.log('parseRawText: 无例外，编码:', codes);
    return { main: codes, exceptions: [] };
  }

  // 有例外，分离主编码和例外编码
  const exceptionPart = rawText.split(/за исключением|кроме/)[1] || '';
  const mainPart = rawText.split(/за исключением|кроме/)[0] || '';

  console.log('主编码部分:', mainPart);
  console.log('例外编码部分:', exceptionPart);

  const exceptions = exceptionPart.match(/\d{4,10}/g) || [];
  const main = mainPart.match(/\d{4,10}/g) || [];

  console.log('解析结果 - 主编码:', main, '例外编码:', exceptions);

  return { main, exceptions };
}

/**
 * 检查项目是否包含例外（综合判断）
 */
function hasExceptions(item: {
  raw_text?: string | null;
  has_exceptions?: boolean | null;
  description?: string;
}): boolean {
  // 1. 优先使用 has_exceptions 字段
  if (item.has_exceptions === true) return true;

  // 2. 检查 raw_text 中是否有例外标记
  if (item.raw_text) {
    const hasException = item.raw_text.includes('за исключением') ||
                        item.raw_text.includes('кроме');
    if (hasException) return true;
  }

  // 3. 检查描述中是否有 [含例外] 标记
  if (item.description?.includes('[含例外]')) return true;

  return false;
}

interface QueryTabProps {
  onSwitchToManage: () => void;
}

export function QueryTab({ onSwitchToManage }: QueryTabProps) {
  const [code, setCode] = useState('');
  const [matchLength, setMatchLength] = useState<number | undefined>(6);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AltaQueryResult | null>(null);
  const { toast } = useToast();

  const handleQuery = async () => {
    if (!code.trim()) return;

    setLoading(true);
    try {
      const data = await altaApi.querySingle(code, matchLength);

      // 调试日志
      console.log('查询结果:', data);
      console.log('matched_items:', data.matched_items);
      data.matched_items?.forEach((item: AltaMatchedItem, idx) => {
        console.log(`Item ${idx}:`, {
          code: item.code,
          description: item.description,
          raw_text: item.raw_text,
          has_exceptions: item.has_exceptions
        });
      });

      setResult(data);
    } catch (error: any) {
      console.error('查询失败:', error);
      
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
          title: '查询失败',
          description: error.message || '请检查网络连接或稍后重试',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuery();
    }
  };

  return (
    <div className="space-y-4">
      {/* 搜索区域 */}
      <Card>
        <CardHeader>
          <CardTitle>HS Code查询</CardTitle>
          <CardDescription>输入HS编码查询其禁运状态</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="请输入HS编码，如：0101210000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1"
              />
              <Select
                value={matchLength?.toString() || 'full'}
                onValueChange={(value) => setMatchLength(value === 'full' ? undefined : parseInt(value))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="匹配位数" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4位匹配</SelectItem>
                  <SelectItem value="6">6位匹配</SelectItem>
                  <SelectItem value="8">8位匹配</SelectItem>
                  <SelectItem value="full">完全匹配</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleQuery} disabled={loading || !code.trim()}>
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
          </div>
        </CardContent>
      </Card>

      {/* 结果显示 */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>查询结果</CardTitle>
            <CardDescription>HS Code: {result.code}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 状态显示 */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">状态：</span>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                    result.status === 'forbidden'
                      ? 'bg-destructive/20 text-destructive'
                      : 'bg-green-500/20 text-green-700 dark:text-green-400'
                  }`}
                >
                  {result.status === 'forbidden' ? '🚫 禁运' : '✅ 正常'}
                </span>
              </div>

              {/* 描述 */}
              <div>
                <span className="text-sm font-medium">商品描述：</span>
                <p className="mt-1 text-sm text-muted-foreground">{result.description}</p>
              </div>

              {/* 匹配项表格 */}
              {result.matched_items && result.matched_items.length > 0 && (
                <div>
                  <span className="text-sm font-medium">匹配项：</span>
                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">编码</TableHead>
                        <TableHead className="max-w-[300px]">描述</TableHead>
                        <TableHead className="w-[100px]">匹配级别</TableHead>
                        <TableHead>例外</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.matched_items.map((item, index) => {
                        const { exceptions } = parseRawText(item.raw_text);
                        const hasEx = hasExceptions(item);

                        return (
                          <TableRow key={index}>
                            <TableCell className="font-mono">{item.code}</TableCell>
                            <TableCell className="max-w-[300px] truncate" title={item.description}>
                              {item.description}
                            </TableCell>
                            <TableCell>{item.level}位匹配</TableCell>
                            <TableCell>
                              {hasEx ? (
                                <div className="flex items-start gap-1">
                                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                  <div className="flex flex-wrap gap-1">
                                    {exceptions.length > 0 ? (
                                      exceptions.map((exc, idx) => (
                                        <span
                                          key={idx}
                                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-medium"
                                        >
                                          {exc}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-xs text-amber-600 dark:text-amber-400">
                                        含例外
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
