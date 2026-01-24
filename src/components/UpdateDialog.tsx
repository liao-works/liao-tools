import { useState, useEffect, useCallback } from 'react';
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
import { CheckCircle2, Download, Loader2, AlertCircle, RefreshCw, X } from 'lucide-react';
import {
  checkForUpdates,
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

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    setError(null);
    setUpdateInfo(null);
    setDownloadPath(null);

    try {
      const info = await checkForUpdates();
      setUpdateInfo(info);
      await updateLastCheckTime();
    } catch (err) {
      setError(err instanceof Error ? err.message : '检查更新失败');
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

    try {
      let unlistenFn: (() => void) | null = null;

      unlistenFn = await listenToDownloadProgress((progress) => {
        setDownloadProgress(progress);
      });

      const filePath = await downloadUpdate(
        updateInfo.platform_specific_url,
        updateInfo.latest_version
      );

      setDownloadPath(filePath);
      setDownloading(false);

      if (unlistenFn) {
        unlistenFn();
      }
    } catch (err) {
      setDownloading(false);
      setError(err instanceof Error ? err.message : '下载失败');
    }
  }, [updateInfo]);

  const handleInstall = useCallback(async () => {
    if (!downloadPath) {
      setError('请先下载更新');
      return;
    }

    setInstalling(true);
    setError(null);

    try {
      await installUpdate(downloadPath, true);
      // 不自动关闭，等待安装完成事件
      // 安装完成后会触发 install-complete 事件
    } catch (err) {
      setInstalling(false);
      setError(err instanceof Error ? err.message : '安装失败');
    }
  }, [downloadPath]);

  const handleAutoCheckChange = useCallback(async (checked: boolean) => {
    setAutoCheckEnabled(checked);
    try {
      const settings = await loadUpdateSettings();
      settings.auto_check = checked;
      await saveUpdateSettings(settings);
    } catch (err) {
      console.error('保存设置失败:', err);
    }
  }, []);

  const handleCancelDownload = useCallback(() => {
    setDownloading(false);
    setDownloadProgress(null);
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
    loadUpdateSettings().then(settings => {
      setAutoCheckEnabled(settings.auto_check);
    }).catch(console.error);
  }, []);

  // 监听安装完成事件
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;

    const setupListener = async () => {
      unlistenFn = await listenToInstallComplete((event) => {
        const { success, needs_restart } = event;
        if (success && needs_restart) {
          setInstallComplete(true);
          setInstalling(false);
          setNewVersion(updateInfo?.latest_version || '');
        }
      });
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [updateInfo]);

  useEffect(() => {
    if (open && !updateInfo) {
      handleCheckUpdate();
    }
  }, [open, handleCheckUpdate]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
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

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {downloading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">正在下载更新...</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelDownload}
                  disabled={installing}
                >
                  <X className="h-4 w-4 mr-1" />
                  取消
                </Button>
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
                <Button onClick={handleInstall} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  安装更新
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
