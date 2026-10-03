import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  RevCalBatchProgress,
  RevCalBatchResult,
  RevCalProduct,
  RevCalQueryResult,
} from '@/types';

export const revCalApi = {
  /**
   * 单码查询（ASIN/UPC/EAN/ISBN/标题关键词）
   */
  async search(keywords: string, countryCode: string): Promise<RevCalProduct[]> {
    return invoke<RevCalProduct[]>('revcal_search', { keywords, countryCode });
  },

  /**
   * 批量查询（逐码顺序请求），进度通过 revcal-batch-progress 事件上报
   */
  async batchSearch(
    codes: string[],
    countryCode: string,
    onProgress?: (progress: RevCalBatchProgress) => void
  ): Promise<RevCalBatchResult> {
    const unlisten = await listen<RevCalBatchProgress>('revcal-batch-progress', (event) => {
      onProgress?.(event.payload);
    });

    try {
      return await invoke<RevCalBatchResult>('revcal_batch_search', { codes, countryCode });
    } finally {
      unlisten();
    }
  },

  /**
   * 从 Excel 第一列读取查询码（跳过表头，过滤空白行）
   */
  async readExcelCodes(inputPath: string): Promise<string[]> {
    return invoke<string[]>('revcal_read_excel_codes', { inputPath });
  },

  /**
   * 导出查询结果为 Excel（splitDimensions=true 时尺寸拆分为长/宽/高/重量数值列）
   */
  async exportExcel(
    results: RevCalQueryResult[],
    outputPath: string,
    splitDimensions: boolean
  ): Promise<string> {
    return invoke<string>('revcal_export_excel', { results, outputPath, splitDimensions });
  },
};
