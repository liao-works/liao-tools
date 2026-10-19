import { useEffect, useRef, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TranslateMode } from '@/types/translate';

export type ProviderState = 'loading' | 'ready' | 'unconfigured';

interface WorkbenchProps {
  mode: TranslateMode;
  input: string;
  output: string;
  running: boolean;
  error: string | null;
  providerState: ProviderState;
  onInputChange: (text: string) => void;
  onRun: () => void;
  onStop: () => void;
  onOpenProvider: () => void;
}

const EMPTY_HINTS: Record<TranslateMode, string> = {
  translate: '译文会出现在这里（Ctrl+Enter 运行）',
  polish: '改写后的文本会出现在这里（Ctrl+Enter 运行）',
  explain: '邮件的语气解读会出现在这里（Ctrl+Enter 运行）',
};

/** 输入/输出双栏工作区 */
export function Workbench({
  mode, input, output, running, error, providerState, onInputChange, onRun, onStop, onOpenProvider,
}: WorkbenchProps) {
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const overLimit = input.length > 8000;

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  useEffect(() => () => window.clearTimeout(copyTimerRef.current), []);

  const copy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const canRun = providerState === 'ready';

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
      <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
        <Textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key === 'Enter' && !running && input.trim() && canRun) onRun();
          }}
          placeholder={
            mode === 'translate' ? '输入要翻译的文本…（Ctrl+Enter 运行）'
            : mode === 'polish' ? '输入要润色的文本…（Ctrl+Enter 运行）'
            : '粘贴要解读的邮件…（Ctrl+Enter 运行）'
          }
          className="min-h-0 flex-1 resize-none rounded-lg border-0 text-sm shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
          <span>{input.length > 0 ? `${input.length} 字符` : ''}</span>
          {overLimit && <span className="text-destructive">文本较长，响应可能较慢</span>}
        </div>
      </div>
      <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
        <div ref={outputRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm whitespace-pre-wrap">
          {error && <div className="mb-1 text-xs text-destructive">{error}（可重试）</div>}
          {output}
          {running && <Loader2 size={14} className="ml-1 inline animate-spin text-muted-foreground" />}
          {!output && !running && !error && (
            providerState === 'unconfigured' ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <KeyRound size={22} className="text-muted-foreground/60" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">三步开始使用</p>
                  <p className="text-xs text-muted-foreground">选择供应商 → 申请并填入 API Key → 粘贴文本运行</p>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onOpenProvider}>
                  去配置供应商
                </Button>
              </div>
            ) : (
              <p className="flex h-full items-center justify-center text-xs text-muted-foreground/70">{EMPTY_HINTS[mode]}</p>
            )
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={!output || running} onClick={copy}>
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            {copied ? '已复制' : '复制'}
          </Button>
          {running ? (
            <Button type="button" variant="destructive" size="sm" className="h-7 text-xs" onClick={onStop}>
              <Square size={12} /> 停止
            </Button>
          ) : (
            <Button type="button" size="sm" className="h-7 text-xs" disabled={!input.trim() || !canRun} onClick={onRun}>
              运行（Ctrl+Enter）
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
