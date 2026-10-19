import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TONE_PRESETS, type TonePreset } from '@/types/translate';

interface ToneSelectorProps {
  tone: TonePreset;
  customNote: string;
  onToneChange: (tone: TonePreset) => void;
  onCustomNoteChange: (note: string) => void;
}

/** 语气三档 + 可展开的自定义补充 */
export function ToneSelector({ tone, customNote, onToneChange, onCustomNoteChange }: ToneSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-md border border-border bg-background p-0.5">
        {TONE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onToneChange(preset.value)}
            className={[
              'px-2.5 py-1 text-xs rounded-sm transition-colors',
              tone === preset.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => setExpanded((v) => !v)}
      >
        补充
        <ChevronDown size={14} className={['transition-transform', expanded ? 'rotate-180' : ''].join(' ')} />
      </Button>
      {expanded && (
        <Textarea
          value={customNote}
          onChange={(e) => onCustomNoteChange(e.target.value)}
          placeholder="给模型的补充说明，如：对方是合作多年的老客户，语气可以随意些"
          className="h-16 text-xs"
        />
      )}
    </div>
  );
}
