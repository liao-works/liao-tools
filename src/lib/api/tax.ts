import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { withUsage } from '@/lib/api/usage';
import type { TaxTariff, TaxVersionInfo } from '@/types';


export interface TaxPreviewSummary {
  release_id: string;
  as_of: string;
  digest: string;
  record_count: number;
  gb_verified: number;
  gb_conditional: number;
  ni_unverified: number;
  production_eligible: false;
}

export interface TaxPreviewRate {
  code: string;
  description?: string | null;
  gb_rate: string;
  ni_legacy_rate?: string | null;
  gb_status: string;
  ni_status: string;
}

export interface TaxSignedReviewResult {
  release_id: string;
  as_of: string;
  key_id: string;
  verified_signature: boolean;
  production_eligible: false;
  record_count: number;
  gb_verified: number;
  gb_conditional: number;
  ni_unverified: number;
  sha256: string;
}

export interface NiReviewItem {
  code: string;
  verdict: string;
  comparison: string;
  legacy?: string | null;
  candidate?: string | null;
  source_url?: string | null;
}

export interface NiReviewReport {
  kind: 'xi-other-evidence-gate-v1';
  as_of: string;
  samples: number;
  chapters: number;
  required_chapters: number;
  audit_sha256: string;
  evidence_complete: boolean;
  status: 'review_required' | 'insufficient_evidence';
  manual_review_count: number;
  manual_review_items: NiReviewItem[];
  production_eligible: false;
  other_semantics_verified: false;
}

export const taxApi = {
  async readNiReview(path: string): Promise<NiReviewReport> {
    return invoke<NiReviewReport>('tax_read_ni_review', { path });
  },
  async hasSignedReviewTrustKey(): Promise<boolean> {
    return invoke<boolean>('tax_has_signed_review_trust_key');
  },

  async verifySignedReview(archivePath: string): Promise<TaxSignedReviewResult> {
    return invoke<TaxSignedReviewResult>('tax_verify_signed_review', { archivePath });
  },

  /**
   * 检查数据库是否有数据
   */
  async checkDataExists(): Promise<boolean> {
    // Local-only check: distinguish an absent database from a failed query.
    return invoke<boolean>('tax_has_local_data');
  },

  async getLocalVersion(): Promise<TaxVersionInfo['local']> {
    return invoke<TaxVersionInfo['local']>('tax_get_local_version');
  },

  /**
   * 精确查询税率
   */
  async exactSearch(code: string): Promise<TaxTariff | null> {
    try {
      return await withUsage({ tool: 'tax', action: 'query', items: 1 },
        () => invoke<TaxTariff | null>('tax_exact_search', { code }));
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
      return await withUsage({ tool: 'tax', action: 'query', items: 1 },
        () => invoke<TaxTariff[]>('tax_fuzzy_search', { query, limit }));
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
      const result = await withUsage(
        { tool: 'tax', action: 'query' },
        () => invoke<{
          total: number;
          success: number;
          errors: string[];
          output_path: string;
        }>('tax_batch_query', { inputPath }),
        (result) => result.total,
      );

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

  /** Local, unsigned shadow-only preview. Never activates a production dataset. */
  async importPreview(archivePath: string): Promise<TaxPreviewSummary> {
    return invoke<TaxPreviewSummary>('tax_import_preview', { archivePath });
  },

  async previewLookup(digest: string, code: string): Promise<TaxPreviewRate | null> {
    return invoke<TaxPreviewRate | null>('tax_preview_lookup', { digest, code });
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
   * 单行更新：默认只做网页比对；applyToDb 为 true 时把发现的差异写入本地数据库
   */
  async updateSingleRow(code: string, applyToDb?: boolean): Promise<UpdateResult> {
    try {
      const result = await invoke<UpdateResult>('tax_update_single_row', { code, applyToDb });
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
  /** 用户选择写入时，本次是否已实际写进本地数据库 */
  appliedToDb?: boolean;
}

// ============ 数据统计视图 ============

export interface RegionDefaultCoverage {
  catalogueCodes: number;
  codesWithDefaultDuty: number;
  codesWithoutDefaultDuty: number;
}

export interface RegionRemedyCoverage {
  sourceRows: number;
  projectedRows: number;
  antiDumpingCodes: number;
  countervailingCodes: number;
  conditionRateExpressions: number;
}

export interface TaxDataStats {
  available: boolean;
  version: string;
  timestamp: string;
  fileSizeBytes: number;
  recordCount: number;
  liveRecordCount: number;
  liveRecordsMatch: boolean;
  liveGbWithRate: number;
  liveXiWithRate: number;
  gbSourceVersion: string;
  gbAsOf: string;
  xiAsOf: string;
  gbDefault: RegionDefaultCoverage;
  xiDefault: RegionDefaultCoverage;
  gbRateOptionRows: number;
  xiRateOptionRows: number;
  conditionalRateOptions: number;
  unresolvedRateOptions: number;
  missingRateExpressions: number;
  gbRemedy: RegionRemedyCoverage;
  xiRemedy: RegionRemedyCoverage;
  gapAuditRecordCount: number;
  gapByRegionReason: Record<string, number>;
  rateScope: string;
}

// ============ 数据更新事件日志 ============

export type TaxUpdateEvent =
  | { type: 'check'; timestamp: string; ok: boolean; hasUpdate: boolean; remoteVersion?: string | null; detail?: string | null }
  | { type: 'downloadStart'; timestamp: string; fromVersion: string; toVersion: string }
  | { type: 'downloadComplete'; timestamp: string; toVersion: string; sizeBytes: number; durationMs: number }
  | { type: 'install'; timestamp: string; fromVersion: string; toVersion: string; recordCount: number }
  | { type: 'failure'; timestamp: string; stage: string; detail: string };

export interface TaxUpdateStatsApi {
  getDataStats(): Promise<TaxDataStats>;
  getUpdateEvents(limit?: number): Promise<TaxUpdateEvent[]>;
  clearUpdateEvents(): Promise<number>;
}

export const taxStatsApi: TaxUpdateStatsApi = {
  async getDataStats() {
    return invoke<TaxDataStats>('tax_get_data_stats');
  },
  async getUpdateEvents(limit?: number) {
    return invoke<TaxUpdateEvent[]>('tax_get_update_events', { limit });
  },
  async clearUpdateEvents() {
    return invoke<number>('tax_clear_update_events');
  },
};
