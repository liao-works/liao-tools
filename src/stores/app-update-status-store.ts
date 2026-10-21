import { create } from 'zustand';

interface AppUpdateStatusState {
  /** null = 未知（尚未检查或检查失败）；true = 有新版本；false = 已是最新 */
  hasUpdate: boolean | null;
  latestVersion: string | null;
  /** 由自动检查（MainLayout）与手动检查（UpdateDialog）回填结果。 */
  setUpdateStatus: (info: { has_update: boolean; latest_version: string }) => void;
}

/**
 * 应用更新绿点状态：检查本身仍由 MainLayout 的定时任务与更新弹窗执行，
 * store 只负责把结果暴露给侧边栏，避免重复发起检查。
 * 安装成功后应用会重启，重启后的首次检查会把状态置回“已是最新”。
 */
export const useAppUpdateStatusStore = create<AppUpdateStatusState>()((set) => ({
  hasUpdate: null,
  latestVersion: null,
  setUpdateStatus: (info) => {
    set({
      hasUpdate: info.has_update,
      latestVersion: info.has_update ? info.latest_version : null,
    });
  },
}));
