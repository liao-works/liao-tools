import { create } from 'zustand';
import { toast } from '@/hooks/use-toast';
import { altaApi } from '@/lib/api/alta';
import { useDataUpdateStatusStore } from '@/stores/data-update-status-store';

interface AltaUpdateState {
  updating: boolean;
  logs: string[];
  updateError: string | null;
  addLog: (message: string) => void;
  /** 返回更新是否成功；完成后调用方可以刷新本地数据库状态。 */
  startUpdate: () => Promise<boolean>;
}

/**
 * 禁运清单更新任务与页面解耦：状态保存在模块级 store，动作在组件外执行，
 * 切换页面只会卸载视图，不会打断正在进行的更新。
 */
export const useAltaUpdateStore = create<AltaUpdateState>()((set, get) => ({
  updating: false,
  logs: [],
  updateError: null,

  addLog: (message) => {
    set((state) => ({ logs: [...state.logs, message] }));
  },

  startUpdate: async () => {
    if (get().updating) return false;
    set({ updating: true, updateError: null, logs: ['开始更新禁运清单…'] });
    try {
      const result = await altaApi.updateDatabase();
      if (!result.success) {
        throw new Error(result.message || '更新命令未确认成功');
      }
      set({
        logs: [
          '禁运清单更新命令已确认成功',
          '本次更新报告记录数：' + result.items_count.toLocaleString(),
          result.message,
        ].filter(Boolean),
      });
      toast({ title: '禁运清单更新完成', description: result.message });
      // 本地已是最新，侧边栏数据维护绿点随之消除。
      useDataUpdateStatusStore.getState().markUpdated('alta');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ updateError: message });
      get().addLog('更新失败：' + message);
      toast({ title: '禁运清单更新失败', description: message, variant: 'destructive' });
      return false;
    } finally {
      set({ updating: false });
    }
  },
}));
