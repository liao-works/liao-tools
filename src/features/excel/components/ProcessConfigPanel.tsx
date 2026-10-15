import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import type { ProcessConfig, ProcessType } from '@/lib/api/excel';
import { ProcessTypeLabels } from '@/lib/api/excel';
import { Save, RotateCcw, Ship, Plane, Image, Hash, Package } from 'lucide-react';

type ConfigsMap = Record<ProcessType, ProcessConfig>;

export function ProcessConfigPanel() {
  const [configs, setConfigs] = useState<ConfigsMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadAllConfigs();
  }, []);

  const loadAllConfigs = async () => {
    setLoadError(null);
    try {
      const types: ProcessType[] = ['sea-rail-with-image', 'sea-rail-no-image', 'air-freight'];
      const configsData: ConfigsMap = {} as ConfigsMap;

      for (const type of types) {
        const config = await invoke<ProcessConfig>('get_excel_config', { processType: type });
        configsData[type] = config;
      }

      setConfigs(configsData);
    } catch (error) {
      console.error('加载配置失败:', error);
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSaveAll = async () => {
    if (!configs) return;

    setLoading(true);
    try {
      for (const config of Object.values(configs)) {
        await invoke('save_excel_config', { config });
      }
      toast({
        title: '成功',
        description: '所有配置已保存',
      });
    } catch (error: any) {
      console.error('保存配置失败:', error);
      toast({
        title: '保存失败',
        description: error?.message || '未知错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    await loadAllConfigs();
  };

  const updateConfig = (type: ProcessType, updates: Partial<ProcessConfig>) => {
    if (!configs) return;
    setConfigs({
      ...configs,
      [type]: { ...configs[type], ...updates },
    });
  };

  if (!configs) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        {loadError ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm font-medium text-danger-fg">读取配置失败：{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void loadAllConfigs()}>重试读取</Button>
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">正在读取处理配置…</p>
        )}
      </div>
    );
  }

  const getTypeIcon = (type: ProcessType) => {
    if (type.includes('air')) return <Plane className="w-5 h-5" />;
    return <Ship className="w-5 h-5" />;
  };

  const getTypeBadge = (type: ProcessType) => {
    if (type === 'sea-rail-with-image') return <Badge variant="secondary" className="ml-2">有图</Badge>;
    if (type === 'sea-rail-no-image') return <Badge variant="outline" className="ml-2">无图</Badge>;
    return <Badge className="ml-2">空运</Badge>;
  };

  const renderConfigSection = (type: ProcessType) => {
    const config = configs[type];
    
    return (
      <AccordionItem key={type} value={type}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {getTypeIcon(type)}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-medium">{ProcessTypeLabels[type]}</span>
              {getTypeBadge(type)}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-4 space-y-4">
            <div className="grid gap-6 sm:grid-cols-2">
              {/* 重量列 */}
              <div className="space-y-2">
                <Label htmlFor={`${type}-weight`} className="flex items-center gap-2 text-sm font-medium">
                  <Hash className="w-4 h-4 text-muted-foreground/40" />
                  重量列索引
                </Label>
                <Input
                  id={`${type}-weight`}
                  type="number"
                  min="1"
                  value={config.weight_column}
                  onChange={(e) =>
                    updateConfig(type, { weight_column: parseInt(e.target.value) || 1 })
                  }
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground/40 pl-6">
                  Excel 列号 · 如 13 = M列
                </p>
              </div>

              {/* 箱子列 */}
              <div className="space-y-2">
                <Label htmlFor={`${type}-box`} className="flex items-center gap-2 text-sm font-medium">
                  <Package className="w-4 h-4 text-muted-foreground/40" />
                  箱子列索引
                </Label>
                <Input
                  id={`${type}-box`}
                  type="number"
                  min="1"
                  value={config.box_column}
                  onChange={(e) =>
                    updateConfig(type, { box_column: parseInt(e.target.value) || 1 })
                  }
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground/40 pl-6">
                  Excel 列号 · 如 11 = K列
                </p>
              </div>
            </div>

            {/* 图片复制选项 - 仅显示有图版和空运 */}
            {type !== 'sea-rail-no-image' && (
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/20">
                <div className="flex items-center gap-3">
                  <Image className="w-5 h-5 text-muted-foreground/40" />
                  <div>
                    <Label htmlFor={`${type}-images`} className="text-sm font-medium cursor-not-allowed text-muted-foreground/60">
                      复制图片
                    </Label>
                    <p className="text-xs text-muted-foreground/40 mt-0.5">
                      是否复制 Excel 中的图片 · 即将支持
                    </p>
                  </div>
                </div>
                <Switch
                  id={`${type}-images`}
                  checked={config.copy_images}
                  disabled
                  onCheckedChange={(checked) =>
                    updateConfig(type, { copy_images: checked })
                  }
                />
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">处理配置</h2>
        <p className="text-sm text-muted-foreground/50">
          按处理模式分别设置列索引；点击“保存所有配置”后写入本地。
        </p>
      </div>

      {/* 手风琴配置列表 */}
      <Accordion type="multiple" defaultValue={['sea-rail-with-image']} className="space-y-2">
        {renderConfigSection('sea-rail-with-image')}
        {renderConfigSection('sea-rail-no-image')}
        {renderConfigSection('air-freight')}
      </Accordion>

      {/* 操作按钮 */}
      <div className="flex gap-3 pt-4 border-t">
        <Button 
          onClick={handleSaveAll} 
          disabled={loading} 
          size="lg"
          className="flex-1 sm:flex-none sm:min-w-[200px] transition-all duration-200"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              保存中...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              保存所有配置
            </>
          )}
        </Button>
        <Button 
          onClick={handleReset} 
          variant="outline" 
          size="lg"
          disabled={loading}
          className="transition-all duration-200 hover:bg-muted"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          重置
        </Button>
      </div>
    </div>
  );
}
