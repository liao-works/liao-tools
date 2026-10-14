import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileOpenDialog } from '@/components/common/FileOpenDialog';
import { useToast } from '@/hooks/use-toast';
import { getFileName } from '@/lib/file-opener';
import { FileText, Play, Settings, X, Package, Upload, Loader2, CheckCircle2, AlertTriangle, FileCheck2 } from 'lucide-react';
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
  const [errorMessage, setErrorMessage] = useState('');
  const [completedPath, setCompletedPath] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [outputFilePath, setOutputFilePath] = useState<string>('');

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
        setErrorMessage('');
        setCompletedPath('');
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
        setErrorMessage('');
        setCompletedPath('');
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
    setErrorMessage('');
    setCompletedPath('');

    try {
      const request: ProcessRequest = {
        main_file_path: mainFile,
        detail_file_path: detailFile || undefined,
        template_type: templateType,
      };

      const result = await processUpsDpdFile(request);

      setLogs(result.logs);

      if (result.success) {
        setCompletedPath(result.output_path);
        setOutputFilePath(result.output_path);
        setShowFileDialog(true);
        
        toast({
          title: '处理完成',
          description: `${TemplateTypeLabels[templateType]} 数据处理完成`,
        });
      } else {
        setErrorMessage(result.message || '处理失败，请检查源文件及模板配置。');
        toast({
          title: '处理失败',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('处理失败:', error);
      setErrorMessage(error?.message || '处理失败，请检查源文件及模板配置。');
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
    <div className="lt-feature space-y-6">
      <FeatureHeader eyebrow="SHIPPING / TEMPLATES" title="UPS / DPD 模板处理" description="选择主数据文件和可选明细表，使用内置或自定义模板生成物流总结单与预报文件。" illustrationSrc="/illustrations/file-workflow.svg"/>

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
          <div className="lt-process-steps">
            <div><span className="lt-step-index">01</span><strong>选择承运商</strong><small>UPS / DPD</small></div>
            <div><span className="lt-step-index">02</span><strong>准备源数据</strong><small>主表及可选明细</small></div>
            <div><span className="lt-step-index">03</span><strong>生成预报文件</strong><small>当前模板填充</small></div>
          </div>
          <div className="lt-operation-grid">
            <Card className="lt-operation-primary">
              <div className="p-6 space-y-6">
                <div>
                  <div className="lt-operation-heading"><span className="lt-step-index">01</span>
                    <div><h2 className="lt-operation-title">选择物流模板</h2>
                      <p className="lt-operation-subtitle">模板类型决定输出格式，已有自定义模板可在「模板设置」管理。</p></div>
                  </div>
                  <div className="lt-mode-card-grid lt-mode-card-grid--two" role="radiogroup" aria-label="物流模板类型">
                    {(Object.entries(TemplateTypeLabels) as [TemplateType,string][]).map(([value,label]) =>
                      <label className={`lt-mode-card ${templateType===value?'is-selected':''}`} key={value}>
                        <input type="radio" name="templateType" value={value} checked={templateType===value}
                          disabled={processing} onChange={evt => {
                            setTemplateType(evt.target.value as TemplateType);setMainFile(null);setDetailFile(null);
                            setLogs([]);setCompletedPath('');setErrorMessage('');
                          }}/>
                        <span className="lt-mode-card-mark"><Package size={20}/></span>
                        <strong>{label}</strong>
                        <small>{value==='ups'?'使用 UPS 当前保存的模板':'使用 DPD 当前保存的模板'}</small>
                      </label>)}
                  </div>
                </div>
                <div className="lt-operation-file-select">
                  <label><span className="lt-step-index">02</span>主数据工作簿 <span>必选</span></label>
                  <div className="lt-operation-drop">
                    <span className="lt-operation-file-symbol"><FileText size={23}/></span>
                    <div className="lt-operation-file-details">
                      <strong>{mainFile?getFileName(mainFile):'请选择主数据 Excel 文件'}</strong>
                      <small title={mainFile ?? undefined}>{mainFile||'支持 .xls / .xlsx'}</small>
                    </div>
                    <Button variant="outline" onClick={handleSelectMainFile} disabled={processing}>
                      <Upload className="mr-2 h-4 w-4"/>{mainFile?'更换':'选择文件'}
                    </Button>
                    {mainFile && <button type="button" className="lt-operation-clear" disabled={processing}
                      aria-label="移除主数据文件" onClick={() => {setMainFile(null);setCompletedPath('');setErrorMessage('');}}>
                      <X size={16}/></button>}
                  </div>
                </div>
                <div className="lt-operation-file-select">
                  <label>单件明细表 <small>可选</small></label>
                  <div className="lt-operation-drop lt-operation-drop--optional">
                    <span className="lt-operation-file-symbol"><Package size={23}/></span>
                    <div className="lt-operation-file-details">
                      <strong>{detailFile?getFileName(detailFile):'可选：添加明细工作簿'}</strong>
                      <small title={detailFile ?? undefined}>{detailFile||'用于补充子单号等细节，无需时可以跳过'}</small>
                    </div>
                    <Button variant="outline" onClick={handleSelectDetailFile} disabled={processing}>
                      {detailFile?'更换':'选择文件'}</Button>
                    {detailFile && <button type="button" className="lt-operation-clear" disabled={processing}
                      aria-label="移除明细表" onClick={() => {setDetailFile(null);setCompletedPath('');}}>
                      <X size={16}/></button>}
                  </div>
                </div>
                <div className="lt-operation-next">
                  <div className="lt-operation-next-copy"><span className="lt-step-index">03</span>
                    <div><strong>生成 {TemplateTypeLabels[templateType]} 文件</strong>
                      <p>使用后台对应模板和已选源文件处理，完成后提供输出路径。</p></div>
                  </div>
                  <Button className="lt-operation-run" onClick={handleProcess} disabled={!mainFile||processing}>
                    {processing?<><Loader2 size={16} className="mr-2 animate-spin"/>正在生成…</>:
                      <><Play size={16} className="mr-2"/>开始处理</>}
                  </Button>
                </div>
                {errorMessage && <div className="lt-operation-error" role="alert"><AlertTriangle size={17}/>{errorMessage}</div>}
              </div>
            </Card>
            <aside className="lt-operation-side"><div className="lt-operation-side-card">
              <span className="lt-kicker">SHIPPING PROCESS</span>
              <h3>模板与输出</h3>
              <p>此页使用后台保存的 {TemplateTypeLabels[templateType]} 模板。不需要单件明细的文件可以留空；处理后请核对导出表的关键字段。</p>
              <div className="lt-operation-note"><Settings size={17}/> 自定义模板请到「模板设置」选择或重置</div>
              <div className="lt-operation-note"><FileCheck2 size={17}/> 处理完成后可查看原始日志及输出文件</div>
              <img className="lt-operation-illustration" src="/illustrations/file-workflow.svg" alt="" aria-hidden="true"/>
            </div></aside>
          </div>
          {completedPath && <div className="lt-operation-output lt-operation-finished">
            <CheckCircle2 size={22} className="text-success-fg"/>
            <div><strong>处理完成 · {getFileName(completedPath)}</strong><span>{completedPath}</span></div>
            <Button variant="outline" onClick={() => setShowFileDialog(true)}>打开结果</Button>
          </div>}
          {logs.length>0 && <Card className="p-5">
            <h3 className="lt-operation-title mb-3">处理日志 · {logs.length} 条</h3>
            <div className="lt-process-log">{logs.map((log,index)=>
              <p key={index}><span>{String(index+1).padStart(2,'0')}</span>{log}</p>)}</div>
          </Card>}
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

      {/* 文件打开对话框 */}
      <FileOpenDialog
        open={showFileDialog}
        onOpenChange={setShowFileDialog}
        filePath={outputFilePath}
        title={`${TemplateTypeLabels[templateType]} 处理完成`}
        description="数据模板填充处理已完成，是否查看输出文件？"
        fileName={getFileName(outputFilePath)}
      />
    </div>
  );
}
