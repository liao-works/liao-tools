import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import { restartApp, quitApp } from '@/lib/updater';

interface UpdateCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
}

export function UpdateCompleteDialog({
  open,
  onOpenChange,
  version
}: UpdateCompleteDialogProps) {

  const handleRestart = async () => {
    try {
      await restartApp();
      // 如果 restartApp 失败，延迟1秒后退出
      setTimeout(() => {
        quitApp();
      }, 1000);
    } catch (error) {
      console.error('重启失败:', error);
      // 降级方案：仅退出应用
      await quitApp();
    }
  };

  const handleManualRestart = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            更新完成
          </DialogTitle>
          <DialogDescription>
            已成功更新到版本 {version}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            更新已安装完成。您可以选择立即重启应用以使用新版本，
            或者稍后手动重启应用。
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleManualRestart}
          >
            <X className="h-4 w-4 mr-2" />
            稍后手动重启
          </Button>
          <Button
            onClick={handleRestart}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            立即重启
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
