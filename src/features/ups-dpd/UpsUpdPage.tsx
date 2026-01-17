import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { FileText, Play, Settings, X, Package } from 'lucide-react';
import {
  type TemplateType,
  type ProcessRequest,
  TemplateTypeLabels,
  processUpsDpdFile,
  getTemplateConfig,
  saveTemplateConfig,
  resetToDefaultTemplate,
  type TemplateConfig,
} from '@/lib/api/ups-dpd';

export function UpsUpdPage() {
  const [templateType, setTemplateType] = useState<TemplateType>('ups');
  const [mainFile, setMainFile] = useState<string | null>(null);
  const [detailFile, setDetailFile] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // 模板配置状态
  const [upsConfig, setUpsConfig] = useState<TemplateConfig | null>(null);
  const [dpdConfig, setDpdConfig] = useState<TemplateConfig | null>(null);

  const { toast } = useToast();

  // 加载模板配置
  const loadConfigs = async () => {
    try {
      const ups = await getTemplateConfig('ups');
      const dpd = await getTemplateConfig('dpd');
      setUpsConfig(ups);
      setDpdConfig(dpd);
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  };

  // 选择主数据文件
  const handleSelectMainFile = async () => {
    try {
      const selected = await open({
        filters: [
          {
            name: 'Excel 文件',
            extensions: ['xlsx', 'xls'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        setMainFile(selected);
        setLogs([]);
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      toast({
        title: '错误',
        description: '选择文件失败',
        variant: 'destructive',
      });
    }
  };

  // 选择明细表文件
  const handleSelectDetailFile = async () => {
    try {
      const selected = await open({
        filters: [
          {
            name: 'Excel 文件',
            extensions: ['xlsx', 'xls'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        setDetailFile(selected);
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      toast({
        title: '错误',
        description: '选择文件失败',
        variant: 'destructive',
      });
    }
  };

  // 处理文件
  const handleProcess = async () => {
    if (!mainFile) {
      toast({
        title: '提示',
        description: '请先选择主数据文件',
      });
      return;
    }

    setProcessing(true);
    setLogs([]);

    try {
      const request: ProcessRequest = {
        main_file_path: mainFile,
        detail_file_path: detailFile || undefined,
        template_type: templateType,
      };

      const result = await processUpsDpdFile(request);

      setLogs(result.logs);

      if (result.success) {
        toast({
          title: '处理成功',
          description: `文件已保存至: ${result.output_path}`,
        });
      } else {
        toast({
          title: '处理失败',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('处理失败:', error);
      toast({
        title: '处理失败',
        description: error?.message || '未知错误',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  // 选择自定义模板
  const handleSelectCustomTemplate = async (type: TemplateType) => {
    try {
      const selected = await open({
        title: '选择模板文件',
        filters: [
          {
            name: 'Excel 文件',
            extensions: ['xlsx'],
          },
        ],
        multiple: false,
      });

      if (selected && typeof selected === 'string') {
        // 保存自定义模板配置
        const config: TemplateConfig = {
          template_type: type,
          template_path: selected,
          use_default: false,
        };

        await saveTemplateConfig(config);
        await loadConfigs();

        toast({
          title: '成功',
          description: '已设置自定义模板',
        });
      }
    } catch (error: any) {
      toast({
        title: '错误',
        description: error?.message || '设置失败',
        variant: 'destructive',
      });
    }
  };

  // 重置为默认模板
  const handleResetTemplate = async (type: TemplateType) => {
    try {
      await resetToDefaultTemplate(type);
      await loadConfigs();
      toast({
        title: '成功',
        description: '已重置为默认模板',
      });
    } catch (error: any) {
      toast({
        title: '错误',
        description: error?.message || '重置失败',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">UPS/DPD 数据处理</h2>
        <p className="text-muted-foreground">
          支持 UPS 总结单和 DPD 数据预报模板填充
        </p>
      </div>

      <Tabs defaultValue="process" className="w-full">
        <TabsList>
          <TabsTrigger value="process">
            <Play className="w-4 h-4 mr-2" />
            处理文件
          </TabsTrigger>
          <TabsTrigger value="config" onClick={() => loadConfigs()}>
            <Settings className="w-4 h-4 mr-2" />
            模板设置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="process" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-6">
              {/* 模板类型选择 */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">模板类型</Label>
                <div className="flex gap-4">
                  {(Object.entries(TemplateTypeLabels) as [TemplateType, string][]).map(
                    ([value, label]) => (
                      <div key={value} className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id={value}
                          name="templateType"
                          value={value}
                          checked={templateType === value}
                          onChange={(e) => {
                            setTemplateType(e.target.value as TemplateType);
                            setMainFile(null);
                            setDetailFile(null);
                            setLogs([]);
                          }}
                          className="w-4 h-4 text-primary border-gray-300 focus:ring-2 focus:ring-primary cursor-pointer"
                        />
                        <Label
                          htmlFor={value}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {label}
                        </Label>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* 主数据文件选择 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">主数据文件 *</Label>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSelectMainFile}
                    variant="outline"
                    className="flex-1"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {mainFile ? '更换文件' : '选择 Excel 文件'}
                  </Button>
                  {mainFile && (
                    <Button
                      onClick={() => setMainFile(null)}
                      variant="ghost"
                      size="icon"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {mainFile && (
                  <p
                    className="text-sm text-muted-foreground truncate"
                    title={mainFile}
                  >
                    {mainFile}
                  </p>
                )}
              </div>

              {/* 明细表文件选择（可选） */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  单件明细表文件（可选）
                </Label>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSelectDetailFile}
                    variant="outline"
                    className="flex-1"
                  >
                    <Package className="w-4 h-4 mr-2" />
                    {detailFile ? '更换明细表' : '选择明细表文件'}
                  </Button>
                  {detailFile && (
                    <Button
                      onClick={() => setDetailFile(null)}
                      variant="ghost"
                      size="icon"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {detailFile && (
                  <p
                    className="text-sm text-muted-foreground truncate"
                    title={detailFile}
                  >
                    {detailFile}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  用于补充子单号等详细信息
                </p>
              </div>

              {/* 处理按钮 */}
              <Button
                onClick={handleProcess}
                disabled={!mainFile || processing}
                className="w-full"
              >
                {processing ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    处理中...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    开始处理
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* 处理日志 */}
          {logs.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">处理日志</h3>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {logs.map((log, index) => (
                  <p
                    key={index}
                    className="text-sm font-mono text-muted-foreground"
                  >
                    {log}
                  </p>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">UPS 模板配置</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">模板状态</p>
                      <p className="text-xs text-muted-foreground">
                        {upsConfig?.use_default
                          ? '当前使用内置默认模板'
                          : '当前使用自定义模板'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSelectCustomTemplate('ups')}
                        variant="default"
                        size="sm"
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        选择自定义模板
                      </Button>
                      {!upsConfig?.use_default && (
                        <Button
                          onClick={() => handleResetTemplate('ups')}
                          variant="outline"
                          size="sm"
                        >
                          重置为默认
                        </Button>
                      )}
                    </div>
                  </div>
                  {upsConfig?.template_path && !upsConfig?.use_default && (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm font-medium mb-1">自定义模板路径</p>
                      <p className="text-xs text-muted-foreground break-all">
                        {upsConfig.template_path}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">DPD 模板配置</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">模板状态</p>
                      <p className="text-xs text-muted-foreground">
                        {dpdConfig?.use_default
                          ? '当前使用内置默认模板'
                          : '当前使用自定义模板'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSelectCustomTemplate('dpd')}
                        variant="default"
                        size="sm"
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        选择自定义模板
                      </Button>
                      {!dpdConfig?.use_default && (
                        <Button
                          onClick={() => handleResetTemplate('dpd')}
                          variant="outline"
                          size="sm"
                        >
                          重置为默认
                        </Button>
                      )}
                    </div>
                  </div>
                  {dpdConfig?.template_path && !dpdConfig?.use_default && (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm font-medium mb-1">自定义模板路径</p>
                      <p className="text-xs text-muted-foreground break-all">
                        {dpdConfig.template_path}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
