// Task 9 实现：历史记录抽屉（列表 / 恢复 / 删除 / 清空）
import type { HistoryEntry } from '@/types/translate';

export interface HistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: number;
  onRestore: (entry: HistoryEntry) => void;
}

export function HistoryDrawer(_props: HistoryDrawerProps) {
  return null;
}
