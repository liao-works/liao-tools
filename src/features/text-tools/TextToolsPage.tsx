import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, Copy, Trash2, Type, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { useToast } from '@/hooks/use-toast';
import { recordUsage } from '@/lib/api/usage';
import {
  countLines, extractNumberStats, mergeDimensionsCbm, normalizeNumbers,
  optimizeFormat, splitElements, toLowerCase, toTitleCase, toUpperCase, verticalizeTabbed,
} from './transforms';

interface Snapshot { input: string; output: string }

// 按钮标签与顺序对齐原 exe 的真实绑定（反汇编确认）：
// 优化格式=key:value 整理、分割元素=竖排、CBM=尺寸合并、无=数字规整、隔开=按分隔符合并
const TOOLS: Array<{ label: string; title: string; run: (text: string, delimiter: string) => string }> = [
  { label: '合并一行', title: '把换行替换为左侧分隔符（原「隔开」按钮）', run: (text, delimiter) => optimizeFormat(text, delimiter) },
  { label: '优化格式', title: '把「标签<空格/Tab>值」行整理为「标签: 值」', run: (text) => splitElements(text) },
  { label: '分割元素', title: '把一行按 Tab / 连续空格拆分成多行竖排', run: (text) => verticalizeTabbed(text) },
  { label: 'CBM', title: '尺寸数字规整后用 * 合并，行尾加 CBM', run: (text) => mergeDimensionsCbm(text) },
  { label: '数字规整', title: '同 CBM 合并，但不加 CBM 后缀', run: (text) => normalizeNumbers(text) },
  { label: '标题格式', title: '每个单词首字母大写', run: (text) => toTitleCase(text) },
  { label: '转大写', title: '整段转为大写', run: (text) => toUpperCase(text) },
  { label: '转小写', title: '整段转为小写', run: (text) => toLowerCase(text) },
];

const HISTORY_LIMIT = 50;

function StatCard({ label, value, hint, onCopy }: {
  label: string;
  value: string;
  hint: string;
  onCopy?: () => void;
}) {
  return (
    <button type="button" disabled={!value} onClick={onCopy}
      title={value ? '点击复制' : hint}
      className="rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value || '—'}</div>
    </button>
  );
}

/** 文本处理：分割元素、尺寸合并与数字统计等本地文本整理 */
export function TextToolsPage() {
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [delimiter, setDelimiter] = useState('');
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [copiedPane, setCopiedPane] = useState<'input' | 'output' | null>(null);

  const stats = useMemo(() => extractNumberStats(output), [output]);
  const lineCount = useMemo(() => countLines(output), [output]);
  const canUndo = history.length > 0;

  const snapshot = () => setHistory((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), { input, output }]);

  const apply = (run: (text: string, delimiter: string) => string) => {
    if (!input.trim()) return;
    snapshot();
    const started = performance.now();
    setOutput(run(input, delimiter));
    recordUsage({
      tool: 'texttools',
      action: 'process',
      items: countLines(input),
      durationMs: Math.round(performance.now() - started),
    });
  };

  const undo = () => {
    if (!history.length) return;
    const last = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setInput(last.input);
    setOutput(last.output);
  };

  const clearAll = () => {
    if (!input && !output) return;
    snapshot();
    setInput('');
    setOutput('');
  };

  const handleUndoHotkey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey
      && event.key.toLowerCase() === 'z' && canUndo) {
      event.preventDefault();
      undo();
    }
  };

  const copyPane = async (which: 'input' | 'output') => {
    const text = which === 'input' ? input : output;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedPane(which);
    window.setTimeout(() => setCopiedPane(null), 1500);
  };

  const copyValue = (label: string, value: string) => {
    void navigator.clipboard.writeText(value);
    toast({ title: `${label}已复制`, description: value });
  };

  const formatSum = (sum: number) => Number(sum.toFixed(2)).toString();

  return (
    <div className="lt-feature space-y-4">
      <FeatureHeader
        eyebrow="效率工具"
        title="文本处理"
        description="分割元素、尺寸合并、数字统计等常用文本整理，全部本地完成"
        icon={<Type size={26} strokeWidth={1.8} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input value={delimiter} onChange={(event) => setDelimiter(event.target.value)}
          placeholder="分隔符（合并一行用）" className="h-8 w-40 text-sm" />
        {TOOLS.map((tool) => (
          <Button key={tool.label} type="button" variant="outline" size="sm" className="h-8"
            title={tool.title} disabled={!input.trim()} onClick={() => apply(tool.run)}>
            {tool.label}
          </Button>
        ))}
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="sm" className="h-8" disabled={!canUndo} onClick={undo}>
          <Undo2 size={14} /> 撤销
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-destructive"
          disabled={!input && !output} onClick={clearAll}>
          <Trash2 size={14} /> 清除全部
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
          <Textarea value={input} onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleUndoHotkey}
            placeholder="粘贴要处理的文本…（Tab 键值行、尺寸清单等）"
            className="min-h-[300px] flex-1 resize-none rounded-lg border-0 text-sm shadow-none focus-visible:ring-0" />
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            <span>{input ? `${input.length} 字符` : ''}</span>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
              disabled={!input} onClick={() => copyPane('input')}>
              {copiedPane === 'input' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              {copiedPane === 'input' ? '已复制' : '复制输入'}
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
          <Textarea value={output} readOnly onKeyDown={handleUndoHotkey}
            placeholder={output || !input.trim()
              ? '处理结果会出现在这里…'
              : '结果为空：输入中没有可识别的行（需要「标签<空格/Tab>值」格式）'}
            className="min-h-[300px] flex-1 resize-none rounded-lg border-0 text-sm shadow-none focus-visible:ring-0" />
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            <span>{lineCount ? `${lineCount} 行` : ''}</span>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
              disabled={!output} onClick={() => copyPane('output')}>
              {copiedPane === 'output' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              {copiedPane === 'output' ? '已复制' : '复制输出'}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="计数" hint="输出中的数字个数" value={stats.count ? String(stats.count) : ''}
          onCopy={() => copyValue('计数', String(stats.count))} />
        <StatCard label="平均值" hint="输出中数字的平均值" value={stats.average != null ? stats.average.toFixed(2) : ''}
          onCopy={() => stats.average != null && copyValue('平均值', stats.average.toFixed(2))} />
        <StatCard label="求和" hint="输出中数字的总和" value={stats.count ? formatSum(stats.sum) : ''}
          onCopy={() => copyValue('求和', formatSum(stats.sum))} />
        <StatCard label="行数" hint="输出的行数" value={lineCount ? String(lineCount) : ''} />
      </div>
    </div>
  );
}
