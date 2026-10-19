import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { withUsage } from '@/lib/api/usage';

/** 同规格包裹行：长宽高为同单位下的单件尺寸 */
export interface CbmPackage {
  name: string;
  length: number;
  width: number;
  height: number;
  /** mm / cm / m / in / ft */
  lengthUnit: string;
  /** 每件实重，0 表示未提供 */
  weight: number;
  /** g / kg / lb */
  weightUnit: string;
  quantity: number;
}

export interface CbmRequest {
  packages: CbmPackage[];
  /** 体积重系数 cm³/kg：6000 空运 / 5000 快递 / 1000 海运拼箱 */
  divisor: number;
}

export interface CbmBatchParams {
  lengthUnit: string;
  weightUnit: string;
  divisor: number;
}

export interface CbmPackageResult {
  name: string;
  line: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  quantity: number;
  totalVolumeCbm: number;
  totalActualWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  /** "实重" 或 "体积重" */
  chargeBasis: string;
}

export interface CbmContainerEstimate {
  name: string;
  internal: string;
  capacityCbm: number;
  payloadKg: number;
  containersByVolume: number;
  containersByWeight: number;
  containersNeeded: number;
}

export interface CbmResult {
  packages: CbmPackageResult[];
  totalVolumeCbm: number;
  totalActualWeightKg: number;
  totalVolumetricWeightKg: number;
  chargeableWeightKg: number;
  chargeBasis: string;
  divisor: number;
  containers: CbmContainerEstimate[];
  errors: string[];
}

export interface CbmBatchResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
  outputPath: string;
}

export const CBM_PRESETS = [
  { value: 'air', label: '空运（1:6000）', divisor: 6000 },
  { value: 'express', label: '国际快递（1:5000）', divisor: 5000 },
  { value: 'sea', label: '海运拼箱（1:1000）', divisor: 1000 },
  { value: 'custom', label: '自定义系数', divisor: 6000 },
] as const;

export const cbmApi = {
  /** 体积 / 计费重试算（纯本地计算） */
  async calculate(request: CbmRequest): Promise<CbmResult> {
    try {
      return await withUsage(
        { tool: 'cbm', action: 'process', items: request.packages.length },
        () => invoke<CbmResult>('cbm_calculate', { request }),
      );
    } catch (error) {
      console.error('体积试算失败:', error);
      throw error;
    }
  },

  /** 批量体积 / 计费重试算（Excel 文件） */
  async calcBatch(
    inputPath: string,
    params: CbmBatchParams,
    onProgress?: (current: number, total: number) => void,
  ): Promise<CbmBatchResult> {
    const unlisten = await listen<{ current: number; total: number }>(
      'cbm-batch-progress',
      (event) => {
        if (onProgress) {
          onProgress(event.payload.current, event.payload.total);
        }
      },
    );
    try {
      return await withUsage(
        { tool: 'cbm', action: 'process' },
        () => invoke<CbmBatchResult>('cbm_batch', { inputPath, params }),
        (result) => result.total,
      );
    } catch (error) {
      console.error('批量体积试算失败:', error);
      throw error;
    } finally {
      unlisten();
    }
  },

  /** 下载批量试算 Excel 模板 */
  async downloadTemplate(outputPath: string): Promise<void> {
    try {
      await invoke('cbm_template', { outputPath });
    } catch (error) {
      console.error('下载模板失败:', error);
      throw error;
    }
  },
};
