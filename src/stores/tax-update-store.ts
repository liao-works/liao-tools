import { create } from 'zustand';
import { toast } from '@/hooks/use-toast';
import { taxApi } from '@/lib/api/tax';
import type { TaxVersionInfo } from '@/types';

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

interface TaxUpdateState {
  versionInfo: TaxVersionInfo | null;
  localVersion: TaxVersionInfo['local'] | null;
  offlineCheck: boolean;
  localError: string | null;
  checking: boolean;
  downloading: boolean;
  downloadProgress: number;
  downloadedBytes: number;
  totalBytes: number;
  logs: string[];
  addLog: (message: string) => void;
  refreshLocalVersion: () => Promise<void>;
  checkUpdate: () => Promise<void>;
  startDownload: () => Promise<void>;
}

/**
 * 数据更新任务与页面解耦：状态保存在模块级 store，动作在组件外执行，
 * 切换页面只会卸载视图，不会打断正在进行的检查或下载。
 */
export const useTaxUpdateStore = create<TaxUpdateState>()((set, get) => ({
  versionInfo: null,
  localVersion: null,
  offlineCheck: false,
  localError: null,
  checking: false,
  downloading: false,
  downloadProgress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  logs: [],

  addLog: (message) => {
    const timestamp = new Date().toLocaleTimeString();
    set((state) => ({ logs: [...state.logs, `[${timestamp}] ${message}`] }));
  },

  refreshLocalVersion: async () => {
    try {
      set({ localVersion: await taxApi.getLocalVersion(), localError: null });
    } catch (error) {
      set({ localError: String(error) });
      get().addLog(`本地版本读取失败: ${String(error)}`);
    }
  },

  checkUpdate: async () => {
    if (get().checking || get().downloading) return;
    set({ checking: true, logs: [] });
    get().addLog('开始检查更新...');
    // Local metadata is independent of the online update check.
    await get().refreshLocalVersion();

    try {
      const data = await taxApi.checkUpdate();
      set({ versionInfo: data, localVersion: data.local, offlineCheck: false });
      get().addLog('检查完成');

      if (data.has_update) {
        get().addLog(`发现新版本: ${data.remote.version}`);
        get().addLog(`记录总量变化: ${data.remote.records - data.local.records} 条（不是新增记录数）`);
        // 更新前预览（来自服务端 data_changes）
        if (data.data_changes?.summary) {
          const s = data.data_changes.summary;
          get().addLog(`本次预计变动: 新增 ${s.added} / 删除 ${s.removed} / 修改 ${s.modified}`);
        }
        toast({
          title: '发现新版本',
          description: data.data_changes?.summary
            ? `新增 ${data.data_changes.summary.added} / 删除 ${data.data_changes.summary.removed} / 修改 ${data.data_changes.summary.modified}`
            : `版本 ${data.remote.version} 可用`,
        });
      } else {
        get().addLog('当前已是最新版本');
        toast({
          title: '已是最新版本',
          description: '无需更新',
        });
      }
    } catch (error) {
      set({ versionInfo: null, offlineCheck: true });
      get().addLog(`未能连接远程数据源，仍可使用已有本地数据库: ${String(error)}`);
      toast({
        title: '无法联网检查最新版本',
        description: '本地已安装的数据仍可离线查询，请注意版本日期。',
      });
    } finally {
      set({ checking: false });
    }
  },

  startDownload: async () => {
    if (get().downloading) return;
    set({ downloading: true, downloadProgress: 0, downloadedBytes: 0, totalBytes: 0 });
    get().addLog('开始下载更新...');

    try {
      const installed = await taxApi.downloadUpdate((downloaded, total) => {
        set({ downloadedBytes: downloaded, totalBytes: total });
        const percentage = total > 0 ? (downloaded / total) * 100 : 0;
        set({ downloadProgress: percentage });

        if (Math.floor(percentage) % 25 === 0 && percentage > 0 && percentage < 100) {
          get().addLog(`下载进度: ${percentage.toFixed(1)}% (${formatBytes(downloaded)} / ${formatBytes(total)})`);
        }
      });

      if (!installed) throw new Error('更新命令未确认安装成功，本地税率数据未判定为已更新');
      get().addLog('税率更新命令已确认成功');
      set({ versionInfo: null }); // Previous remote comparison is no longer valid after installation.
      await get().refreshLocalVersion();
      toast({
        title: '税率数据更新已完成',
        description: '请查看本地版本；需要最新远程对比可再次点击检查更新。',
      });
    } catch (error) {
      const errorMsg = String(error);
      get().addLog(`更新失败: ${errorMsg}`);
      toast({
        title: '更新失败',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      set({ downloading: false });
    }
  },
}));
