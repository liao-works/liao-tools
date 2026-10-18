import { useEffect, useState } from 'react';
import { AlertCircle, History, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { altaApi } from '@/lib/api/alta';
import type { AltaDbStats } from '@/types';
import { openUpdateHistory } from '@/hooks/use-update-history';
import { useAltaUpdateStore } from '@/stores/alta-update-store';

export function DataManageTab() {
  // 更新任务状态在全局 store 中，切页后任务继续，回到本页即可看到进度。
  const updating = useAltaUpdateStore((s) => s.updating);
  const logs = useAltaUpdateStore((s) => s.logs);
  const updateError = useAltaUpdateStore((s) => s.updateError);
  const startUpdate = useAltaUpdateStore((s) => s.startUpdate);
  const [loading, setLoading] = useState(true);
  const [dbStats, setDbStats] = useState<AltaDbStats | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  async function loadDbInfo() {
    setLoading(true);
    setInfoError(null);
    try {
      setDbStats(await altaApi.getDatabaseInfo());
    } catch (error) {
      setInfoError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDbInfo(); }, []);

  async function handleUpdate() {
    if (updating) return;
    const success = await startUpdate();
    // Status refresh failure should not turn a successful update into a failed one.
    if (success) await loadDbInfo();
  }

  const dateText = dbStats?.last_update
    ? new Date(dbStats.last_update).toLocaleString('zh-CN')
    : '未提供更新时间';

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">本地禁运数据库</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            记录数和更新时间来自真实本地数据库；记录存在不代表覆盖完整或每条限制均已核验。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && !dbStats && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />正在读取本地数据库…
          </p>}

          {infoError && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger bg-danger-subtle p-3 text-sm text-danger-fg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 break-words">读取本地状态失败：{infoError}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadDbInfo()} disabled={loading}>重试读取</Button>
            </div>
          )}
          {dbStats && (
            <>
              {dbStats.total_items === 0 && (
                <div role="status" className="rounded-lg border border-warning bg-warning-subtle p-3 text-sm text-warning-fg">
                  本地清单没有记录；在获得清单前，不能把查询未命中理解为没有限制。
                </div>
              )}
              <dl className="grid gap-3 rounded-lg bg-muted/40 p-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">本地记录数</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">{dbStats.total_items.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">最后更新</dt>
                  <dd className="mt-1 text-sm font-medium">{dateText}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">数据库大小</dt>
                  <dd className="mt-1 text-sm font-medium">{(dbStats.db_size / 1024 / 1024).toFixed(2)} MB</dd>
                </div>
              </dl>
            </>
          )}
          {updateError && <p role="alert" className="text-sm text-danger-fg">更新失败：{updateError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleUpdate()} disabled={updating}>
              {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {updating ? '正在更新清单' : '更新禁运清单'}
            </Button>
            <Button type="button" variant="outline" disabled={loading || updating} onClick={() => void loadDbInfo()}>
              <RefreshCw className="h-4 w-4" />刷新本地状态
            </Button>
            <Button type="button" variant="outline" onClick={() => openUpdateHistory({ module: 'alta' })}>
              <History className="h-4 w-4" />更新历史
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            更新由原有 Alta 数据命令执行；完成后重新读取本地数据，不做额外连接测试。
          </p>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer p-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            本次操作日志 · {logs.length} 条
          </summary>
          <div className="max-h-64 space-y-1 overflow-y-auto border-t border-border p-4 font-mono text-xs text-muted-foreground">
            {logs.map((entry, index) => <p key={index} className="break-words">{entry}</p>)}
          </div>
        </details>
      )}
    </div>
  );
}
