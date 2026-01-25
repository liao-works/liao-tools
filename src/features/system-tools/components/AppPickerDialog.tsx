import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Folder } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';

interface InstalledApp {
  name: string;
  display_name: string;
  path: string;
  icon_base64?: string;  // Base64 编码的图标数据
  publisher?: string;
  version?: string;
}

interface AppPickerDialogProps {
  open: boolean;
  onSelect: (app: InstalledApp) => void;
  onCancel: () => void;
}

export function AppPickerDialog({ open, onSelect, onCancel }: AppPickerDialogProps) {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [filteredApps, setFilteredApps] = useState<InstalledApp[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [iconsMap, setIconsMap] = useState<Record<string, string>>({});

  // 加载已安装的应用程序并提取图标
  useEffect(() => {
    if (open) {
      loadInstalledApps();
    }
  }, [open]);

  const loadInstalledApps = async () => {
    setIsLoading(true);
    try {
      const installedApps = await invoke<InstalledApp[]>('get_installed_apps');
      console.log(`找到 ${installedApps.length} 个应用程序`);
      console.log('示例应用数据:', installedApps.slice(0, 3));

      // 按名称排序
      const sorted = installedApps.sort((a, b) =>
        a.display_name.localeCompare(b.display_name, 'zh-CN')
      );

      setApps(sorted);
      setFilteredApps(sorted);

      // 提取前20个应用的图标（避免性能问题）
      extractIconsForApps(sorted.slice(0, 20));
    } catch (error) {
      console.error('扫描应用程序失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 批量提取图标
  const extractIconsForApps = async (appsToExtract: InstalledApp[]) => {
    for (const app of appsToExtract) {
      try {
        const icon = await invoke<string | null>('extract_icon', {
          executablePath: app.path
        });

        if (icon) {
          setIconsMap(prev => ({
            ...prev,
            [app.path]: icon
          }));
        }
      } catch (error) {
        console.error(`提取图标失败: ${app.display_name}`, error);
      }
    }
  };

  // 处理图标加载失败
  const handleIconError = (appPath: string) => {
    // 图标加载失败时从缓存中移除
    setIconsMap(prev => {
      const newMap = { ...prev };
      delete newMap[appPath];
      return newMap;
    });
  };

  // 当滚动到列表底部时，提取更多图标
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    if (scrollBottom < 200 && filteredApps.length > 0) {
      // 找到还没有提取图标的第一个应用
      const appWithoutIcon = filteredApps.find(app => !iconsMap[app.path]);
      if (appWithoutIcon) {
        extractIconsForApps([appWithoutIcon]);
      }
    }
  };

  // 搜索过滤
  useEffect(() => {
    if (!searchQuery) {
      setFilteredApps(apps);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = apps.filter(
        (app) =>
          app.display_name.toLowerCase().includes(query) ||
          app.name.toLowerCase().includes(query)
      );
      setFilteredApps(filtered);
    }
  }, [searchQuery, apps]);

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>选择已安装的程序</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索应用程序..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* 应用程序列表 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">正在扫描应用程序...</span>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? '未找到匹配的应用程序' : '未找到已安装的应用程序'}
              </p>
            </div>
          ) : (
            <div className="h-[500px] overflow-y-auto pr-2" onScroll={handleScroll}>
              <div className="space-y-2">
                {filteredApps.map((app, index) => (
                  <button
                    key={`${app.path}-${index}`}
                    onClick={() => {
                      console.log('选择的应用:', app);
                      console.log('应用路径:', app.path);
                      onSelect(app);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg',
                      'border border-border/50 bg-card',
                      'hover:bg-accent hover:border-accent',
                      'transition-all duration-200',
                      'text-left'
                    )}
                  >
                    {/* 图标 */}
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10 shrink-0 overflow-hidden">
                      {iconsMap[app.path] ? (
                        <img
                          src={iconsMap[app.path]}
                          alt={app.display_name}
                          className="h-full w-full object-contain"
                          onError={() => handleIconError(app.path)}
                        />
                      ) : (
                        <Folder className="h-5 w-5 text-primary" />
                      )}
                    </div>

                    {/* 应用信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{app.display_name}</span>
                        {app.version && (
                          <Badge variant="secondary" className="text-xs">
                            {app.version}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{app.publisher || app.path}</span>
                      </div>
                    </div>

                    {/* 箭头 */}
                    <div className="text-muted-foreground">
                      →
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 底部操作 */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              找到 {apps.length} 个应用程序
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel}>
                取消
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
