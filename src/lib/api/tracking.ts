import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { withUsage } from '@/lib/api/usage';

/** 单号查询结果行 */
export interface TrackingRow {
  number: string;
  /** 承运商名称（可能为空） */
  carrier: string;
  /** 17TRACK 主状态原文（如 InTransit / Delivered） */
  status: string;
  subStatus: string;
  latestEventTime: string;
  latestEventDescription: string;
  latestEventLocation: string;
  transitDays: number | null;
  /** 预计送达区间展示串 */
  estimatedDelivery: string;
  /** 查询失败原因 */
  error: string | null;
}

export interface TrackingBatchResult {
  total: number;
  success: number;
  failed: number;
  rows: TrackingRow[];
}

/** 17TRACK 主状态中文标签；未收录的状态显示原文 */
export const TRACKING_STATUS_LABELS: Record<string, string> = {
  NotFound: '未查到轨迹',
  InfoReceived: '已收录信息',
  InTransit: '运输中',
  Expired: '包裹过期',
  AvailableForPickup: '待取件',
  OutForDelivery: '派送中',
  DeliveryFailure: '派送失败',
  Delivered: '已签收',
  Exception: '异常',
};

export function trackingStatusLabel(status: string): string {
  return TRACKING_STATUS_LABELS[status] || status;
}

/** API Key 的本地存储键；仅保存在本机 localStorage */
export const TRACKING_TOKEN_STORAGE_KEY = 'tracking-17api-token';

/** 17TRACK API 申请入口（注册并开通 API 服务） */
export const TRACKING_APPLY_URL = 'https://www.17track.net/zh-cn/api';

/** 17TRACK 接口开发文档（中文） */
export const TRACKING_DOCS_URL = 'https://asset.17track.net/api/document/v2.4_zh/index.html';

/** 单次接口上限（与 Rust 端 MAX_BATCH 一致），用于前端提示分批规模 */
export const MAX_BATCH_SIZE = 40;

export const trackingApi = {
  /**
   * 批量轨迹查询（17TRACK 开放接口，用户自备 API Key）
   */
  async batchQuery(
    numbers: string[],
    apiKey: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<TrackingBatchResult> {
    const unlisten = await listen<{ current: number; total: number }>(
      'tracking-progress',
      (event) => {
        if (onProgress) {
          onProgress(event.payload.current, event.payload.total);
        }
      },
    );
    try {
      return await withUsage(
        { tool: 'tracking', action: 'query', items: numbers.length },
        () => invoke<TrackingBatchResult>('tracking_batch_query', {
          request: { numbers, apiKey },
        }),
      );
    } catch (error) {
      console.error('轨迹查询失败:', error);
      throw error;
    } finally {
      unlisten();
    }
  },

  /** 导出查询结果到 Excel */
  async exportResults(rows: TrackingRow[], outputPath: string): Promise<void> {
    try {
      await invoke('tracking_export_results', { rows, outputPath });
    } catch (error) {
      console.error('导出轨迹结果失败:', error);
      throw error;
    }
  },
};
