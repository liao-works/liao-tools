// Task 8 实现：供应商配置弹窗（DeepSeek / Gemini / 自定义）
import type { ProviderStatus } from '@/types/translate';

export interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: ProviderStatus | null;
  onSaved: (status: ProviderStatus) => void;
}

export function ProviderDialog(_props: ProviderDialogProps) {
  return null;
}
