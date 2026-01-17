import { invoke } from '@tauri-apps/api/core';

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  download_url: string;
  release_notes: string;
  published_at: string;
}

export interface UpdateSettings {
  auto_check: boolean;
  last_check_time: number;
  check_interval_hours: number;
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
