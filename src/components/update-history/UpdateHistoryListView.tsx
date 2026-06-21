import { Loader2 } from 'lucide-react';
import type { UpdateSessionSummary } from '@/types';

const MODULE_LABEL: Record<string, string> = { tax: '关税', alta: '禁运' };
const TYPE_LABEL: Record<string, string> = { full: '全量更新', single: '单行更新' };

interface Props {
  sessions: UpdateSessionSummary[];
  loading: boolean;
  onSelect: (sessionId: string) => void;
}

export function UpdateHistoryListView({ sessions, loading, onSelect }: Props) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">暂无更新记录</p>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <button
          key={s.session_id}
          onClick={() => onSelect(s.session_id)}
          className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">{MODULE_LABEL[s.module]}</span>
            <span className="text-sm text-muted-foreground">
              {TYPE_LABEL[s.update_type]}
            </span>
            {s.version_to && (
              <span className="text-sm text-muted-foreground">
                v{s.version_to}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {new Date(s.timestamp).toLocaleString('zh-CN')} · {s.change_count} 条变更
          </div>
        </button>
      ))}
    </div>
  );
}
