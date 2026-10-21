import { create } from 'zustand';
import { altaApi } from '@/lib/api/alta';
import { taxApi } from '@/lib/api/tax';

export type DataModule = 'tax' | 'alta';

interface ModuleUpdateStatus {
  /** null = 未知（尚未检查或检查失败）；true = 远程有更新；false = 已是最新 */
  hasUpdate: boolean | null;
  checking: boolean;
}

interface DataUpdateStatusState {
  tax: ModuleUpdateStatus;
  alta: ModuleUpdateStatus;
  lastCheckedAt: number | null;
  /** 静默检查远程数据库是否有更新：不弹 toast、不写日志，失败视为未知（绿点不亮）。 */
  checkAll: () => Promise<void>;
  /** 本地完成对应模块更新后调用，绿点随即消失。 */
  markUpdated: (module: DataModule) => void;
}

let inflight: Promise<void> | null = null;

/**
 * 数据维护绿点状态：与更新任务 store 解耦，供侧边栏在任何页面订阅。
 * 检查动作复用业务查询命令（tax_check_update / check_alta_update），只读不写库。
 */
export const useDataUpdateStatusStore = create<DataUpdateStatusState>()((set) => ({
  tax: { hasUpdate: null, checking: false },
  alta: { hasUpdate: null, checking: false },
  lastCheckedAt: null,

  checkAll: () => {
    if (inflight) return inflight;
    inflight = (async () => {
      set((s) => ({ tax: { ...s.tax, checking: true }, alta: { ...s.alta, checking: true } }));

      const [taxResult, altaResult] = await Promise.allSettled([
        taxApi.checkUpdate(),
        altaApi.checkForUpdate(),
      ]);

      set((s) => ({
        tax: {
          ...s.tax,
          hasUpdate: taxResult.status === 'fulfilled' ? taxResult.value.has_update : null,
          checking: false,
        },
        alta: {
          ...s.alta,
          hasUpdate: altaResult.status === 'fulfilled' ? altaResult.value.has_update : null,
          checking: false,
        },
        lastCheckedAt: Date.now(),
      }));
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  },

  markUpdated: (module) => {
    set((s) => (module === 'tax'
      ? { tax: { ...s.tax, hasUpdate: false } }
      : { alta: { ...s.alta, hasUpdate: false } }));
  },
}));
