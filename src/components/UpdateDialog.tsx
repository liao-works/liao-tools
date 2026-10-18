import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Download, Loader2, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  checkForUpdates,
  formatUpdaterError,
  loadUpdateSettings,
  saveUpdateSettings,
  updateLastCheckTime,
  downloadUpdate,
  installUpdate,
  listenToDownloadProgress,
  listenToInstallComplete,
  type UpdateInfo,
  type DownloadProgress,
} from '@/lib/updater';
import { UpdateCompleteDialog } from './UpdateCompleteDialog';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoCheck?: boolean;
}

export function UpdateDialog({ open, onOpenChange, autoCheck = false }: UpdateDialogProps) {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);

  // 新增：安装完成相关状态
  const [installComplete, setInstallComplete] = useState(false);
  const [newVersion, setNewVersion] = useState<string>('');
  const [installRequested, setInstallRequested] = useState(false);
  const [installStatus, setInstallStatus] = useState<string | null>(null);
  const latestVersionRef = useRef('');
  latestVersionRef.current = updateInfo?.latest_version || '';

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    setError(null);
    setUpdateInfo(null);
    setDownloadPath(null);
    setInstallRequested(false);
    setInstallStatus(null);

    try {
      const info = await checkForUpdates();
      setUpdateInfo(info);
      // A local settings write failure must not turn a successful online check into an error.
      void updateLastCheckTime().catch((err: unknown) => {
        console.warn('已获取更新信息，但未能保存检查时间:', formatUpdaterError(err));
      });
    } catch (err) {
      setError(formatUpdaterError(err, '检查更新失败'));
    } finally {
      setChecking(false);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (!updateInfo?.platform_specific_url) {
      setError('未找到适用于当前平台的安装包');
      return;
    }

    setDownloading(true);
    setError(null);
    setDownloadProgress(null);

    let unlistenFn: (() => void) | null = null;
    try {
      unlistenFn = await listenToDownloadProgress((progress) => {
        setDownloadProgress(progress);
      });

      const filePath = await downloadUpdate(
        updateInfo.platform_specific_url,
        updateInfo.latest_version
      );
      setDownloadPath(filePath);
    } catch (err) {
      setError(formatUpdaterError(err, '下载失败'));
    } finally {
      unlistenFn?.();
      setDownloading(false);
    }
  }, [updateInfo]);

  const handleInstall = useCallback(async () => {
    if (!downloadPath) {
      setError('请先下载更新');
      return;
    }

    if (installing || installRequested) return;
    setInstalling(true);
    setError(null);
    setInstallStatus(null);

    try {
      await installUpdate(downloadPath, true);
      // The command can resolve before the OS installer completes.
      setInstallRequested(true);
      setInstallStatus('已提交安装命令；请根据系统安装程序完成操作。');
    } catch (err) {
      setInstallRequested(false);
      setError(formatUpdaterError(err, '安装失败'));
    } finally {
      setInstalling(false);
    }
  }, [downloadPath]);

  const handleAutoCheckChange = useCallback(async (checked: boolean) => {
    try {
      const settings = await loadUpdateSettings();
      await saveUpdateSettings({ ...settings, auto_check: checked });
      setAutoCheckEnabled(checked);
      setError(null);
    } catch (err) {
      setError('保存更新设置失败：' + formatUpdaterError(err));
    }
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('zh-CN');
    } catch {
      return dateString;
    }
  };

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    loadUpdateSettings().then(settings => {
      if (mounted) setAutoCheckEnabled(settings.auto_check);
    }).catch((err: unknown) => {
      if (mounted) setError('读取更新设置失败：' + formatUpdaterError(err));
    });
    return () => { mounted = false; };
  }, [open]);

  // Register once; a late listener registration must be cleaned up on unmount.
  useEffect(() => {
    let alive = true;
    let unlistenFn: (() => void) | undefined;
    void listenToInstallComplete((event) => {
      if (!alive) return;
      setInstalling(false);
      if (!event.success) {
        setInstallRequested(false);
        setInstallStatus(null);
        setError(event.message || '安装失败');
        return;
      }
      setInstallRequested(true);
      if (event.needs_restart) {
        setNewVersion(latestVersionRef.current);
        setInstallComplete(true);
      } else {
        setInstallStatus(event.message || '安装命令已完成，无需重启。');
      }
    }).then((unlisten) => {
      if (alive) unlistenFn = unlisten;
      else unlisten();
    }).catch((err: unknown) => {
      if (alive) setError('安装状态监听不可用：' + formatUpdaterError(err));
    });
    return () => {
      alive = false;
      unlistenFn?.();
    };
  }, []);

  useEffect(() => {
    if (open && !updateInfo) {
      handleCheckUpdate();
    }
  }, [open, handleCheckUpdate]);

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (!nextOpen && (downloading || installing)) return;
        onOpenChange(nextOpen);
      }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            检查更新
          </DialogTitle>
          <DialogDescription>
            {autoCheck ? '自动检查发现新版本' : '手动检查应用更新'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {checking && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">正在检查更新...</span>
            </div>
          )}

          {installStatus && !installing && !error && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{installStatus}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="whitespace-pre-wrap break-words">{error}</p>
                <Button type="button" size="sm" variant="outline" className="mt-3 gap-2"
                  onClick={() => void openUrl('https://github.com/liao-works/liao-tools/releases/latest').catch((err: unknown) => {
                    setError('无法打开下载页面：' + formatUpdaterError(err));
                  })}>
                  <ExternalLink className="h-4 w-4" />打开官方版本下载页
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {downloading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">正在下载更新...</span>
                <span className="text-xs text-muted-foreground">下载正在执行，当前版本未提供取消命令。</span>
              </div>
              {downloadProgress && (
                <>
                  <Progress value={downloadProgress.percentage} />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {formatBytes(downloadProgress.downloaded)} / {formatBytes(downloadProgress.total)}
                    </span>
                    <span>{downloadProgress.percentage.toFixed(1)}%</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-3 text-sm text-muted-foreground">
                  下载中，请稍候...
                </span>
              </div>
            </div>
          )}

          {installing && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">
                正在启动安装程序...
              </span>
            </div>
          )}

          {updateInfo && !checking && !downloading && !installing && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">当前版本</span>
                  <span className="font-mono font-semibold">{updateInfo.current_version}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">最新版本</span>
                  <span className="font-mono font-semibold text-primary">
                    {updateInfo.latest_version}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">发布时间</span>
                  <span className="text-sm">{formatDate(updateInfo.published_at)}</span>
                </div>
                {updateInfo.file_size && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">文件大小</span>
                    <span className="text-sm">{formatBytes(updateInfo.file_size)}</span>
                  </div>
                )}
              </div>

              {updateInfo.has_update ? (
                <Alert>
                  <Download className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-semibold mb-2">发现新版本！</div>
                    <div className="text-sm">
                      {downloadPath ? '下载完成，点击下方按钮安装' : '点击下方按钮下载并安装'}
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    您使用的已是最新版本
                  </AlertDescription>
                </Alert>
              )}

              {updateInfo.has_update && updateInfo.release_notes && (
                <div className="space-y-2">
                  <Label>更新说明</Label>
                  <div className="rounded-lg border p-4 max-h-60 overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap font-sans">
                      {updateInfo.release_notes}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center space-x-2 pt-2 border-t">
            <Checkbox
              id="auto-check"
              checked={autoCheckEnabled}
              onCheckedChange={handleAutoCheckChange}
              disabled={downloading || installing}
            />
            <Label
              htmlFor="auto-check"
              className="text-sm font-normal cursor-pointer"
            >
              启动时自动检查更新（每24小时）
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {updateInfo?.has_update && !downloading && !installing && (
            <>
              {!downloadPath ? (
                <Button onClick={handleDownload} className="gap-2">
                  <Download className="h-4 w-4" />
                  立即更新
                </Button>
              ) : (
                <Button onClick={handleInstall} className="gap-2" disabled={installRequested}>
                  <RefreshCw className="h-4 w-4" />
                  {installRequested ? '安装命令已提交' : '安装更新'}
                </Button>
              )}
            </>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={downloading || installing}
          >
            {downloading ? '下载中...' : installing ? '安装中...' : '关闭'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleCheckUpdate}
            disabled={checking || downloading || installing}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            重新检查
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 安装完成对话框 */}
    <UpdateCompleteDialog
      open={installComplete}
      onOpenChange={setInstallComplete}
      version={newVersion}
    />
    </>
  );
}
