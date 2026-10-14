import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  download_url: string;
  release_notes: string;
  published_at: string;
  platform_specific_url?: string | null;
  file_size?: number | null;
  checksum_sha256?: string | null;
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
export interface InstallCompleteEvent {
  success: boolean;
  message: string;
  needs_restart: boolean;
}

export const checkForUpdates = () => invoke<UpdateInfo>('check_for_updates');
export const loadUpdateSettings = () => invoke<UpdateSettings>('load_update_settings');
export const saveUpdateSettings = (settings: UpdateSettings) =>
  invoke<void>('save_update_settings', { settings });
export const updateLastCheckTime = () => invoke<void>('update_last_check_time');
export const getCurrentVersion = () => invoke<string>('get_current_version');
export const downloadUpdate = (url: string, version: string, checksumSha256: string) =>
  invoke<string>('download_update', { url, version, checksumSha256 });
export const installUpdate = (filePath: string, silent = false) =>
  invoke<string>('install_update', { filePath, silent });
export const listenToDownloadProgress = (callback: (value: DownloadProgress) => void): Promise<UnlistenFn> =>
  listen<DownloadProgress>('download-progress', event => callback(event.payload));
export const restartApp = () => invoke<void>('restart_app');
export const quitApp = () => invoke<void>('quit_app');
