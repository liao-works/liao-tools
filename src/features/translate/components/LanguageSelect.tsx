import { LANGUAGES } from '@/types/translate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const CJK_RATIO_THRESHOLD = 0.3;

/** CJK 字符占比 > 0.3 视为中文输入 */
export function detectSourceLang(text: string): 'zh' | 'en' {
  const compact = text.replace(/\s/g, '');
  if (!compact) return 'en';
  const cjk = (compact.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return cjk / compact.length > CJK_RATIO_THRESHOLD ? 'zh' : 'en';
}

export const langLabel = (code: string): string =>
  LANGUAGES.find((l) => l.code === code)?.label ?? code;

interface LanguageSelectProps {
  sourceLang: string;
  targetLang: string;
  /** sourceLang 为 auto 时对当前输入的识别结果，回显在下拉框里 */
  detected?: 'zh' | 'en' | null;
  /** targetLang 为 auto 时按源互译的实际方向，回显在下拉框里 */
  autoTarget?: string | null;
  onSourceChange: (code: string) => void;
  onTargetChange: (code: string) => void;
}

/** 方向选择：源（默认自动检测）+ 目标（默认自动互译） */
export function LanguageSelect({ sourceLang, targetLang, detected, autoTarget, onSourceChange, onTargetChange }: LanguageSelectProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Select value={sourceLang} onValueChange={onSourceChange}>
        <SelectTrigger className="h-7 w-[132px] text-xs">
          <SelectValue>
            {sourceLang === 'auto' && detected ? `自动检测（${langLabel(detected)}）` : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>{LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>
        ))}</SelectContent>
      </Select>
      <span className="text-muted-foreground">→</span>
      <Select value={targetLang} onValueChange={onTargetChange}>
        <SelectTrigger className="h-7 w-[132px] text-xs">
          <SelectValue>
            {targetLang === 'auto' && autoTarget ? `自动（→${langLabel(autoTarget)}）` : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>{LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code} className="text-xs">{l.code === 'auto' ? '自动（互译）' : l.label}</SelectItem>
        ))}</SelectContent>
      </Select>
    </div>
  );
}
