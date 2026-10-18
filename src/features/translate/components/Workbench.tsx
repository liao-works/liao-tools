import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TranslateMode } from '@/types/translate';

interface WorkbenchProps {
  mode: TranslateMode;
  input: string;
  output: string;
  running: boolean;
  error: string | null;
  onInputChange: (text: string) => void;
  onRun: () => void;
  onStop: () => void;
}

/** 输入/输出双栏工作区 */
export function Workbench({ mode, input, output, running, error, onInputChange, onRun, onStop }: WorkbenchProps) {
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const overLimit = input.length > 8000;

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const copy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
      <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
        <Textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.ctrlKey && e.key === 'Enter' && !running && input.trim()) onRun();
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
          {error ? <span className="text-destructive">{error}</span> : output}
          {running && <Loader2 size={14} className="ml-1 inline animate-spin text-muted-foreground" />}
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
            <Button type="button" size="sm" className="h-7 text-xs" disabled={!input.trim()} onClick={onRun}>
              运行（Ctrl+Enter）
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
