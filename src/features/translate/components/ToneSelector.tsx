import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TONE_PRESETS, type TonePreset } from '@/types/translate';
import { cn } from '@/lib/utils';

interface ToneSelectorProps {
  tone: TonePreset;
  customNote: string;
  onToneChange: (tone: TonePreset) => void;
  onCustomNoteChange: (note: string) => void;
}

/** 语气三档 + 补充说明（弹窗填写，避免内联展开挤压工具条） */
export function ToneSelector({ tone, customNote, onToneChange, onCustomNoteChange }: ToneSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const hasNote = customNote.trim().length > 0;

  const openDialog = () => {
    setDraft(customNote);
    setDialogOpen(true);
  };

  const save = () => {
    onCustomNoteChange(draft.trim());
    setDialogOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-md border border-border bg-background p-0.5">
        {TONE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onToneChange(preset.value)}
            className={cn(
              'whitespace-nowrap px-2.5 py-1 text-xs rounded-sm transition-colors',
              tone === preset.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('h-7 px-2 text-xs', hasNote ? 'text-primary' : 'text-muted-foreground')}
        title="给模型的补充说明"
        onClick={openDialog}
      >
        {hasNote ? '已补充' : '补充'}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>补充说明</DialogTitle>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === 'Enter') save();
            }}
            placeholder="给模型的补充说明，如：对方是合作多年的老客户，语气可以随意些"
            className="h-28 text-sm"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">会作为附加指令叠加在语气之后；留空保存即清除。Ctrl+Enter 直接保存。</p>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" className="h-8 text-xs" onClick={save}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
