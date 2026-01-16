import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TaxTariff, TaxVersionInfo } from '@/types';

export const taxApi = {
  /**
   * 检查数据库是否有数据
   */
  async checkDataExists(): Promise<boolean> {
    try {
      const versionInfo = await this.checkUpdate();
      return versionInfo.local.records > 0;
    } catch (error) {
      console.error('检查数据存在性失败:', error);
      return false;
    }
  },

  /**
   * 精确查询税率
   */
  async exactSearch(code: string): Promise<TaxTariff | null> {
    try {
      const result = await invoke<TaxTariff | null>('tax_exact_search', { code });
      return result;
    } catch (error) {
      console.error('精确查询失败:', error);
      throw error;
    }
  },

  /**
   * 模糊查询税率
   */
  async fuzzySearch(query: string, limit = 10): Promise<TaxTariff[]> {
    try {
      const results = await invoke<TaxTariff[]>('tax_fuzzy_search', { query, limit });
      return results;
    } catch (error) {
      console.error('模糊查询失败:', error);
      throw error;
    }
  },

  /**
   * 批量查询（Excel文件）
   */
  async batchQuery(
    inputPath: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ total: number; success: number; errors: string[]; outputPath: string }> {
    // 监听进度事件
    const unlisten = await listen<{ current: number; total: number }>(
      'batch-progress',
      (event) => {
        if (onProgress) {
          onProgress(event.payload.current, event.payload.total);
        }
      }
    );

    try {
      const result = await invoke<{
        total: number;
        success: number;
        errors: string[];
        output_path: string;
      }>('tax_batch_query', { inputPath });
      
      return {
        total: result.total,
        success: result.success,
        errors: result.errors,
        outputPath: result.output_path,
      };
    } catch (error) {
      console.error('批量查询失败:', error);
      throw error;
    } finally {
      unlisten();
    }
  },

  /**
   * 下载Excel模板
   */
  async downloadTemplate(outputPath: string): Promise<void> {
    try {
      await invoke('tax_download_template', { outputPath });
    } catch (error) {
      console.error('下载模板失败:', error);
      throw error;
    }
  },

  /**
   * 检查更新
   */
  async checkUpdate(): Promise<TaxVersionInfo> {
    try {
      const versionInfo = await invoke<TaxVersionInfo>('tax_check_update');
      return versionInfo;
    } catch (error) {
      console.error('检查更新失败:', error);
      throw error;
    }
  },

  /**
   * 下载并安装更新
   */
  async downloadUpdate(
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<boolean> {
    // 监听进度事件
    const unlisten = await listen<{ downloaded: number; total: number }>(
      'download-progress',
      (event) => {
        if (onProgress) {
          onProgress(event.payload.downloaded, event.payload.total);
        }
      }
    );

    try {
      const success = await invoke<boolean>('tax_download_update');
      return success;
    } catch (error) {
      console.error('下载更新失败:', error);
      throw error;
    } finally {
      unlisten();
    }
  },

  /**
   * 打开URL或文件路径（使用系统默认程序）
   */
  async openUrl(url: string): Promise<void> {
    try {
      await invoke('tax_open_url', { url });
    } catch (error) {
      console.error('打开失败:', error);
      throw error;
    }
  },

  /**
   * 更新单行税率数据
   */
  async updateSingleRow(code: string): Promise<UpdateResult> {
    try {
      const result = await invoke<UpdateResult>('tax_update_single_row', { code });
      return result;
    } catch (error) {
      console.error('更新单行数据失败:', error);
      throw error;
    }
  },
};

/**
 * 单行更新结果
 */
export interface UpdateResult {
  success: boolean;
  message: string;
  ukUpdated: boolean;
  niUpdated: boolean;
  oldUkRate?: string;
  newUkRate?: string;
  oldNiRate?: string;
  newNiRate?: string;
  newDescription?: string;
}
