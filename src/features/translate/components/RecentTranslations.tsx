import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Languages } from 'lucide-react';
import { translateApi } from '@/lib/api/translate';
import type { HistoryEntry } from '@/types/translate';
import { cn } from '@/lib/utils';

const MODE_BADGES: Record<string, string> = {
  translate: '译',
  polish: '润',
  explain: '释',
};

/** 首页右栏：最近翻译（点击回填到翻译页继续使用） */
export function RecentTranslations() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    translateApi.listHistory(5, 0)
      .then((rows) => { if (alive) setEntries(rows); })
      .catch(() => { if (alive) setEntries([]); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="lt-home-panel">
      <div className="lt-panel-heading">
        <div><Languages size={18} /><h2>最近翻译</h2></div>
        <Link to="/translate" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          去翻译 <ArrowRight size={14} />
        </Link>
      </div>
      {entries === null ? (
        <p className="py-4 text-center text-xs text-muted-foreground">读取中…</p>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          还没有翻译记录——写好的邮件拿去译一段，这里就会显示
        </p>
      ) : (
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <Link
              key={entry.id}
              to="/translate"
              state={{ restore: entry }}
              className="block rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded text-[10px] font-medium',
                    entry.mode === 'translate' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {MODE_BADGES[entry.mode] ?? '译'}
                </span>
                <span>{entry.createdAt.slice(5, 16)}</span>
                <span className="truncate">{entry.provider} · {entry.model}</span>
              </div>
              <p className="mt-1 truncate text-xs text-foreground">{entry.sourceText}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
