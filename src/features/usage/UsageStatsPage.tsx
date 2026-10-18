import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Clock, Database, FileSearch, Loader2, RefreshCw, type LucideIcon } from 'lucide-react';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  USAGE_TOOL_LABELS,
  formatDuration,
  getUsageSummary,
  type UsageRange,
  type UsageSummary,
} from '@/lib/api/usage';

type Metric = 'queries' | 'query_items' | 'process_items' | 'duration_ms';

const METRICS: Array<{ key: Metric; label: string; color: string }> = [
  { key: 'queries', label: '查询次数', color: 'var(--primary)' },
  { key: 'query_items', label: '查询数据量', color: 'var(--info, #2E7CF6)' },
  { key: 'process_items', label: '处理数据量', color: 'var(--success)' },
  { key: 'duration_ms', label: '处理时长', color: 'var(--warning)' },
];

const SUMMARY_CARDS: Array<{
  key: Metric;
  label: string;
  Icon: LucideIcon;
  format: (summary: UsageSummary) => string;
}> = [
  { key: 'queries', label: '查询次数', Icon: FileSearch, format: (s) => s.total_queries.toLocaleString() },
  { key: 'query_items', label: '查询数据量', Icon: BarChart3, format: (s) => s.total_query_items.toLocaleString() },
  { key: 'process_items', label: '处理数据量', Icon: Database, format: (s) => s.total_process_items.toLocaleString() },
  { key: 'duration_ms', label: '处理时长', Icon: Clock, format: (s) => formatDuration(s.total_duration_ms) },
];

function dayLabel(day: string, range: UsageRange): string {
  const [, month, date] = day.split('-');
  if (range === 'week') {
    const weekday = new Date(`${day}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' });
    return `${Number(month)}/${Number(date)} ${weekday}`;
  }
  return `${Number(month)}/${Number(date)}`;
}

export function UsageStatsPage() {
  const [range, setRange] = useState<UsageRange>('week');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [metric, setMetric] = useState<Metric>('queries');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: UsageRange) => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getUsageSummary(target));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const metricMeta = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const dayRows = summary?.days ?? [];
  const maxMetricValue = Math.max(1, ...dayRows.map((row) => Number(row[metric])));

  return (
    <div className="lt-feature space-y-6">
      <FeatureHeader
        eyebrow="INSIGHTS"
        title="使用统计"
        description="本机各工具的查询次数、查询数据量、处理数据量与处理时长统计，支持按周/月视图查看；数据仅保存在本地。"
        illustrationSrc="/illustrations/update-scene.svg"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-muted p-1" role="group" aria-label="统计范围">
          {([['week', '周视图（近 7 天）'], ['month', '月视图（近 30 天）']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRange(value)}
              aria-pressed={range === value}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                range === value
                  ? 'bg-card text-foreground-emphasis shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(range)} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          刷新
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-danger bg-danger-subtle p-4 text-sm text-danger-fg">
          读取使用统计失败：{error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SUMMARY_CARDS.map(({ key, label, Icon, format }) => (
          <Card key={key} className="shadow-none">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-foreground-emphasis">
                {summary ? format(summary) : '—'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">按日趋势</CardTitle>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {METRICS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMetric(item.key)}
                aria-pressed={metric === item.key}
                className={`rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  metric === item.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading && !summary ? (
            <p role="status" className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />正在读取统计数据…
            </p>
          ) : (
            <div className="flex h-48 items-stretch gap-1.5 overflow-x-auto pb-1">
              {dayRows.map((row) => {
                const value = Number(row[metric]);
                return (
                  <div key={row.day} className="flex min-w-[24px] flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t-sm transition-all"
                        style={{
                          height: `${Math.max(value > 0 ? 6 : 2, (value / maxMetricValue) * 100)}%`,
                          backgroundColor: value > 0 ? metricMeta.color : 'var(--muted)',
                          opacity: value > 0 ? 1 : 0.6,
                        }}
                        title={`${row.day}：${metric === 'duration_ms' ? formatDuration(value) : value.toLocaleString()}`}
                      />
                    </div>
                    <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                      {dayLabel(row.day, range)}
                    </span>
                  </div>
                );
              })}
              {dayRows.length === 0 && <p className="text-sm text-muted-foreground">暂无数据</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">工具明细</CardTitle>
          <CardDescription>按工具统计当前范围内的使用情况</CardDescription>
        </CardHeader>
        <CardContent>
          {summary && summary.tools.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>工具</TableHead>
                  <TableHead className="text-right">查询次数</TableHead>
                  <TableHead className="text-right">查询数据量</TableHead>
                  <TableHead className="text-right">处理数据量</TableHead>
                  <TableHead className="text-right">处理时长</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.tools.map((tool) => (
                  <TableRow key={tool.tool}>
                    <TableCell className="font-medium">{USAGE_TOOL_LABELS[tool.tool] ?? tool.tool}</TableCell>
                    <TableCell className="text-right tabular-nums">{tool.queries.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{tool.query_items.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{tool.process_items.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatDuration(tool.duration_ms)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              {loading ? '读取中…' : '当前范围内还没有使用记录；去任意工具页查询或处理一次数据后再来看这里。'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
