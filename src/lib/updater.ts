import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { check as checkSigned, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

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
  update_channel?: 'signed' | 'manual';
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

const RELEASES = 'https://github.com/liao-works/liao-tools/releases';
const SIGNED_TOKEN = 'tauri-signed-update';
let pendingUpdate: Update | null = null;
let pendingSignedVersion = '';
let activeCheck: Promise<UpdateInfo> | null = null;
let checkingMode: Promise<boolean> | null = null;

/** The signed channel is enabled solely by the trusted key baked into the Rust binary. */
export function signedUpdaterAvailable(): Promise<boolean> {
  if (!checkingMode) {
    checkingMode = invoke<unknown>('signed_updater_available')
      .then(value => {
        if (typeof value !== 'boolean') {
          throw new Error('无法确认客户端更新签名状态，已停止更新操作以避免降级。');
        }
        return value;
      }).catch(error => {
        checkingMode = null; // Retry mode inspection next time; never assume unsigned.
        throw error;
      });
  }
  return checkingMode;
}

async function clearPendingUpdate(): Promise<void> {
  const old = pendingUpdate;
  pendingUpdate = null;
  pendingSignedVersion = '';
  if (old) await old.close().catch(() => undefined);
}

async function checkSignedUpdates(): Promise<UpdateInfo> {
  await clearPendingUpdate();
  const update = await checkSigned();
  if (!update) {
    const current = await invoke<string>('get_current_version');
    return {
      current_version: current,
      latest_version: current,
      has_update: false,
      download_url: RELEASES,
      release_notes: '',
      published_at: '',
      platform_specific_url: null,
      checksum_sha256: null,
      update_channel: 'signed',
    };
  }
  pendingUpdate = update;
  pendingSignedVersion = update.version;
  return {
    current_version: update.currentVersion,
    latest_version: update.version,
    has_update: true,
    download_url: RELEASES,
    release_notes: update.body || '',
    published_at: update.date || '',
    platform_specific_url: SIGNED_TOKEN,
    checksum_sha256: null, // signed channel uses the trusted public key, never local SHA metadata
    update_channel: 'signed',
  };
}

/** Coalesce startup + modal checks. Signed builds never fall back to unsigned installers. */
export async function checkForUpdates(): Promise<UpdateInfo> {
  if (activeCheck) return activeCheck;
  const current = (async () => {
    if (await signedUpdaterAvailable()) return checkSignedUpdates();
    const info = await invoke<UpdateInfo>('check_for_updates');
    return { ...info, update_channel: 'manual' as const };
  })();
  activeCheck = current;
  try { return await current; } finally {
    if (activeCheck === current) activeCheck = null;
  }
}

export const loadUpdateSettings = () => invoke<UpdateSettings>('load_update_settings');
export const saveUpdateSettings = (settings: UpdateSettings) =>
  invoke<void>('save_update_settings', { settings });
export const updateLastCheckTime = () => invoke<void>('update_last_check_time');
export const getCurrentVersion = () => invoke<string>('get_current_version');

/**
 * Signed downloads are authenticated against the baked-in public key by the
 * official updater. Manual legacy downloads retain URL/SHA-256 safeguards in Rust.
 */
export async function downloadUpdate(
  url: string,
  version: string,
  checksumSha256?: string | null,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<string> {
  if (await signedUpdaterAvailable()) {
    if (!pendingUpdate || pendingSignedVersion !== version || url !== SIGNED_TOKEN) {
      throw new Error('签名更新会话已失效，请重新检查版本。');
    }
    let downloaded = 0;
    let total = 0;
    await pendingUpdate.download(event => {
      if (event.event === 'Started') {
        total = event.data.contentLength || 0;
        downloaded = 0;
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
      } else if (event.event === 'Finished' && total > 0) {
        downloaded = total;
      }
      onProgress?.({
        downloaded,
        total,
        percentage: total > 0 ? Math.min(100, downloaded / total * 100) : 0,
      });
    });
    return SIGNED_TOKEN;
  }
  if (!checksumSha256) throw new Error('缺少官方 SHA-256，拒绝下载。');
  return invoke<string>('download_update', { url, version, checksumSha256 });
}

/** Installation always requires a separate deliberate user action. */
export async function installUpdate(filePath: string, silent = false): Promise<string> {
  if (await signedUpdaterAvailable()) {
    if (silent) throw new Error('不允许无人确认的静默更新。');
    if (filePath !== SIGNED_TOKEN || !pendingUpdate) {
      throw new Error('签名安装会话已失效，请重新检查更新。');
    }
    const update = pendingUpdate;
    // Official plugin verifies the signature before installing.
    // On Windows the native updater closes the application when installing.
    await update.install();
    await clearPendingUpdate();
    // macOS/Linux need restart after installation.
    if (navigator.userAgent.includes('Mac') || navigator.userAgent.includes('Linux')) {
      return '签名校验与安装已完成，请重新启动应用以使用新版本。';
    }
    return '签名安装程序已启动，请按照系统提示完成升级。';
  }
  return invoke<string>('install_update', { filePath, silent });
}

export async function restartAfterSignedInstall(): Promise<void> {
  if (!(await signedUpdaterAvailable())) throw new Error('当前不是签名更新渠道。');
  await relaunch();
}
export const listenToDownloadProgress = (callback: (value: DownloadProgress) => void): Promise<UnlistenFn> =>
  listen<DownloadProgress>('download-progress', event => callback(event.payload));
export const restartApp = () => invoke<void>('restart_app');
export const quitApp = () => invoke<void>('quit_app');
