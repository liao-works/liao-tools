import { useState } from 'react';
import { Search, Loader2, AlertCircle, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { altaApi } from '@/lib/api/alta';
import type { AltaQueryResult } from '@/types';
import { useToast } from '@/hooks/use-toast';

/**
 * 解析原始文本，获取主编码和例外编码
 */
function parseRawText(rawText: string | null | undefined): { main: string[]; exceptions: string[] } {
  if (!rawText) {
    return { main: [], exceptions: [] };
  }


  // 检查是否有例外标记（俄语或中文）
  const hasException = rawText.includes('за исключением') ||
                       rawText.includes('кроме') ||
                       rawText.includes('[含例外]');

  if (!hasException) {
    // 没有例外，所有编码都是主编码
    const codes = rawText.match(/\d{4,10}/g) || [];
    return { main: codes, exceptions: [] };
  }

  // 有例外，分离主编码和例外编码
  const exceptionPart = rawText.split(/за исключением|кроме/)[1] || '';
  const mainPart = rawText.split(/за исключением|кроме/)[0] || '';


  const exceptions = exceptionPart.match(/\d{4,10}/g) || [];
  const main = mainPart.match(/\d{4,10}/g) || [];


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
  const [inputError, setInputError] = useState('');
  const [queryError, setQueryError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const { toast } = useToast();

  const handleQuery = async () => {
    const normalized = code.replace(/[\\s-]/g, '');
    if (!/^\\d{4,10}$/.test(normalized) || (matchLength != null && normalized.length < matchLength)) {
      setInputError(matchLength != null
        ? `请输入至少 ${matchLength} 位、最多 10 位的数字编码。`
        : '请输入 4–10 位有效的数字编码。');
      return;
    }
    setLoading(true);
    setInputError('');
    setQueryError('');
    setHasSearched(true);
    setResult(null);
    try {
      const data = await altaApi.querySingle(normalized, matchLength);

      setResult(data);
    } catch (error: any) {
      console.error('查询失败:', error);
      setQueryError(error?.code === 'DATABASE_EMPTY' ? '本地禁运数据库为空，请先完成数据更新。' :
        error?.message || '查询失败，请检查本地数据库后重试。');
      
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
      <Card className="lt-alta-query-card">
        <CardHeader>
          <CardTitle>HS Code 禁运条目检查</CardTitle>
          <CardDescription>按选定编码位数匹配本地 Alta 数据，结果保留原始条目和例外提示</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="lt-alta-search-fields">
            <div className="lt-alta-input-field">
              <label htmlFor="alta-hs-code">商品编码 <span>HS Code</span></label>
              <div className="lt-alta-input-wrap">
                <Search size={17} aria-hidden="true"/>
                <Input id="alta-hs-code" placeholder="例如：0101210000" value={code}
                  inputMode="numeric" maxLength={24} aria-invalid={!!inputError}
                  aria-describedby={inputError ? 'alta-input-error' : 'alta-code-help'}
                  onChange={e => {setCode(e.target.value);setResult(null);setInputError('');setQueryError('');setHasSearched(false);}}
                  onKeyDown={handleKeyPress}/>
                {code && <button type="button" aria-label="清空编码" onClick={() => {
                  setCode('');setResult(null);setInputError('');setQueryError('');setHasSearched(false);
                }}><X size={16}/></button>}
              </div>
            </div>
            <div className="lt-alta-match-field">
              <label htmlFor="alta-match-length">匹配位数</label>
              <Select value={matchLength?.toString() || 'full'} onValueChange={v => {
                setMatchLength(v === 'full' ? undefined : Number(v));setResult(null);setInputError('');setHasSearched(false);
              }}>
                <SelectTrigger id="alta-match-length"><SelectValue placeholder="匹配位数"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4 位匹配</SelectItem>
                  <SelectItem value="6">6 位匹配</SelectItem>
                  <SelectItem value="8">8 位匹配</SelectItem>
                  <SelectItem value="full">完整编码</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="lt-alta-submit" onClick={handleQuery} disabled={loading || !code.trim()}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>查询中…</> :
                <><Search className="mr-2 h-4 w-4"/>检查禁运</>}
            </Button>
          </div>
          <p className="lt-alta-form-note" id="alta-code-help">默认按前 6 位匹配。4 / 6 / 8 位或完整编码匹配范围不同，请结合原始条目和例外条件判断。</p>
          {inputError && <p id="alta-input-error" className="lt-alta-input-error" role="alert">{inputError}</p>}
          {queryError && <p className="lt-alta-input-error" role="alert">{queryError}</p>}
        </CardContent>
      </Card>
      {!result && !hasSearched && !queryError &&
        <div className="lt-alta-idle">
          <img src="/illustrations/alta-inspection.svg" alt="" aria-hidden="true"/>
          <div><strong>输入商品编码，即可开始检查</strong><p>结果将展示匹配编码、匹配级别及例外信息；未命中不等于全面合规。</p></div>
        </div>}

      {/* 结果显示 */}
      {result && (
        <Card className="lt-alta-result-card">
          <CardHeader>
            <CardTitle>查询结果 · {result.code}</CardTitle>
            <CardDescription>匹配级别：{matchLength == null ? '完整编码' : `${matchLength} 位`} · 匹配条目 {result.matched_items?.length || 0} 项</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className={`lt-alta-verdict ${result.description === '无效的HS编码' || result.description.startsWith('编码长度不足') ? 'lt-alta-verdict--invalid' : result.status === 'forbidden' ? 'lt-alta-verdict--hit' : 'lt-alta-verdict--clear'}`}>
                <span className="lt-alta-verdict-icon">
                  {result.status === 'forbidden' ? <ShieldAlert size={24}/> : <CheckCircle2 size={24}/>}
                </span>
                <div>
                  <strong>{result.description === '无效的HS编码' || result.description.startsWith('编码长度不足')
                    ? '编码无效' : result.status === 'forbidden' ? '命中禁运条目' : '当前数据库未命中'}</strong>
                  <p>{result.status === 'forbidden'
                    ? '至少存在一条匹配的限制记录。请核对商品说明、例外条款与实际适用条件。'
                    : '未找到当前匹配级别的禁运条目。这不是货物全面合规或允许出口的结论。'}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                此结果仅反映当前 Alta 数据库的编码匹配情况；存在例外时应核对原始条目。
                “未命中”不代表货物在所有贸易限制下均可出口。
              </p>
              {/* 描述 */}
              <div>
                <span className="text-sm font-medium">商品描述：</span>
                <p className="mt-1 text-sm text-muted-foreground">{result.description}</p>
              </div>

              {/* 匹配项表格 */}
              {result.matched_items && result.matched_items.length > 0 && (
                <div>
                  <span className="text-sm font-medium">匹配项：</span>
                  <div className="lt-alta-result-table"><Table className="mt-2">
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
                            <TableCell className="max-w-[380px] whitespace-normal break-words leading-6" title={item.description}>
                              {item.description}
                            </TableCell>
                            <TableCell>{item.level}位匹配</TableCell>
                            <TableCell>
                              {hasEx ? (
                                <div className="flex items-start gap-1">
                                  <AlertCircle className="h-4 w-4 text-warning-fg mt-0.5 flex-shrink-0" />
                                  <div className="flex flex-wrap gap-1">
                                    {exceptions.length > 0 ? (
                                      exceptions.map((exc, idx) => (
                                        <span
                                          key={idx}
                                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-warning-subtle text-warning-fg text-xs font-medium"
                                        >
                                          {exc}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-xs text-warning-fg">
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
                  </Table></div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
