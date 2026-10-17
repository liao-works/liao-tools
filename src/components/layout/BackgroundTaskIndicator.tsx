import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTaxUpdateStore } from '@/stores/tax-update-store';
import { useAltaUpdateStore } from '@/stores/alta-update-store';

/**
 * 全局后台任务指示器：数据更新在切换页面后继续进行时，
 * 在任意页面的顶栏提示当前进度，点击可回到对应页面查看详情。
 */
export function BackgroundTaskIndicator() {
  const navigate = useNavigate();
  const taxDownloading = useTaxUpdateStore((s) => s.downloading);
  const taxProgress = useTaxUpdateStore((s) => s.downloadProgress);
  const altaUpdating = useAltaUpdateStore((s) => s.updating);

  if (!taxDownloading && !altaUpdating) return null;

  // 税率下载耗时更长、有明确百分比，优先展示；禁运清单更新次之。
  const target = taxDownloading ? '/tax?tab=update' : '/alta';
  const label = taxDownloading
    ? `税率数据后台更新中 ${taxProgress.toFixed(0)}%`
    : '禁运清单后台更新中';

  return (
    <button
      type="button"
      onClick={() => navigate(target)}
      title="更新仍在后台进行，点击查看详情"
      aria-label={label}
      className="hidden items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline-flex"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
