import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';


/**
 * Tauri commands may reject with a serialized { code, message } object rather
 * than a native Error. Preserve the actual backend cause for the update UI.
 */
export function formatUpdaterError(error: unknown, fallback = '操作失败'): string {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const detail = error as { message?: unknown; code?: unknown };
    if (typeof detail.message === 'string' && detail.message.trim()) {
      const code = typeof detail.code === 'string' && detail.code.trim()
        ? `（${detail.code}）`
        : '';
      return `${detail.message.trim()}${code}`;
    }
  }
  return fallback;
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  download_url: string;
  release_notes: string;
  published_at: string;
  platform_specific_url?: string;
  file_size?: number;
}

export interface UpdateSettings {
  auto_check: boolean;
  last_check_time: number;
  check_interval_hours: number;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

export interface PlatformInfo {
  platform: string;
  arch: string;
  os_family: string;
}

/**
 * 安装完成事件
 */
export interface InstallCompleteEvent {
  success: boolean;
  message: string;
  needs_restart: boolean;
}

/**
 * 检查更新
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  return await invoke('check_for_updates');
}

/**
 * 加载更新设置
 */
export async function loadUpdateSettings(): Promise<UpdateSettings> {
  return await invoke('load_update_settings');
}

/**
 * 保存更新设置
 */
export async function saveUpdateSettings(settings: UpdateSettings): Promise<void> {
  await invoke('save_update_settings', { settings });
}

/**
 * 更新最后检查时间
 */
export async function updateLastCheckTime(): Promise<void> {
  await invoke('update_last_check_time');
}

/**
 * 获取当前版本
 */
export async function getCurrentVersion(): Promise<string> {
  return await invoke('get_current_version');
}

/**
 * 获取平台信息
 */
export async function getPlatformInfo(): Promise<PlatformInfo> {
  return await invoke('get_platform_info');
}

/**
 * 下载更新
 */
export async function downloadUpdate(url: string, version: string): Promise<string> {
  return await invoke('download_update', { url, version });
}

/**
 * 安装更新
 */
export async function installUpdate(filePath: string, silent: boolean = true): Promise<string> {
  return await invoke('install_update', { filePath, silent });
}

/**
 * 监听下载进度
 */
export async function listenToDownloadProgress(
  callback: (progress: DownloadProgress) => void
): Promise<UnlistenFn> {
  return await listen<DownloadProgress>('download-progress', (event) => {
    callback(event.payload);
  });
}

/**
 * 监听安装完成事件
 */
export async function listenToInstallComplete(
  callback: (event: InstallCompleteEvent) => void
): Promise<UnlistenFn> {
  return await listen<InstallCompleteEvent>('install-complete', (event) => {
    callback(event.payload);
  });
}

/**
 * 重启应用
 */
export async function restartApp(): Promise<void> {
  return await invoke('restart_app');
}

/**
 * 退出应用
 */
export async function quitApp(): Promise<void> {
  return await invoke('quit_app');
}
