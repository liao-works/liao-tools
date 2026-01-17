import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Github, Mail, Globe, Check, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { useTheme } from '@/hooks/use-theme';
import { useDarkMode, type DarkModeType } from '@/hooks/use-dark-mode';
import { cn } from '@/lib/utils';
import { UpdateDialog } from '@/components/UpdateDialog';
import { loadSettings, saveSettings, type AppSettings } from '@/lib/settings';
import logo from '@/assets/logo-64.png';

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const { currentTheme, themes, changeTheme } = useTheme();
  const { mode: darkMode, setDarkMode } = useDarkMode();

  // 获取应用版本号
  useEffect(() => {
    getVersion().then(setAppVersion).catch(console.error);
  }, []);

  const appearanceOptions: { value: DarkModeType; label: string; description: string }[] = [
    { value: 'system', label: '跟随系统', description: '自动适配系统主题设置' },
    { value: 'light', label: '浅色模式', description: '始终使用浅色外观' },
    { value: 'dark', label: '深色模式', description: '始终使用深色外观' },
  ];

  // 自动保存设置
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSetting = (key: keyof AppSettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">设置</h2>
        <p className="text-muted-foreground">管理应用偏好设置和配置</p>
      </div>

      {/* 主题设置 */}
      <Card>
        <CardHeader>
          <CardTitle>主题设置</CardTitle>
          <CardDescription>自定义应用的外观显示</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 外观模式 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="appearance-mode" className="text-base font-semibold">外观模式</Label>
              <p className="text-sm text-muted-foreground">选择应用的外观显示模式</p>
            </div>
            <Select value={darkMode} onValueChange={(value) => setDarkMode(value as DarkModeType)}>
              <SelectTrigger id="appearance-mode" className="w-[180px]">
                <SelectValue placeholder="选择外观模式" />
              </SelectTrigger>
              <SelectContent>
                {appearanceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 配色方案 */}
          <div className="pt-4 border-t">
            <Label className="text-base font-semibold">配色方案</Label>
            <p className="text-sm text-muted-foreground mb-4">选择您喜欢的配色方案</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => changeTheme(theme.id)}
                  className={cn(
                    'relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 transition-all hover:shadow-md',
                    currentTheme.id === theme.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {/* 主题预览色块 */}
                  <div className="flex gap-1.5 w-full">
                    <div
                      className="h-8 w-8 rounded-md shadow-sm"
                      style={{ backgroundColor: `hsl(${theme.colors.primary})` }}
                    />
                    <div
                      className="h-8 w-8 rounded-md shadow-sm"
                      style={{ backgroundColor: `hsl(${theme.colors.secondary})` }}
                    />
                    <div className="flex-1" />
                    {currentTheme.id === theme.id && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>

                  {/* 主题信息 */}
                  <div className="text-left">
                    <p className="font-semibold text-sm">{theme.name}</p>
                    <p className="text-xs text-muted-foreground">{theme.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 常规设置 */}
      <Card>
        <CardHeader>
          <CardTitle>常规设置</CardTitle>
          <CardDescription>应用的基本配置选项</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-update">自动更新数据</Label>
              <p className="text-sm text-muted-foreground">
                启动时自动检查并下载最新数据
              </p>
            </div>
            <Switch
              id="auto-update"
              checked={settings.autoUpdate}
              onCheckedChange={(checked) => updateSetting('autoUpdate', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notifications">桌面通知</Label>
              <p className="text-sm text-muted-foreground">
                处理完成后显示系统通知
              </p>
            </div>
            <Switch
              id="notifications"
              checked={settings.notifications}
              onCheckedChange={(checked) => updateSetting('notifications', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="save-history">保存查询历史</Label>
              <p className="text-sm text-muted-foreground">
                自动保存查询记录以便快速访问
              </p>
            </div>
            <Switch
              id="save-history"
              checked={settings.saveHistory}
              onCheckedChange={(checked) => updateSetting('saveHistory', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 关于 */}
      <Card>
        <CardHeader>
          <CardTitle>关于 Liao Tools</CardTitle>
          <CardDescription>应用信息和版本详情</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-lg overflow-hidden flex items-center justify-center">
              <img src={logo} alt="Liao Tools" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="font-semibold text-lg">Liao Tools</p>
              <p className="text-sm text-muted-foreground">版本 {appVersion || '加载中...'}</p>
              <p className="text-xs text-muted-foreground mt-1">
                集成多功能桌面工具
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t">
            <p className="text-sm">
              Liao Tools 是一个集成多功能的桌面工具，包含禁运商品查询、税率查询和Excel数据处理功能。
            </p>
            <p className="text-sm text-muted-foreground">
              © 2024 Liao Tools. All rights reserved.
            </p>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" size="sm" onClick={() => setUpdateDialogOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              检查更新
            </Button>
            <Button variant="outline" size="sm">
              <Github className="mr-2 h-4 w-4" />
              GitHub
            </Button>
            <Button variant="outline" size="sm">
              <Mail className="mr-2 h-4 w-4" />
              反馈
            </Button>
            <Button variant="outline" size="sm">
              <Globe className="mr-2 h-4 w-4" />
              官网
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 更新对话框 */}
      <UpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
      />
    </div>
  );
}
