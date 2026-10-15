import { useEffect, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateHistory } from '@/hooks/use-update-history';
import { updateHistoryApi } from '@/lib/api/updateHistory';
import { UpdateHistoryListView } from './UpdateHistoryListView';
import { UpdateHistoryDetailView } from './UpdateHistoryDetailView';
import type { UpdateSessionSummary, UpdateChangeDetail } from '@/types';

export function UpdateHistoryHost() {
  const { state, closeUpdateHistory, setActiveSessionId } = useUpdateHistory();
  const { open, module, activeSessionId } = state;

  const [sessions, setSessions] = useState<UpdateSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [details, setDetails] = useState<UpdateChangeDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [sessionMeta, setSessionMeta] = useState<{
    versionFrom: string | null;
    versionTo: string | null;
  }>({ versionFrom: null, versionTo: null });

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const data = await updateHistoryApi.listSessions(module);
      setSessions(data);
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : String(error));
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [module]);

  // 列表 dialog 打开或 module 变化时加载列表
  useEffect(() => {
    if (open) {
      loadSessions();
    }
  }, [open, module, loadSessions]);

  // activeSessionId 变化时加载明细
  useEffect(() => {
    if (!activeSessionId) {
      setDetails([]);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    updateHistoryApi
      .getDetails(activeSessionId)
      .then((data) => {
        if (!cancelled) {
          setDetails(data);
          // 从明细中提取版本范围（取第一条记录的版本）
          if (data.length > 0) {
            setSessionMeta({
              versionFrom: data[0].version_from,
              versionTo: data[0].version_to,
            });
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDetails([]);
          setDetailError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  // 列表 dialog 关闭：重置全部状态（含详情）
  const handleListOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      closeUpdateHistory();
      setSessions([]);
      setDetails([]);
      setActiveSessionId(null);
      setSessionMeta({ versionFrom: null, versionTo: null });
    }
  };

  // 详情 dialog 关闭：仅回到列表（列表 dialog 保持打开）
  const handleDetailOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setActiveSessionId(null);
    }
  };

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
    },
    [setActiveSessionId],
  );

  const handleBack = useCallback(() => {
    setActiveSessionId(null);
  }, [setActiveSessionId]);

  const moduleLabel = module === 'alta' ? '禁运' : module === 'tax' ? '关税' : '更新';

  return (
    <>
      {/* 第一层：更新历史列表 */}
      <Dialog open={open} onOpenChange={handleListOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              更新历史{module ? `（${moduleLabel}）` : ''}
            </DialogTitle>
          </DialogHeader>
          {sessionsError && (
            <div role="alert" className="space-y-2 rounded-lg border border-danger bg-danger-subtle p-3 text-sm text-danger-fg">
              <p>读取更新历史失败：{sessionsError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadSessions()}>重试读取</Button>
            </div>
          )}
          {!sessionsError && <UpdateHistoryListView
            sessions={sessions}
            loading={sessionsLoading}
            onSelect={handleSelectSession}
          />}
        </DialogContent>
      </Dialog>

      {/* 第二层：变更明细（独立遮罩，叠在列表 dialog 之上） */}
      <Dialog open={!!activeSessionId} onOpenChange={handleDetailOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{moduleLabel}变更明细</DialogTitle>
          </DialogHeader>
          {detailError && <p role="alert" className="rounded-lg border border-danger bg-danger-subtle p-3 text-sm text-danger-fg">
            读取变更明细失败：{detailError}
          </p>}
          {!detailError && <UpdateHistoryDetailView
            details={details}
            detailLoading={detailLoading}
            onBack={handleBack}
            module={module ?? 'tax'}
            versionFrom={sessionMeta.versionFrom}
            versionTo={sessionMeta.versionTo}
          />}
        </DialogContent>
      </Dialog>
    </>
  );
}
