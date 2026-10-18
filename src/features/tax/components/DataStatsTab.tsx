import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Database, FileSearch, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { taxStatsApi, type TaxDataStats } from '@/lib/api/tax';
import { formatBytes } from '@/stores/tax-update-store';

function formatNumber(value: number): string {
  return value.toLocaleString();
}

/** 覆盖率条：展示"有默认税率 / 目录编码"的占比。 */
function CoverageBar({ label, withRate, total }: { label: string; withRate: number; total: number }) {
  const percent = total > 0 ? (withRate / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {formatNumber(withRate)} / {formatNumber(total)}
          <span className="ml-2 text-muted-foreground">{percent.toFixed(1)}%</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">
        {value}
        {hint && <span className="ml-1 font-normal text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

/** 空白默认税率的官方原因（gap 审计）翻译。 */
const GAP_REASON_LABELS: Record<string, string> = {
  'GB:active_103_requires_conditions_or_additional_code': 'GB：仅授权用途/附加代码条件税率',
  'GB:no_103_source_rows': 'GB：官方无第三国关税措施',
  'GB:no_china_applicable_103_rows': 'GB：关税行不含中国（如仅 Channel Islands）',
  'XI:active_103_requires_conditions_or_additional_code': 'XI：仅授权用途/附加代码条件税率',
  'XI:no_103_source_rows': 'XI：官方无第三国关税措施',
  'XI:no_china_applicable_103_rows': 'XI：关税行不含中国（如仅 BY/RU）',
};

export function DataStatsTab() {
  const [stats, setStats] = useState<TaxDataStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await taxStatsApi.getDataStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !stats) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在读取本地数据统计...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-danger-fg">读取数据统计失败：{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!stats || !stats.available) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm text-muted-foreground">
          <p>本地尚未安装关税数据库，暂无统计。</p>
          <p>请前往「数据更新与审核」下载正式数据包后再查看。</p>
        </CardContent>
      </Card>
    );
  }

  const gapEntries = Object.entries(stats.gapByRegionReason || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          统计来自数据发布清单（采集端计算），并对本地库做行数一致性校验；客户端不重新推导覆盖率。
        </p>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          刷新
        </Button>
      </div>

      {/* 总览 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            数据总览
          </CardTitle>
          <CardDescription>当前本地数据包的版本与来源</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <StatRow label="数据版本" value={stats.version} />
          <StatRow label="发布时间" value={stats.timestamp.replace('T', ' ').slice(0, 19)} />
          <StatRow label="库文件大小" value={formatBytes(stats.fileSizeBytes)} />
          <StatRow
            label="商品编码总数"
            value={formatNumber(stats.recordCount)}
            hint={stats.liveRecordsMatch ? '（与本地库一致）' : `（本地库 ${formatNumber(stats.liveRecordCount)}，不一致！）`}
          />
          <StatRow label="英国源版本 / 日期" value={`${stats.gbSourceVersion || '—'} / ${stats.gbAsOf || '—'}`} />
          <StatRow label="北爱源日期" value={stats.xiAsOf || '—'} />
        </CardContent>
      </Card>

      {/* 默认税率覆盖 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            普通第三国税率覆盖
          </CardTitle>
          <CardDescription>
            有唯一、无条件的官方默认税率（百分比/从量/复合）的编码占比；空白表示官方本身无默认税率，不是 0%。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CoverageBar label="英国 GB" withRate={stats.gbDefault.codesWithDefaultDuty} total={stats.gbDefault.catalogueCodes} />
          <CoverageBar label="北爱尔兰 XI" withRate={stats.xiDefault.codesWithDefaultDuty} total={stats.xiDefault.catalogueCodes} />
          <StatRow label="本地实时校验：GB 有默认税率" value={formatNumber(stats.liveGbWithRate)} />
          <StatRow label="本地实时校验：XI 有默认税率" value={formatNumber(stats.liveXiWithRate)} />
        </CardContent>
      </Card>

      {/* 条件税率与选项 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-4 w-4" />
            条件税率与官方选项
          </CardTitle>
          <CardDescription>查询页「条件税率与其他官方措施」区块的数据来源规模</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <StatRow label="GB 措施选项行" value={formatNumber(stats.gbRateOptionRows)} />
          <StatRow label="XI 措施选项行" value={formatNumber(stats.xiRateOptionRows)} />
          <StatRow label="条件性选项（含授权用途）" value={formatNumber(stats.conditionalRateOptions)} />
          <StatRow
            label="未解析选项"
            value={formatNumber(stats.unresolvedRateOptions)}
            hint={stats.unresolvedRateOptions === 0 ? '（全部解析完成）' : ''}
          />
          <StatRow
            label="缺少税率表达式的选项"
            value={formatNumber(stats.missingRateExpressions)}
            hint="（管制类措施本身无税率，官方如实为空）"
          />
        </CardContent>
      </Card>

      {/* 贸易救济 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            中国原产贸易救济（反倾销 / 反补贴）
          </CardTitle>
          <CardDescription>按企业附加代码分列的条件税率规模；「其他企业」为官方残余档</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">英国 GB</p>
              <StatRow label="涉及反倾销编码" value={formatNumber(stats.gbRemedy.antiDumpingCodes)} />
              <StatRow label="涉及反补贴编码" value={formatNumber(stats.gbRemedy.countervailingCodes)} />
              <StatRow label="中国适用措施行" value={formatNumber(stats.gbRemedy.projectedRows)} />
              <StatRow label="条件税率表达式" value={formatNumber(stats.gbRemedy.conditionRateExpressions)} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">北爱尔兰 XI</p>
              <StatRow label="涉及反倾销编码" value={formatNumber(stats.xiRemedy.antiDumpingCodes)} />
              <StatRow label="涉及反补贴编码" value={formatNumber(stats.xiRemedy.countervailingCodes)} />
              <StatRow label="中国适用措施行" value={formatNumber(stats.xiRemedy.projectedRows)} />
              <StatRow label="条件税率表达式" value={formatNumber(stats.xiRemedy.conditionRateExpressions)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 空白默认税率原因 */}
      <Card>
        <CardHeader>
          <CardTitle>无默认税率编码的原因分布</CardTitle>
          <CardDescription>
            共 {formatNumber(stats.gapAuditRecordCount)} 个编码无默认税率，全部有官方原因（采集端 gap 审计）；
            不含被静默丢弃或伪造为 0% 的数据。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {gapEntries.length === 0 && (
              <p className="text-sm text-muted-foreground">当前数据包未包含原因分布。</p>
            )}
            {gapEntries.map(([reason, count]) => (
              <div key={reason} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{GAP_REASON_LABELS[reason] ?? reason}</span>
                <span className="font-medium">{formatNumber(count)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{stats.rateScope}</p>
    </div>
  );
}
