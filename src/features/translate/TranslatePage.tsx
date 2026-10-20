import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { History, Languages, Settings2, SquarePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { translateApi } from '@/lib/api/translate';
import { useToast } from '@/hooks/use-toast';
import { detectSourceLang, LanguageSelect, langLabel } from './components/LanguageSelect';
import { ToneSelector } from './components/ToneSelector';
import { Workbench } from './components/Workbench';
import { ProviderDialog } from './components/ProviderDialog';
import { HistoryDrawer } from './components/HistoryDrawer';
import type { HistoryEntry, ProviderStatus, TonePreset, TranslateEvent, TranslateMode } from '@/types/translate';

export function TranslatePage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<TranslateMode>('translate');
  const [tone, setTone] = useState<TonePreset>('natural');
  const [customNote, setCustomNote] = useState('');
  const [customPromptOn, setCustomPromptOn] = useState(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('auto'); // 目标默认「自动」：按源语言互译
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0); // done 后让抽屉刷新
  // 运行中的镜像与代次：runningRef 供事件回调判断「停止后迟到的错误」；
  // runIdRef 丢弃被新请求顶替的旧流事件
  const runningRef = useRef(false);
  const runIdRef = useRef(0);

  useEffect(() => {
    let alive = true;
    translateApi.getStatus()
      .then((s) => { if (alive) setStatus(s); })
      .catch(() => { if (alive) setStatus(null); })
      .finally(() => { if (alive) setStatusLoaded(true); });
    return () => { alive = false; };
  }, []);

  // 首页「最近翻译」点击回填：带原文译文与模式进入本页
  const location = useLocation();
  useEffect(() => {
    const restore = (location.state as { restore?: HistoryEntry } | null)?.restore;
    if (!restore) return;
    setInput(restore.sourceText);
    setOutput(restore.resultText);
    setMode(restore.mode);
    if (restore.targetLang && restore.targetLang !== 'auto') setTargetLang(restore.targetLang);
    if (restore.tone) setTone(restore.tone);
    window.history.replaceState({}, ''); // 清掉路由状态，避免之后进出页面反复回填
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providerReady = !!status && !!status[status.activeProvider]?.configured;

  // 源语言自动识别：仅翻译模式 + 自动检测时对当前输入实时回显
  const detectedLang = mode === 'translate' && sourceLang === 'auto' && input.trim()
    ? detectSourceLang(input)
    : null;
  // 识别结果与目标语言相同（如英→英）时，翻译是原样返回的无效操作，提示一键换向
  const sameLang = detectedLang !== null && detectedLang === targetLang;
  // 目标「自动」时的实际方向：与源互译，规则与 run() 的解析保持一致，仅用于回显
  const resolvedSource = mode === 'translate'
    ? (sourceLang === 'auto' ? detectedLang : sourceLang)
    : null;
  const autoTarget = mode === 'translate' && targetLang === 'auto' && resolvedSource
    ? (resolvedSource === 'zh' ? 'en' : 'zh')
    : null;

  const run = useCallback(async () => {
    if (!input.trim() || runningRef.current || !providerReady) return;
    // 方向自动检测：source=auto 且为翻译模式时按输入推断
    const detected = detectSourceLang(input);
    const source = sourceLang === 'auto' ? detected : sourceLang;
    const target = mode === 'translate'
      ? (targetLang !== 'auto' ? targetLang : (source === 'zh' ? 'en' : 'zh'))
      : source;
    const runId = ++runIdRef.current;
    const onEvent = (event: TranslateEvent) => {
      if (runIdRef.current !== runId) return; // 已被新请求顶替，丢弃过期事件
      if (event.type === 'delta') {
        setOutput((prev) => prev + event.text);
      } else if (event.type === 'done') {
        runningRef.current = false;
        setRunning(false);
        setHistoryVersion((v) => v + 1);
      } else {
        const wasRunning = runningRef.current;
        runningRef.current = false;
        setRunning(false);
        setError(event.message);
        // 手动停止后迟到的错误不再打扰
        if (wasRunning) toast({ title: '翻译失败', description: event.message, variant: 'destructive' });
      }
    };
    setOutput('');
    setError(null);
    setRunning(true);
    runningRef.current = true;
    try {
      await translateApi.run({
        mode,
        sourceLang: source,
        targetLang: mode === 'explain' ? 'zh' : target,
        tone: mode === 'explain' ? undefined : tone,
        customNote: mode === 'explain' ? undefined : (customNote.trim() || undefined),
        customSystemPrompt: customPromptOn && customSystemPrompt.trim() ? customSystemPrompt.trim() : undefined,
        text: input,
      }, onEvent);
    } catch (e) {
      runningRef.current = false;
      setRunning(false);
      const message = typeof e === 'string' ? e : '发起请求失败';
      setError(message);
      toast({ title: '翻译失败', description: message, variant: 'destructive' });
    }
  }, [input, sourceLang, targetLang, mode, tone, customNote, customPromptOn, customSystemPrompt, providerReady, toast]);

  const stop = useCallback(() => {
    void translateApi.abort();
    runningRef.current = false;
    setRunning(false);
  }, []);

  // Esc 中止（弹窗打开时交给弹窗自己处理）
  useEffect(() => {
    if (!running || providerOpen || historyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, providerOpen, historyOpen, stop]);

  const switchMode = (value: TranslateMode) => {
    if (runningRef.current) stop(); // 不让旧流串进新模式
    setMode(value);
    setOutput('');
    setError(null);
  };

  return (
    <div className="lt-feature flex h-full min-h-0 flex-col gap-3">
      <FeatureHeader
        eyebrow="COMMUNICATE / TRANSLATE"
        title="翻译"
        description="邮件翻译、润色与语气解读，支持 DeepSeek / Gemini"
        icon={<Languages size={32} />}
      />
      <div className="flex flex-wrap items-center gap-2">
        {/* 左组：模式 + 随模式变化的上下文控件 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-border bg-background p-0.5">
            {([['translate', '翻译'], ['polish', '润色'], ['explain', '解释']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => switchMode(value)}
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
              detected={detectedLang}
              autoTarget={autoTarget}
              onSourceChange={setSourceLang}
              onTargetChange={setTargetLang}
            />
          )}
          {mode !== 'explain' && !customPromptOn && (
            <ToneSelector tone={tone} customNote={customNote} onToneChange={setTone} onCustomNoteChange={setCustomNote} />
          )}
        </div>
        {/* 右组：高级开关与工具 */}
        <div className="ml-auto flex items-center gap-1">
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
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setHistoryOpen(true)}>
            <History size={14} /> 历史
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setProviderOpen(true)}>
            <Settings2 size={14} /> 供应商
          </Button>
        </div>
      </div>
      {sameLang && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>识别到原文已是{langLabel(targetLang)}，继续运行会原样返回</span>
          <Button
            type="button"
            variant="link"
            className="h-4 p-0 text-xs"
            onClick={() => setTargetLang(detectedLang === 'zh' ? 'en' : 'zh')}
          >
            改为{langLabel(detectedLang === 'zh' ? 'en' : 'zh')}
          </Button>
        </div>
      )}
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
        providerState={statusLoaded ? (providerReady ? 'ready' : 'unconfigured') : 'loading'}
        onInputChange={setInput}
        onRun={run}
        onStop={stop}
        onOpenProvider={() => setProviderOpen(true)}
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
          switchMode(entry.mode);
          setHistoryOpen(false);
        }}
      />
    </div>
  );
}
