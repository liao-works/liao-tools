import { useState, useEffect } from 'react';
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
import { CheckCircle2, Download, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { checkForUpdates, loadUpdateSettings, saveUpdateSettings, updateLastCheckTime, type UpdateInfo } from '@/lib/updater';
import { open as openUrl } from '@tauri-apps/plugin-opener';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoCheck?: boolean; // 是否是自动检查（影响提示文字）
}

export function UpdateDialog({ open, onOpenChange, autoCheck = false }: UpdateDialogProps) {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true);

  // 加载自动检查设置
  useEffect(() => {
    loadUpdateSettings().then(settings => {
      setAutoCheckEnabled(settings.auto_check);
    }).catch(console.error);
  }, []);

  // 打开对话框时自动检查
  useEffect(() => {
    if (open && !updateInfo) {
      handleCheckUpdate();
    }
  }, [open]);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setError(null);
    setUpdateInfo(null);

    try {
      const info = await checkForUpdates();
      setUpdateInfo(info);
      await updateLastCheckTime();
    } catch (err) {
      setError(err instanceof Error ? err.message : '检查更新失败');
    } finally {
      setChecking(false);
    }
  };

  const handleDownload = async () => {
    if (updateInfo?.download_url) {
      try {
        await openUrl(updateInfo.download_url);
      } catch (err) {
        console.error('打开下载页面失败:', err);
      }
    }
  };

  const handleAutoCheckChange = async (checked: boolean) => {
    setAutoCheckEnabled(checked);
    try {
      const settings = await loadUpdateSettings();
      settings.auto_check = checked;
      await saveUpdateSettings(settings);
    } catch (err) {
      console.error('保存设置失败:', err);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('zh-CN');
    } catch {
      return dateString;
    }
  };

  return (
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
          {/* 检查中状态 */}
          {checking && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">正在检查更新...</span>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 更新信息 */}
          {updateInfo && !checking && (
            <div className="space-y-4">
              {/* 版本信息 */}
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
              </div>

              {/* 更新状态 */}
              {updateInfo.has_update ? (
                <Alert>
                  <Download className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-semibold mb-2">发现新版本！</div>
                    点击下方按钮前往下载页面
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

              {/* 更新说明 */}
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

          {/* 自动检查设置 */}
          <div className="flex items-center space-x-2 pt-2 border-t">
            <Checkbox
              id="auto-check"
              checked={autoCheckEnabled}
              onCheckedChange={handleAutoCheckChange}
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
          {updateInfo?.has_update && (
            <Button onClick={handleDownload} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              前往下载
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button variant="secondary" onClick={handleCheckUpdate} disabled={checking}>
            重新检查
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
