import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FileSpreadsheet, FileText, Loader2, Play, RotateCcw, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileOperationFeedback, type FileOperationState } from '@/components/workflow/FileOperationFeedback';
import { useToast } from '@/hooks/use-toast';
import { getFileName } from '@/lib/file-opener';
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

type ConfigState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; ups: TemplateConfig; dpd: TemplateConfig }
  | { kind: 'error'; message: string };

export function UpsUpdPage() {
  const [templateType, setTemplateType] = useState<TemplateType>('ups');
  const [mainFile, setMainFile] = useState<string | null>(null);
  const [detailFile, setDetailFile] = useState<string | null>(null);
  const [operation, setOperation] = useState<FileOperationState>({ kind: 'idle' });
  const [tab, setTab] = useState('process');
  const [configs, setConfigs] = useState<ConfigState>({ kind: 'idle' });
  const [configBusy, setConfigBusy] = useState<TemplateType | null>(null);
  const { toast } = useToast();
  const busy = operation.kind === 'running';

  async function chooseFile(kind: 'main' | 'detail') {
    if (busy) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
      });
      if (typeof selected !== 'string') return;
      if (kind === 'main') setMainFile(selected);
      else setDetailFile(selected);
      setOperation({ kind: 'idle' });
    } catch (error) {
      toast({
        title: '选择文件失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }

  async function processFile() {
    if (!mainFile || busy) return;
    setOperation({ kind: 'running' });
    try {
      const request: ProcessRequest = {
        main_file_path: mainFile,
        detail_file_path: detailFile || undefined,
        template_type: templateType,
      };
      const result = await processUpsDpdFile(request);
      setOperation(result.success
        ? { kind: 'success', message: result.message || '模板填充已完成', outputPath: result.output_path, logs: result.logs || [] }
        : { kind: 'error', message: result.message || '文件处理失败', logs: result.logs || [] });
    } catch (error) {
      setOperation({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
        logs: [],
      });
    }
  }

  function chooseType(next: TemplateType) {
    if (busy) return;
    setTemplateType(next);
    // Do not discard selected Excel files just because the template mode changed.
    setOperation({ kind: 'idle' });
  }

  async function loadConfigs() {
    setConfigs({ kind: 'loading' });
    try {
      const [ups, dpd] = await Promise.all([getTemplateConfig('ups'), getTemplateConfig('dpd')]);
      setConfigs({ kind: 'ready', ups, dpd });
    } catch (error) {
      setConfigs({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function changeTab(next: string) {
    if (busy) return;
    setTab(next);
    if (next === 'config' && configs.kind === 'idle') void loadConfigs();
  }

  async function chooseCustomTemplate(type: TemplateType) {
    if (configBusy) return;
    try {
      const selected = await open({
        title: '选择 ' + type.toUpperCase() + ' 自定义模板',
        multiple: false,
        filters: [{ name: 'Excel 模板', extensions: ['xlsx'] }],
      });
      if (typeof selected !== 'string') return;
      setConfigBusy(type);
      await saveTemplateConfig({ template_type: type, template_path: selected, use_default: false });
      const saved = await getTemplateConfig(type);
      setConfigs((old) => old.kind === 'ready' ? { ...old, [type]: saved } : old);
      toast({ title: type.toUpperCase() + ' 模板已保存' });
    } catch (error) {
      toast({
        title: '保存模板失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setConfigBusy(null);
    }
  }

  async function resetTemplate(type: TemplateType) {
    if (configBusy) return;
    setConfigBusy(type);
    try {
      await resetToDefaultTemplate(type);
      const saved = await getTemplateConfig(type);
      setConfigs((old) => old.kind === 'ready' ? { ...old, [type]: saved } : old);
      toast({ title: type.toUpperCase() + ' 已恢复内置模板' });
    } catch (error) {
      toast({
        title: '恢复模板失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setConfigBusy(null);
    }
  }

  const templateChoices = Object.entries(TemplateTypeLabels) as [TemplateType, string][];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground-emphasis md:text-3xl">UPS / DPD 数据处理</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          将本地 Excel 数据填入 UPS 或 DPD 模板。主数据文件必需，单件明细表可选。
        </p>
      </header>

      <Tabs value={tab} onValueChange={changeTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="process"><Play className="mr-2 h-4 w-4" />处理文件</TabsTrigger>
          <TabsTrigger value="config" disabled={busy}><Settings2 className="mr-2 h-4 w-4" />模板设置</TabsTrigger>
        </TabsList>

        <TabsContent value="process" className="space-y-4">
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1 · 选择物流模板</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="物流模板类型">
                {templateChoices.map(([type, label]) => (
                  <button
                    type="button" key={type} disabled={busy} aria-pressed={type === templateType}
                    onClick={() => chooseType(type)}
                    className={
                      'rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ' +
                      (type === templateType ? 'border-primary bg-primary-subtle' : 'border-border bg-card hover:border-primary/50')
                    }
                  >
                    <p className="text-sm font-semibold text-foreground-emphasis">{label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{type === 'ups' ? '填充 UPS 总结单' : '填充 DPD 数据预报'}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2 · 选择数据文件</CardTitle>
              <p className="text-xs text-muted-foreground">从电脑中选择 Excel 文件，文件不会上传至云端。</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {([
                { kind: 'main', label: '主数据文件', help: '必需', path: mainFile },
                { kind: 'detail', label: '单件明细表', help: '可选，用于补充子单号等信息', path: detailFile },
              ] as const).map((item) => (
                <div key={item.kind} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-sm font-semibold text-foreground-emphasis">{item.label}</label>
                    <span className="text-xs text-muted-foreground">{item.help}</span>
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="break-all text-sm">{item.path ? getFileName(item.path) : '尚未选择文件'}</p>
                        {item.path && <p className="mt-1 break-all text-xs text-muted-foreground">{item.path}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button type="button" variant="outline" disabled={busy} onClick={() => void chooseFile(item.kind)}>
                        {item.path ? '更换文件' : '选择文件'}
                      </Button>
                      {item.path && (
                        <Button
                          type="button" size="icon" variant="ghost" disabled={busy}
                          aria-label={'移除' + item.label}
                          onClick={() => {
                            if (item.kind === 'main') setMainFile(null);
                            else setDetailFile(null);
                            setOperation({ kind: 'idle' });
                          }}
                        ><X className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">使用当前保存的 {TemplateTypeLabels[templateType]} 模板；需要更换时进入“模板设置”。</p>
                <Button type="button" disabled={!mainFile || busy} onClick={() => void processFile()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {busy ? '正在处理' : operation.kind === 'error' ? '重试处理' : '开始处理'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <FileOperationFeedback state={operation} title={TemplateTypeLabels[templateType] + ' 处理完成'} />
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          {configs.kind === 'loading' && (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />正在读取本地模板设置…
            </div>
          )}
          {configs.kind === 'error' && (
            <div role="alert" className="rounded-xl border border-danger bg-danger-subtle p-5">
              <p className="text-sm font-semibold text-danger-subtle-fg">模板设置读取失败</p>
              <p className="mt-1 break-words text-sm text-danger-fg">{configs.message}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void loadConfigs()}>重试读取</Button>
            </div>
          )}
          {configs.kind === 'ready' && templateChoices.map(([type, label]) => {
            const current = configs[type];
            return (
              <Card key={type} className="shadow-none">
                <CardHeader className="pb-3"><CardTitle className="text-base">{label} · 模板</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{current.use_default ? '正在使用内置模板' : '正在使用自定义模板'}</p>
                      {!current.use_default && current.template_path && (
                        <p className="mt-1 break-all text-xs text-muted-foreground">{current.template_path}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={configBusy !== null} onClick={() => void chooseCustomTemplate(type)}>
                        {configBusy === type ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                        选择自定义模板
                      </Button>
                      {!current.use_default && (
                        <Button type="button" size="sm" variant="ghost" disabled={configBusy !== null} onClick={() => void resetTemplate(type)}>
                          <RotateCcw className="h-4 w-4" />恢复内置模板
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
