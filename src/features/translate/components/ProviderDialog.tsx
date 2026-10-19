// Task 8 实现：供应商配置弹窗（DeepSeek / Gemini / 自定义）与 Key 申请引导
import { useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { translateApi } from '@/lib/api/translate';
import type { ProviderKind, ProviderStatus, ProviderStatusEntry } from '@/types/translate';

const PROVIDER_META: Record<Exclude<ProviderKind, 'custom'>, { label: string; applyUrl: string; applyHint: string }> = {
  deepseek: {
    label: 'DeepSeek',
    applyUrl: 'https://platform.deepseek.com/api_keys',
    applyHint: '注册后在「API Keys」页创建，Key 以 sk- 开头。国内直连可用。',
  },
  gemini: {
    label: 'Gemini',
    applyUrl: 'https://aistudio.google.com/apikey',
    applyHint: 'Google AI Studio 创建 Key。国内使用需要开启系统代理。',
  },
};

// ProviderStatus 无索引签名，所有按 kind 的字段访问统一走此具名三元
const entryOf = (s: ProviderStatus | null | undefined, k: ProviderKind): ProviderStatusEntry | undefined =>
  s ? (k === 'deepseek' ? s.deepseek : k === 'gemini' ? s.gemini : s.custom) : undefined;

export interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: ProviderStatus | null;
  onSaved: (status: ProviderStatus) => void;
}

export function ProviderDialog({ open, onOpenChange, status, onSaved }: ProviderDialogProps) {
  const [provider, setProvider] = useState<ProviderKind>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [customModelMode, setCustomModelMode] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开时把当前激活供应商的配置回填表单；同一次打开期间 status 刷新不再回填，
  // 否则父组件刷新会清空正在编辑的 Key / 模型 / 地址
  const seededRef = useRef(false);
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current || !status) return;
    seededRef.current = true;
    setProvider(status.activeProvider);
    const entry = entryOf(status, status.activeProvider);
    setModel(entry?.model ?? '');
    setCustomModelMode(false);
    setBaseUrl(entry?.baseUrl ?? '');
    setApiKey(''); // Key 永远不回填明文
    setError(null);
  }, [open, status]);

  const switchProvider = (kind: ProviderKind) => {
    setProvider(kind);
    setModel(entryOf(status, kind)?.model ?? '');
    setCustomModelMode(false);
    setApiKey('');
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await translateApi.saveProvider({
        provider,
        apiKey: apiKey.trim() ? apiKey.trim() : undefined, // 留空 = 不修改，绝不清除
        model: model.trim() && model.trim() !== entryOf(status, provider)?.model ? model.trim() : undefined,
        baseUrl: provider === 'custom' ? baseUrl : undefined,
        setActive: true,
      });
      onSaved(next);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const entry = entryOf(status, provider);
  const models = provider === 'deepseek'
    ? ['deepseek-chat', 'deepseek-reasoner']
    : provider === 'gemini'
      ? ['gemini-2.5-flash', 'gemini-2.5-pro']
      : [];
  const knownModel = models.includes(model);
  // 模型必填；未配置的供应商必须填 Key 才能保存启用；custom 还必须填 Base URL
  const canSave =
    Boolean(model.trim()) &&
    (provider !== 'custom' || Boolean(baseUrl.trim())) &&
    Boolean(entry?.configured || apiKey.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>供应商配置</DialogTitle>
          <DialogDescription>选择一家服务商并填入 API Key，配置保存在本机。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(['deepseek', 'gemini', 'custom'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => switchProvider(kind)}
                className={[
                  'rounded-md border px-2 py-2 text-xs transition-colors',
                  provider === kind ? 'border-primary bg-primary/5 font-medium' : 'border-border text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {kind === 'custom' ? '自定义' : PROVIDER_META[kind].label}
                {entryOf(status, kind)?.configured && <span className="ml-1 text-primary">✓</span>}
              </button>
            ))}
          </div>

          {provider !== 'custom' && (
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>{PROVIDER_META[provider].applyHint}</p>
              <Button
                type="button"
                variant="link"
                className="h-5 p-0 text-xs"
                onClick={() => void openUrl(PROVIDER_META[provider].applyUrl).catch(() => {})}
              >
                前往申请 API Key ↗
              </Button>
            </div>
          )}

          {provider === 'custom' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Base URL（必填，以 /v1 结尾）</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" className="h-8 text-xs" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">API Key {entry?.apiKeyMask ? `（已保存 ${entry.apiKeyMask}）` : ''}</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={entry?.apiKeyMask ? '留空则不修改' : '粘贴 API Key'}
              className="h-8 text-xs"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">模型</Label>
            {models.length > 0 ? (
              <div className="flex gap-2">
                <Select
                  value={knownModel && !customModelMode ? model : '__custom'}
                  onValueChange={(v) => {
                    if (v === '__custom') {
                      setCustomModelMode(true);
                    } else {
                      setCustomModelMode(false);
                      setModel(v);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {models.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                    <SelectItem value="__custom" className="text-xs">自定义…</SelectItem>
                  </SelectContent>
                </Select>
                {(customModelMode || !knownModel) && (
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="模型名" className="h-8 flex-1 text-xs" autoFocus />
                )}
              </div>
            ) : (
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="模型名，如 gpt-4o-mini" className="h-8 text-xs" />
            )}
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" className="h-8 text-xs" disabled={saving || !canSave} onClick={save}>
            {saving ? '保存中…' : '保存并启用'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
