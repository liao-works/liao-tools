import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getFileName, openFileWithShell } from '@/lib/file-opener';

export type FileOperationState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; message: string; outputPath: string; logs: string[] }
  | { kind: 'error'; message: string; logs: string[] };

interface FileOperationFeedbackProps {
  state: FileOperationState;
  title?: string;
}

export function FileOperationFeedback({ state, title = '处理结果' }: FileOperationFeedbackProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const outputPath = state.kind === 'success' ? state.outputPath : '';
  useEffect(() => {
    setCopied(false);
  }, [outputPath]);

  async function openOutput() {
    if (!outputPath) return;
    try {
      await openFileWithShell(outputPath);
    } catch (error) {
      toast({
        title: '打开文件失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }

  async function copyOutput() {
    if (!outputPath) return;
    try {
      await navigator.clipboard.writeText(outputPath);
      setCopied(true);
    } catch (error) {
      toast({
        title: '复制路径失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }

  if (state.kind === 'idle') return null;

  return (
    <Card className="shadow-none" aria-live="polite">
      <CardContent className="space-y-4 pt-5">
        {state.kind === 'running' ? (
          <div role="status" className="flex items-start gap-3">
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground-emphasis">正在本地处理文件</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                请勿关闭当前任务；完成后会显示实际输出，不使用模拟进度百分比。
              </p>
            </div>
          </div>
        ) : (
          <>
            <div role={state.kind === 'error' ? 'alert' : 'status'} className="flex items-start gap-3">
              {state.kind === 'success'
                ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-fg" />
                : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-fg" />}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground-emphasis">
                  {state.kind === 'success' ? title : '处理失败'}
                </h3>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {state.message || (state.kind === 'success' ? '处理已完成' : '未能完成处理')}
                </p>
                {state.kind === 'error' && (
                  <p className="mt-2 text-xs text-muted-foreground">输入文件仍保留，可直接调整后重新处理。</p>
                )}
              </div>
            </div>

            {state.kind === 'success' && (
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                {outputPath ? (
                  <>
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="break-all text-sm font-medium text-foreground-emphasis">{getFileName(outputPath)}</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{outputPath}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => void openOutput()}>
                        <ExternalLink className="h-4 w-4" /> 打开输出文件
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void copyOutput()}>
                        <Copy className="h-4 w-4" /> {copied ? '路径已复制' : '复制路径'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-warning-fg">命令报告处理成功，但没有返回输出路径；请检查下方日志。</p>
                )}
              </div>
            )}

            {state.logs.length > 0 && (
              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  执行日志 · {state.logs.length} 条
                </summary>
                <div className="max-h-64 space-y-1 overflow-y-auto border-t border-border px-4 py-3 font-mono text-xs leading-5 text-muted-foreground">
                  {state.logs.map((line, index) => (
                    <p key={index} className="whitespace-pre-wrap break-all">[{index + 1}] {line}</p>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
