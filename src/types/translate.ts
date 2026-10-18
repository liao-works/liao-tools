export type TranslateMode = 'translate' | 'polish' | 'explain';
export type TonePreset = 'natural' | 'casual' | 'formal';
export type ProviderKind = 'deepseek' | 'gemini' | 'custom';

export interface TranslateRequest {
  mode: TranslateMode;
  sourceLang: string;
  targetLang: string;
  tone?: TonePreset;
  customNote?: string;
  /** 非空时完全替换内置系统提示词（用户消息包装仍由模式决定） */
  customSystemPrompt?: string;
  text: string;
}

export type TranslateEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; historyId: number }
  | { type: 'error'; message: string };

export interface ProviderStatusEntry {
  model: string;
  baseUrl?: string | null;
  apiKeyMask: string;
  configured: boolean;
}

export interface ProviderStatus {
  activeProvider: ProviderKind;
  deepseek: ProviderStatusEntry;
  gemini: ProviderStatusEntry;
  custom: ProviderStatusEntry;
}

export interface SaveProviderInput {
  provider: ProviderKind;
  /** 传 undefined 不修改；传空字符串清除 */
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  setActive?: boolean;
}

export interface HistoryEntry {
  id: number;
  createdAt: string;
  mode: TranslateMode;
  sourceLang?: string | null;
  targetLang?: string | null;
  tone?: TonePreset | null;
  provider: string;
  model: string;
  sourceText: string;
  resultText: string;
}

export const LANGUAGES = [
  { code: 'auto', label: '自动检测' },
  { code: 'zh', label: '中文' },
  { code: 'en', label: '英语' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'de', label: '德语' },
  { code: 'fr', label: '法语' },
  { code: 'es', label: '西班牙语' },
  { code: 'ru', label: '俄语' },
] as const;

export const TONE_PRESETS: { value: TonePreset; label: string }[] = [
  { value: 'natural', label: '自然商务' },
  { value: 'casual', label: '轻松随和' },
  { value: 'formal', label: '严谨正式' },
];

export const MODE_OPTIONS: { value: TranslateMode; label: string }[] = [
  { value: 'translate', label: '翻译' },
  { value: 'polish', label: '润色' },
  { value: 'explain', label: '解释' },
];
