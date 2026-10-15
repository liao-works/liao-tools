import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getVersion } from '@tauri-apps/api/app';
import { AlertCircle, Check, Database, Download, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from '@/hooks/use-theme';
import { useDarkMode, type DarkModeType } from '@/hooks/use-dark-mode';
import { ACCENT_PREVIEW } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { UpdateDialog } from '@/components/UpdateDialog';
import { loadUpdateSettings, saveUpdateSettings, type UpdateSettings } from '@/lib/updater';
import { openUrlPath } from '@/lib/file-opener';
import logo from '@/assets/logo-64.png';

const appearanceOptions: { value: DarkModeType; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

export function SettingsPage() {
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [versionError, setVersionError] = useState(false);
  const [updaterSettings, setUpdaterSettings] = useState<UpdateSettings | null>(null);
  const [updaterError, setUpdaterError] = useState<string | null>(null);
  const [updaterLoading, setUpdaterLoading] = useState(true);
  const [updaterSaving, setUpdaterSaving] = useState(false);
  const { currentTheme, themes, changeTheme } = useTheme();
  const { mode: darkMode, setDarkMode } = useDarkMode();

  useEffect(() => {
    let active = true;
    getVersion()
      .then((version) => { if (active) setAppVersion(version); })
      .catch(() => { if (active) setVersionError(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    loadUpdateSettings()
      .then((settings) => { if (active) setUpdaterSettings(settings); })
      .catch((error: unknown) => {
        if (active) setUpdaterError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => { if (active) setUpdaterLoading(false); });
    return () => { active = false; };
  }, []);

  async function changeAutoCheck(enabled: boolean) {
    if (!updaterSettings || updaterSaving) return;
    setUpdaterSaving(true);
    setUpdaterError(null);
    try {
      const next = { ...updaterSettings, auto_check: enabled };
      await saveUpdateSettings(next);
      setUpdaterSettings(next);
    } catch (error) {
      setUpdaterError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdaterSaving(false);
    }
  }

  async function openRepository() {
    try {
      await openUrlPath('https://github.com/liao-works/liao-tools');
    } catch (error) {
      setUpdaterError('无法打开项目仓库：' + (error instanceof Error ? error.message : String(error)));
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground-emphasis md:text-3xl">偏好设置</h1>
        <p className="mt-2 text-sm text-muted-foreground">外观、应用版本及实际生效的更新选项。</p>
      </header>

      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">外观</CardTitle>
          <p className="text-xs text-muted-foreground">外观设置会在应用内立即生效。</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Label htmlFor="appearance-mode" className="text-sm font-semibold">显示模式</Label>
              <p className="mt-1 text-xs text-muted-foreground">浅色、深色或跟随系统</p>
            </div>
            <Select value={darkMode} onValueChange={(value) => setDarkMode(value as DarkModeType)}>
              <SelectTrigger id="appearance-mode" className="w-40" aria-label="外观显示模式"><SelectValue /></SelectTrigger>
              <SelectContent>
                {appearanceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="border-t border-border pt-4">
            <Label className="text-sm font-semibold">配色方案</Label>
            <p className="mt-1 text-xs text-muted-foreground">选择主题色，不改变业务查询结果。</p>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
              {themes.map((theme) => (
                <button type="button" key={theme.id} aria-pressed={currentTheme.id === theme.id}
                  onClick={() => changeTheme(theme.id)}
                  className={cn(
                    'flex min-h-24 flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    currentTheme.id === theme.id ? 'border-primary bg-primary-subtle' : 'border-border hover:border-primary/50',
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="h-7 w-7 rounded-lg border border-border" style={{ backgroundColor: ACCENT_PREVIEW[theme.accent] }} />
                    {currentTheme.id === theme.id && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                  </span>
                  <span className="text-sm font-medium text-foreground-emphasis">{theme.name}</span>
                  <span className="text-xs text-muted-foreground">{theme.description}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">应用更新</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            这里管理 Liao Tools 应用程序自身的更新检查，不控制英国/北爱关税或 Alta 数据库更新。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {updaterError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger bg-danger-subtle p-3 text-sm text-danger-fg">
              <AlertCircle className="h-4 w-4 shrink-0" />{updaterError}
            </div>
          )}
          {updaterLoading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />正在读取更新设置…
            </p>
          ) : updaterSettings ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Label htmlFor="auto-check-app-update" className="text-sm font-semibold">自动检查应用更新</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  应用启动时按已保存的间隔检查是否有新版本；不会自动安装。
                  {updaterSettings.check_interval_hours > 0 && <> 当前检查间隔：{updaterSettings.check_interval_hours} 小时。</>}
                </p>
              </div>
              <Switch
                id="auto-check-app-update"
                checked={updaterSettings.auto_check}
                disabled={updaterSaving}
                onCheckedChange={(checked) => void changeAutoCheck(checked)}
              />
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => {
              setUpdaterError(null);
              setUpdaterLoading(true);
              void loadUpdateSettings().then(setUpdaterSettings)
                .catch((error: unknown) => setUpdaterError(String(error)))
                .finally(() => setUpdaterLoading(false));
            }}><RefreshCw className="h-4 w-4" />重试读取</Button>
          )}
          <Button type="button" variant="outline" onClick={() => setUpdateDialogOpen(true)}>
            <Download className="h-4 w-4" />检查应用版本
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-3"><CardTitle className="text-base">业务数据维护</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground-emphasis">关税与禁运数据</p>
            <p className="mt-1 text-xs text-muted-foreground">数据版本、检查更新和更新历史由独立页面管理。</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/data-maintenance"><Database className="h-4 w-4" />打开数据维护</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-3"><CardTitle className="text-base">关于 Liao Tools</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="" className="h-12 w-12 rounded-lg object-contain" />
            <div>
              <p className="text-sm font-semibold">Liao Tools</p>
              <p className="mt-1 text-xs text-muted-foreground">
                版本 {appVersion || (versionError ? '无法读取' : '读取中…')}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void openRepository()}>
            <ExternalLink className="h-4 w-4" />GitHub 仓库
          </Button>
        </CardContent>
      </Card>

      <UpdateDialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen} />
    </div>
  );
}
