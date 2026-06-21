import { ArrowRight, ArrowLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { UpdateChangeDetail } from '@/types';
import { filterUnchanged } from '@/lib/update-history-utils';

const MODULE_LABEL: Record<string, string> = { tax: '关税', alta: '禁运' };

const CHANGE_BADGE: Record<string, { variant: 'default' | 'destructive' | 'outline'; className: string }> = {
  added: { variant: 'default', className: 'bg-green-500 hover:bg-green-600 text-white border-green-500' },
  removed: { variant: 'destructive', className: '' },
  modified: { variant: 'outline', className: 'border-blue-400 text-blue-600 dark:text-blue-400' },
};

const CHANGE_LABEL: Record<string, string> = {
  added: '新增',
  removed: '删除',
  modified: '修改',
};

interface Props {
  details: UpdateChangeDetail[];
  detailLoading: boolean;
  onBack: () => void;
  module: 'tax' | 'alta';
  /** session 的版本范围，用于面包屑 */
  versionFrom?: string | null;
  versionTo?: string | null;
}

export function UpdateHistoryDetailView({
  details,
  detailLoading,
  onBack,
  module,
  versionFrom,
  versionTo,
}: Props) {
  if (detailLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = filterUnchanged(details);

  if (filtered.length === 0) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回列表
        </Button>
        <p className="py-8 text-center text-muted-foreground">
          本次更新无有效变更（所有变动均为格式差异，实质内容未变）
        </p>
      </div>
    );
  }

  // 按 code 聚合
  const groups = new Map<string, UpdateChangeDetail[]>();
  for (const d of filtered) {
    const existing = groups.get(d.code) ?? [];
    existing.push(d);
    groups.set(d.code, existing);
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        返回列表
      </Button>

      {/* 面包屑 */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <span>{MODULE_LABEL[module]}</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>
          {versionFrom ?? '?'} → {versionTo ?? '?'}
        </span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">变更明细</span>
      </nav>

      {/* 按编码分组的卡片 */}
      <div className="space-y-3">
        {Array.from(groups.entries()).map(([code, changes]) => (
          <div
            key={code}
            className="rounded-lg border bg-card p-4 shadow-sm transition-all"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-sm font-semibold">{code}</span>
              <span className="text-xs text-muted-foreground">
                {changes.length} 个字段变动
              </span>
            </div>
            <div className="space-y-2">
              {changes.map((c) => {
                const badge = CHANGE_BADGE[c.change_type] ?? CHANGE_BADGE.modified;
                return (
                  <div
                    key={c.id}
                    className="flex flex-col gap-1 rounded-md bg-muted/50 p-2.5 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={badge.variant} className={badge.className}>
                        {CHANGE_LABEL[c.change_type] ?? c.change_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {c.field ?? '商品'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm sm:ml-auto">
                      <span className="line-clamp-1 max-w-[200px] truncate text-muted-foreground" title={c.old_value ?? ''}>
                        {c.old_value ?? '—'}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-1 max-w-[200px] truncate font-medium" title={c.new_value ?? ''}>
                        {c.new_value ?? '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
