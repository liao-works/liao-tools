import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { translateApi } from '@/lib/api/translate';
import { useToast } from '@/hooks/use-toast';
import type { HistoryEntry } from '@/types/translate';

const MODE_LABELS: Record<string, string> = { translate: '翻译', polish: '润色', explain: '解释' };
const TONE_LABELS: Record<string, string> = { natural: '自然商务', casual: '轻松随和', formal: '严谨正式' };

export interface HistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 完成一次翻译后递增，触发重新加载 */
  version: number;
  onRestore: (entry: HistoryEntry) => void;
}

export function HistoryDrawer({ open, onOpenChange, version, onRestore }: HistoryDrawerProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const reload = useCallback(() => {
    translateApi.listHistory(100, 0).then(setEntries).catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open, version, reload]);

  const remove = async (id: number) => {
    try {
      await translateApi.deleteHistory(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      toast({ title: '删除失败', description: '这条历史暂时删不掉，请稍后再试', variant: 'destructive' });
    }
  };

  const clearAll = async () => {
    try {
      const n = await translateApi.clearHistory();
      setEntries([]);
      toast({ title: '历史已清空', description: `共删除 ${n} 条` });
    } catch {
      toast({ title: '清空失败', description: '请稍后再试', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            翻译历史
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" disabled={!entries.length} onClick={clearAll}>
              <Trash2 size={12} /> 清空
            </Button>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-2">
          <div className="space-y-2">
            {entries.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">还没有历史记录</p>
            )}
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onRestore(entry)}
                className="block w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{entry.createdAt}</span>
                  <span>{MODE_LABELS[entry.mode] ?? entry.mode}</span>
                  {entry.tone && <span>· {TONE_LABELS[entry.tone] ?? entry.tone}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    {entry.provider} / {entry.model}
                    <Trash2
                      size={12}
                      className="hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); void remove(entry.id); }}
                    />
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{entry.sourceText}</p>
                <p className="mt-0.5 line-clamp-2 text-sm">{entry.resultText}</p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
