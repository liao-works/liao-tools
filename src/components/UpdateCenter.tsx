import { useState } from 'react';
import { RefreshCw, ShieldCheck, PackageCheck, ArrowUpRight } from 'lucide-react';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { TutorialLink } from '@/components/common/TutorialLink';
import { UpdateDialog } from '@/components/UpdateDialog';
import { Button } from '@/components/ui/button';

/**
 * The visual Update Center from PR #3 uses the currently supported updater
 * command path. Signed auto-installation is deliberately not enabled here:
 * release signing keys and desktop migration have not yet been verified.
 */
export function UpdateCenter() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="lt-page lt-updates-page">
      <FeatureHeader
        eyebrow="APP UPDATES"
        title="应用更新"
        description="了解最新桌面版本、查看更新内容并由系统安装程序完成升级。"
        illustrationSrc="/illustrations/update-scene.svg"
        action={<TutorialLink featureId="updates" variant="outline" />}
      />
      <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="mb-5 flex items-start gap-3">
          <span className="rounded-xl bg-primary-subtle p-3 text-primary"><RefreshCw size={23} /></span>
          <div>
            <h2 className="text-lg font-semibold text-foreground-emphasis">检查 Liao Tools 更新</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">从正式 GitHub Release 获取适用于当前系统的版本信息和安装包。</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}><RefreshCw className="mr-2 h-4 w-4" />检查更新 <ArrowUpRight className="ml-2 h-4 w-4" /></Button>
      </section>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <ShieldCheck className="mb-3 h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">下载来源与校验</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">沿用当前经过集成的更新命令；下载失败和安装程序启动状态会如实提示。</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <PackageCheck className="mb-3 h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">用户确认安装</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">安装需要用户在系统安装程序内完成，不能把启动安装程序误报为已经安装成功。</p>
        </div>
      </div>
      <UpdateDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
