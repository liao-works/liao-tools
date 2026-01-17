import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Github, Mail, Globe, Check, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { UpdateDialog } from '@/components/UpdateDialog';
import { loadSettings, saveSettings, type AppSettings } from '@/lib/settings';

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const { currentTheme, themes, changeTheme } = useTheme();

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

      {/* 主题选择 */}
      <Card>
        <CardHeader>
          <CardTitle>主题</CardTitle>
          <CardDescription>选择您喜欢的配色方案</CardDescription>
        </CardHeader>
        <CardContent>
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
            <div className="h-16 w-16 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-2xl">LT</span>
            </div>
            <div>
              <p className="font-semibold text-lg">Liao Tools</p>
              <p className="text-sm text-muted-foreground">版本 1.0.0</p>
              <p className="text-xs text-muted-foreground mt-1">
                构建于 2024-01-16
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
