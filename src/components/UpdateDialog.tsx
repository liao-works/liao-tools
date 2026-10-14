import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UpdateCenter } from './UpdateCenter';
import type { UpdateInfo } from '@/lib/updater';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoCheck?: boolean;
  initialInfo?: UpdateInfo | null;
}
/** Manual and auto-update entry points share exactly the same safety and progress UI. */
export function UpdateDialog({ open, onOpenChange, autoCheck = false, initialInfo = null }: Props) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="lt-update-modal max-h-[90vh] max-w-[1020px] overflow-y-auto">
      <DialogHeader className="sr-only">
        <DialogTitle>应用更新</DialogTitle>
        <DialogDescription>{autoCheck ? '启动时发现新版本' : '手动检查应用更新'}</DialogDescription>
      </DialogHeader>
      {open && <UpdateCenter initialInfo={initialInfo} embedded/>}
    </DialogContent>
  </Dialog>;
}
