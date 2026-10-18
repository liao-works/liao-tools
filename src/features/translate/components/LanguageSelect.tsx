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

interface LanguageSelectProps {
  sourceLang: string;
  targetLang: string;
  onSourceChange: (code: string) => void;
  onTargetChange: (code: string) => void;
}

/** 方向选择：源（默认自动检测）+ 目标 */
export function LanguageSelect({ sourceLang, targetLang, onSourceChange, onTargetChange }: LanguageSelectProps) {
  const targetOptions = LANGUAGES.filter((l) => l.code !== 'auto');
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Select value={sourceLang} onValueChange={onSourceChange}>
        <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>
        ))}</SelectContent>
      </Select>
      <span className="text-muted-foreground">→</span>
      <Select value={targetLang} onValueChange={onTargetChange}>
        <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{targetOptions.map((l) => (
          <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>
        ))}</SelectContent>
      </Select>
    </div>
  );
}
