import { useCallback, useEffect, useState } from 'react';
import { History, Languages, Settings2, SquarePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { translateApi } from '@/lib/api/translate';
import { useToast } from '@/hooks/use-toast';
import { detectSourceLang, LanguageSelect } from './components/LanguageSelect';
import { ToneSelector } from './components/ToneSelector';
import { Workbench } from './components/Workbench';
import { ProviderDialog } from './components/ProviderDialog';
import { HistoryDrawer } from './components/HistoryDrawer';
import type { ProviderStatus, TonePreset, TranslateEvent, TranslateMode } from '@/types/translate';

export function TranslatePage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<TranslateMode>('translate');
  const [tone, setTone] = useState<TonePreset>('natural');
  const [customNote, setCustomNote] = useState('');
  const [customPromptOn, setCustomPromptOn] = useState(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('en');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0); // done 后让抽屉刷新

  useEffect(() => {
    translateApi.getStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const handleEvent = useCallback((event: TranslateEvent) => {
    if (event.type === 'delta') {
      setOutput((prev) => prev + event.text);
    } else if (event.type === 'done') {
      setRunning(false);
      setHistoryVersion((v) => v + 1);
    } else {
      setRunning(false);
      setError(event.message);
      toast({ title: '翻译失败', description: event.message, variant: 'destructive' });
    }
  }, [toast]);

  const run = useCallback(async () => {
    if (!input.trim() || running) return;
    // 方向自动检测：source=auto 且为翻译模式时按输入推断
    const detected = detectSourceLang(input);
    const source = sourceLang === 'auto' ? detected : sourceLang;
    const target = mode === 'translate'
      ? (targetLang !== 'auto' ? targetLang : (source === 'zh' ? 'en' : 'zh'))
      : source;
    setOutput('');
    setError(null);
    setRunning(true);
    try {
      await translateApi.run({
        mode,
        sourceLang: source,
        targetLang: mode === 'explain' ? 'zh' : target,
        tone: mode === 'explain' ? undefined : tone,
        customNote: mode === 'explain' ? undefined : (customNote.trim() || undefined),
        customSystemPrompt: customPromptOn && customSystemPrompt.trim() ? customSystemPrompt.trim() : undefined,
        text: input,
      }, handleEvent);
    } catch (e) {
      setRunning(false);
      const message = typeof e === 'string' ? e : '发起请求失败';
      setError(message);
      toast({ title: '翻译失败', description: message, variant: 'destructive' });
    }
  }, [input, running, sourceLang, targetLang, mode, tone, customNote, customPromptOn, customSystemPrompt, handleEvent, toast]);

  const stop = useCallback(() => {
    void translateApi.abort();
    setRunning(false);
  }, []);

  // Esc 中止
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && running) stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, stop]);

  const activeConfigured = status
    ? status[status.activeProvider]?.configured
    : false;

  return (
    <div className="lt-feature flex h-full min-h-0 flex-col gap-3">
      <FeatureHeader
        eyebrow="COMMUNICATE / TRANSLATE"
        title="翻译"
        description="邮件翻译、润色与语气解读，支持 DeepSeek / Gemini"
        icon={<Languages size={32} />}
      />
      <div className="flex flex-wrap items-center gap-2">
        {/* 模式三选一 */}
        <div className="flex items-center rounded-md border border-border bg-background p-0.5">
          {([['translate', '翻译'], ['polish', '润色'], ['explain', '解释']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => { setMode(value); setOutput(''); setError(null); }}
              className={[
                'px-3 py-1 text-xs rounded-sm transition-colors',
                mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'translate' && (
          <LanguageSelect
            sourceLang={sourceLang}
            targetLang={targetLang}
            onSourceChange={setSourceLang}
            onTargetChange={setTargetLang}
          />
        )}
        {mode !== 'explain' && !customPromptOn && (
          <ToneSelector tone={tone} customNote={customNote} onToneChange={setTone} onCustomNoteChange={setCustomNote} />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={[
            'h-7 text-xs',
            customPromptOn ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
          ].join(' ')}
          onClick={() => setCustomPromptOn((v) => !v)}
        >
          <SquarePen size={14} /> 自定义提示词
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setHistoryOpen(true)}>
            <History size={14} /> 历史
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setProviderOpen(true)}>
            <Settings2 size={14} /> 供应商
          </Button>
        </div>
      </div>
      {customPromptOn && (
        <Textarea
          value={customSystemPrompt}
          onChange={(e) => setCustomSystemPrompt(e.target.value)}
          placeholder="输入完整的系统提示词，将完全替换内置提示词（角色、语气、输出规则全部由你定义）。留空则仍使用内置提示词。"
          className="h-24 text-xs"
        />
      )}
      <Workbench
        mode={mode}
        input={input}
        output={output}
        running={running}
        error={error}
        onInputChange={setInput}
        onRun={run}
        onStop={stop}
      />
      <ProviderDialog
        open={providerOpen}
        onOpenChange={setProviderOpen}
        status={status}
        onSaved={setStatus}
      />
      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        version={historyVersion}
        onRestore={(entry) => {
          setInput(entry.sourceText);
          setOutput(entry.resultText);
          setMode(entry.mode);
          setHistoryOpen(false);
        }}
      />
      {/* 未配置引导：未配置供应商时在底部显示提示条，点击「去配置」打开配置弹窗 */}
      {status && !activeConfigured && !providerOpen && (
        <UnconfiguredHint onOpen={() => setProviderOpen(true)} />
      )}
    </div>
  );
}

function UnconfiguredHint({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span>还没有配置模型供应商——先花一分钟填入 API Key，翻译即可使用。</span>
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onOpen}>去配置</Button>
    </div>
  );
}
