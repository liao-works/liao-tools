import { invoke } from '@tauri-apps/api/core';

export type UsageRange = 'week' | 'month';

export interface UsageEventInput {
  /** 工具标识：tax / alta / revcal / excel / upsdpd */
  tool: string;
  /** 'query'（items = 编码数）或 'process'（items = 行/文件数） */
  action: 'query' | 'process';
  items?: number;
  durationMs?: number;
}

export interface UsageDayRow {
  day: string;
  queries: number;
  query_items: number;
  process_items: number;
  duration_ms: number;
}

export interface UsageToolRow {
  tool: string;
  queries: number;
  query_items: number;
  process_items: number;
  duration_ms: number;
}

export interface UsageSummary {
  range: UsageRange;
  days: UsageDayRow[];
  tools: UsageToolRow[];
  total_queries: number;
  total_query_items: number;
  total_process_items: number;
  total_duration_ms: number;
}

/** 记录一次工具使用；失败静默忽略，统计绝不能影响工具本身 */
export function recordUsage(event: UsageEventInput): void {
  void invoke('usage_record', { event }).catch(() => undefined);
}

/** 带时长统计的工具调用包装：记录耗时与数据量后原样返回结果 */
export async function withUsage<T>(
  event: UsageEventInput,
  run: () => Promise<T>,
  getItems?: (result: T) => number | undefined,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await run();
    recordUsage({
      ...event,
      durationMs: Math.round(performance.now() - started),
      items: getItems?.(result) ?? event.items ?? 0,
    });
    return result;
  } catch (error) {
    recordUsage({
      ...event,
      durationMs: Math.round(performance.now() - started),
      items: 0,
    });
    throw error;
  }
}

export async function getUsageSummary(range: UsageRange): Promise<UsageSummary> {
  return invoke<UsageSummary>('usage_summary', { range });
}

export const USAGE_TOOL_LABELS: Record<string, string> = {
  tax: '关税查询',
  alta: 'Alta 禁运查询',
  revcal: 'Amazon 商品查询',
  excel: 'Excel 数据拆分',
  upsdpd: 'UPS / DPD',
  cbm: '体积 / 计费重计算',
};

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes} 分 ${seconds} 秒`;
}
