import { useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Search, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { altaApi } from '@/lib/api/alta';
import { parseHsCode, queryErrorMessage, isDatabaseEmptyError } from '@/lib/hs-code';
import type { AltaMatchedItem, AltaQueryResult } from '@/types';

type QueryState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; result: AltaQueryResult }
  | { kind: 'missing-database' }
  | { kind: 'error'; message: string };

function hasException(item: AltaMatchedItem): boolean {
  return item.has_exceptions === true ||
    /за исключением|кроме|\[含例外\]/i.test(item.raw_text || '') ||
    /\[含例外\]/.test(item.description || '');
}

interface QueryTabProps {
  onSwitchToManage: () => void;
}

export function QueryTab({ onSwitchToManage }: QueryTabProps) {
  const [code, setCode] = useState('');
  const [matchLength, setMatchLength] = useState<number | undefined>(6);
  const [state, setState] = useState<QueryState>({ kind: 'idle' });
  const [inputError, setInputError] = useState('');
  const requestId = useRef(0);

  function changeCode(next: string) {
    requestId.current += 1;
    setCode(next);
    setState({ kind: 'idle' });
    setInputError('');
  }

  function changeLength(next: number | undefined) {
    requestId.current += 1;
    setMatchLength(next);
    setState({ kind: 'idle' });
    setInputError('');
  }

  async function query(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === 'loading') return;
    const parsed = parseHsCode(code, matchLength ?? 4, 10);
    if (parsed.error) {
      setInputError(parsed.error);
      setState({ kind: 'idle' });
      return;
    }
    setInputError('');
    const current = ++requestId.current;
    setState({ kind: 'loading' });
    try {
      const result = await altaApi.querySingle(parsed.code, matchLength);
      if (current === requestId.current) setState({ kind: 'success', result });
    } catch (error) {
      if (current !== requestId.current) return;
      setState(isDatabaseEmptyError(error)
        ? { kind: 'missing-database' }
        : { kind: 'error', message: queryErrorMessage(error) });
    }
  }

  const result = state.kind === 'success' ? state.result : null;
  const matchedItems = result?.matched_items || [];
  const matched = result?.status === 'forbidden';
  const exceptionCount = matchedItems.filter(hasException).length;

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">HS 编码查询</CardTitle>
          <p className="text-xs text-muted-foreground">按所选位数匹配当前本地 Alta 禁运清单。没有命中不代表全面合规。</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void query(event)} className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="min-w-0 flex-1">
                <label htmlFor="alta-code" className="sr-only">HS 编码</label>
                <Input
                  id="alta-code" value={code} onChange={(event) => changeCode(event.target.value)}
                  className="h-10 font-mono"
                  placeholder="输入 HS 编码，如 0101210000"
                  aria-invalid={!!inputError}
                  aria-describedby={inputError ? 'alta-code-error' : undefined}
                />
                {inputError && <p id="alta-code-error" role="alert" className="mt-1.5 text-xs text-danger-fg">{inputError}</p>}
              </div>
              <fieldset className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-1">
                <legend className="sr-only">匹配位数</legend>
                {([
                  { title: '4 位', length: 4 },
                  { title: '6 位', length: 6 },
                  { title: '8 位', length: 8 },
                  { title: '完整', length: undefined },
                ] as const).map((option) => (
                  <button
                    type="button" key={option.title}
                    onClick={() => changeLength(option.length)}
                    aria-pressed={matchLength === option.length}
                    className={'rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' +
                      (matchLength === option.length ? 'bg-primary-subtle text-primary' : 'text-muted-foreground hover:bg-accent')}
                  >{option.title}</button>
                ))}
              </fieldset>
              <Button type="submit" className="h-10 shrink-0" disabled={state.kind === 'loading'}>
                {state.kind === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {state.kind === 'loading' ? '查询中' : '查询'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">匹配位数决定清单匹配范围；编码不会自动补零或变成其他商品编码。</p>
          </form>
        </CardContent>
      </Card>

      {state.kind === 'idle' && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          输入编码并选择匹配位数，即可查看当前清单命中情况。
        </div>
      )}
      {state.kind === 'loading' && <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在查询本地 Alta 清单…</p>}
      {state.kind === 'missing-database' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning bg-warning-subtle p-5">
          <AlertCircle className="h-5 w-5 shrink-0 text-warning-fg" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-warning-subtle-fg">本地禁运数据库为空</p>
            <p className="mt-1 text-xs text-warning-fg">需先获取清单数据，才能判断是否命中。</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onSwitchToManage}>前往数据管理</Button>
        </div>
      )}
      {state.kind === 'error' && (
        <div role="alert" className="rounded-xl border border-danger bg-danger-subtle p-5">
          <p className="font-semibold text-danger-subtle-fg">查询失败</p>
          <p className="mt-1 text-sm text-danger-fg">{state.message}</p>
          <p className="mt-2 text-xs text-muted-foreground">查询出错不等于“未命中”。</p>
        </div>
      )}
      {result && (
        <Card className="shadow-none">
          <CardContent className="space-y-5 pt-6">
            <div className="flex flex-wrap items-start gap-3">
              <div className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ' +
                (matched ? 'bg-danger-subtle text-danger-fg' : 'bg-muted text-muted-foreground')}>
                {matched ? <ShieldAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-muted-foreground">HS {result.code}</p>
                <h3 className="mt-1 text-lg font-semibold text-foreground-emphasis">
                  {matched ? '命中禁运清单' : '当前清单未命中'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {matched
                    ? '发现匹配的清单条目。需核对具体商品、限制范围以及可能存在的例外。'
                    : '仅表示在当前清单和所选匹配方式下未找到条目；不代表全面合规或自动允许出口。'}
                </p>
              </div>
            </div>

            {result.description && (
              <section className="rounded-lg bg-muted/50 p-4 text-sm">
                <h4 className="text-xs font-medium text-muted-foreground">查询描述</h4>
                <p className="mt-2 whitespace-pre-wrap leading-6">{result.description}</p>
              </section>
            )}

            {matched && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground-emphasis">匹配条目 · {matchedItems.length} 条</h4>
                  {exceptionCount > 0 && (
                    <span className="rounded-md bg-warning-subtle px-2 py-1 text-xs font-medium text-warning-subtle-fg">
                      {exceptionCount} 条标记有例外
                    </span>
                  )}
                </div>
                {matchedItems.length === 0 && (
                  <p className="rounded-lg border border-warning bg-warning-subtle p-3 text-xs text-warning-fg">后端报告命中，但没有返回条目明细。请以正式清单核对，不推断具体限制条件。</p>
                )}
                {matchedItems.map((item, index) => {
                  const exception = hasException(item);
                  return (
                    <article key={item.code + '-' + index} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-foreground-emphasis">{item.code}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{item.level} 位匹配</span>
                        {exception && <span className="rounded-md bg-warning-subtle px-2 py-0.5 text-xs text-warning-subtle-fg">含例外 · 需核对</span>}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.description}</p>
                      {exception && (
                        <div className="mt-3 rounded-lg border border-warning bg-warning-subtle p-3">
                          <p className="flex items-center gap-2 text-xs font-semibold text-warning-subtle-fg">
                            <AlertCircle className="h-4 w-4" /> 例外不等于自动豁免
                          </p>
                          <p className="mt-1 text-xs leading-5 text-warning-fg">保留原始清单内容供核对，不从编码文本自动推断例外是否适用。</p>
                          {item.raw_text && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">{item.raw_text}</p>}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
