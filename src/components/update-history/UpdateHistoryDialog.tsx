import { useState, useEffect } from 'react';
import { History, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { updateHistoryApi } from '@/lib/api/updateHistory';
import type { UpdateSessionSummary, UpdateChangeDetail } from '@/types';

interface Props {
  /** 限定模块；不传则显示全部 */
  module?: 'tax' | 'alta';
  triggerLabel?: string;
}

const MODULE_LABEL: Record<string, string> = { tax: '关税', alta: '禁运' };
const TYPE_LABEL: Record<string, string> = { full: '全量更新', single: '单行更新' };
const CHANGE_LABEL: Record<string, string> = {
  added: '新增', removed: '删除', modified: '修改',
};

export function UpdateHistoryDialog({ module, triggerLabel = '更新历史' }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<UpdateSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [details, setDetails] = useState<UpdateChangeDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    try {
      setSessions(await updateHistoryApi.listSessions(module));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadSessions();
  }, [open]);

  const showDetails = async (sessionId: string) => {
    setActiveSession(sessionId);
    setDetailLoading(true);
    try {
      setDetails(await updateHistoryApi.getDetails(sessionId));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>更新历史{module ? `（${MODULE_LABEL[module]}）` : ''}</DialogTitle>
        </DialogHeader>

        {activeSession ? (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" onClick={() => setActiveSession(null)}>
              ← 返回列表
            </Button>
            {detailLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">编码</th>
                      <th className="p-2 text-left">字段</th>
                      <th className="p-2 text-left">旧值</th>
                      <th className="p-2"></th>
                      <th className="p-2 text-left">新值</th>
                      <th className="p-2 text-left">类型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="p-2 font-mono">{d.code}</td>
                        <td className="p-2">{d.field ?? '—'}</td>
                        <td className="p-2 text-muted-foreground">{d.old_value ?? '—'}</td>
                        <td className="p-2"><ArrowRight className="h-3 w-3" /></td>
                        <td className="p-2">{d.new_value ?? '—'}</td>
                        <td className="p-2">{CHANGE_LABEL[d.change_type] ?? d.change_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : sessions.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">暂无更新记录</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.session_id}
                onClick={() => showDetails(s.session_id)}
                className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-muted"
              >
                <div>
                  <span className="font-medium">{MODULE_LABEL[s.module]}</span>
                  <span className="ml-2 text-sm text-muted-foreground">{TYPE_LABEL[s.update_type]}</span>
                  {s.version_to && <span className="ml-2 text-sm">v{s.version_to}</span>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {new Date(s.timestamp).toLocaleString('zh-CN')} · {s.change_count} 条变更
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
