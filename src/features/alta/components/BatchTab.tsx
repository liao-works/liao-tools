import { useState } from 'react';
import { Upload, Download, Loader2, FileSpreadsheet, CheckCircle2, ShieldAlert, AlertTriangle, X, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { FileOpenDialog } from '@/components/common/FileOpenDialog';
import { altaApi } from '@/lib/api/alta';
import { getFileName } from '@/lib/file-opener';
import type { AltaBatchResult } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { open, save } from '@tauri-apps/plugin-dialog';

const MATCH_OPTIONS = [
  { value: 4, label: '4位匹配' },
  { value: 6, label: '6位匹配' },
  { value: 8, label: '8位匹配' },
  { value: undefined, label: '完全匹配' },
];

interface BatchTabProps {
  onSwitchToManage: () => void;
}

export function BatchTab({ onSwitchToManage }: BatchTabProps) {
  const [filePath, setFilePath] = useState<string>('');
  const [matchLength, setMatchLength] = useState<number | undefined>(6);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<AltaBatchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showResultFileDialog, setShowResultFileDialog] = useState(false);
  const [showTemplateFileDialog, setShowTemplateFileDialog] = useState(false);
  const [templateFilePath, setTemplateFilePath] = useState<string>('');
  const { toast } = useToast();

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Excel Files',
          extensions: ['xlsx', 'xls']
        }]
      });

      if (selected && typeof selected === 'string') {
        setFilePath(selected);
        setResult(null);
        setErrorMessage('');
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      toast({
        title: '选择文件失败',
        description: '请重试',
        variant: 'destructive',
      });
    }
  };

  const handleProcess = async () => {
    if (!filePath) return;

    setProcessing(true);
    setResult(null);
    setErrorMessage('');

    try {
      const data = await altaApi.batchProcess(filePath, matchLength);
      setResult(data);
      
      // 如果有输出文件，显示对话框
      if (data.output_path) {
        setShowResultFileDialog(true);
      }
      
      toast({
        title: '处理完成',
        description: `成功处理 ${data.total} 条记录，其中 ${data.forbidden} 条禁运`,
      });
    } catch (error: any) {
      console.error('处理失败:', error);
      setErrorMessage(error?.message || '处理失败，请检查文件格式和本地数据库。');

      // 检查是否是数据库为空的错误
      if (error.code === 'DATABASE_EMPTY') {
        toast({
          title: '数据库为空',
          description: '请先到"数据管理"标签更新禁运数据',
          variant: 'destructive',
          action: (
            <button
              onClick={onSwitchToManage}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary"
            >
              去更新
            </button>
          ),
        });
      } else {
        toast({
          title: '处理失败',
          description: error.message || '请检查文件格式或稍后重试',
          variant: 'destructive',
        });
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const path = await save({
        defaultPath: 'Alta查询模板.xlsx',
        filters: [
          {
            name: 'Excel',
            extensions: ['xlsx'],
          },
        ],
      });

      if (path) {
        await altaApi.downloadTemplate(path);
        setTemplateFilePath(path);
        setShowTemplateFileDialog(true);
        
        toast({
          title: '下载成功',
          description: '模板已保存',
        });
      }
    } catch (error: any) {
      console.error('下载模板失败:', error);
      toast({
        title: '下载失败',
        description: error.message || '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="lt-process-steps" aria-label="批量检查步骤">
        <div><span className="lt-step-index">01</span><strong>准备模板</strong><small>按列填写 HS Code</small></div>
        <div><span className="lt-step-index">02</span><strong>选择文件</strong><small>支持 .xls / .xlsx</small></div>
        <div><span className="lt-step-index">03</span><strong>筛查并导出</strong><small>保留禁运与例外信息</small></div>
      </div>
      <div className="lt-operation-grid">
        <Card className="lt-operation-primary">
          <CardHeader>
            <div className="lt-operation-heading"><span className="lt-step-index">01</span>
              <div><CardTitle>准备并上传编码文件</CardTitle><CardDescription>使用标准模板填写编码，或直接选择已准备好的 Excel 文件。</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="lt-operation-template">
              <div><strong><FileSpreadsheet size={17}/> 标准 Excel 模板</strong>
                <p>不确定列结构时，请先下载模板并填写 HS Code。</p></div>
              <Button variant="outline" onClick={handleDownloadTemplate}><Download className="mr-2 h-4 w-4"/>下载模板</Button>
            </div>
            <div className="lt-operation-file-select">
              <label>本地工作簿 <span>必选</span></label>
              <div className="lt-operation-drop">
                <span className="lt-operation-file-symbol"><FileSpreadsheet size={25}/></span>
                <div className="lt-operation-file-details">
                  <strong>{filePath ? getFileName(filePath) : '选择包含商品编码的 Excel 文件'}</strong>
                  <small>{filePath ? filePath : '支持 .xlsx / .xls · 文件在本地处理'}</small>
                </div>
                <Button variant="outline" onClick={handleSelectFile} disabled={processing}><Upload className="mr-2 h-4 w-4"/>{filePath ? '更换' : '选择文件'}</Button>
                {filePath && <button type="button" title="移除文件" aria-label="移除文件" className="lt-operation-clear"
                  disabled={processing} onClick={() => {setFilePath('');setResult(null);setErrorMessage('');}}><X size={16}/></button>}
              </div>
            </div>
            <div className="lt-operation-field">
              <Label>匹配位数</Label>
              <div className="lt-operation-choices">
                {MATCH_OPTIONS.map(option => <button type="button" key={option.value || 'full'}
                  className={matchLength === option.value ? 'is-selected' : ''}
                  disabled={processing} aria-pressed={matchLength === option.value}
                  onClick={() => {setMatchLength(option.value);setResult(null);}}>
                  {option.label}</button>)}
              </div>
              <p>匹配位数越短，命中范围可能越广；最终应核对限制条目和例外。</p>
            </div>
            <Button className="lt-operation-run" onClick={handleProcess} disabled={!filePath || processing}>
              {processing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>正在检查本地数据…</>
                : <><ShieldAlert className="mr-2 h-4 w-4"/>开始批量筛查</>}
            </Button>
            {errorMessage && <p className="lt-operation-error" role="alert">{errorMessage}</p>}
          </CardContent>
        </Card>
        <aside className="lt-operation-side">
          <div className="lt-operation-side-card">
            <span className="lt-kicker">SCREENING NOTES</span>
            <h3>结果如何理解？</h3>
            <p>命中意味着需要逐条确认限制内容及例外条款。未命中只代表此版本数据库未匹配到对应编码，并不等于货物全面合规。</p>
            <div className="lt-operation-note"><ShieldAlert size={17}/> 需要复核：命中禁运记录及含例外条目</div>
            <div className="lt-operation-note"><FileCheck2 size={17}/> 文件导出：由本地批处理命令生成</div>
          </div>
        </aside>
      </div>
      {result && <Card className="lt-operation-result">
        <CardHeader>
          <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-success-fg"/>
            <div><CardTitle>批量筛查完成</CardTitle><CardDescription>按当前匹配位数产生的本地结果</CardDescription></div></div>
        </CardHeader>
        <CardContent>
          <div className="lt-operation-stats">
            <div><span>总条数</span><strong>{result.total}</strong></div>
            <div><span>命中禁运</span><strong className="text-destructive">{result.forbidden}</strong></div>
            <div><span>未命中</span><strong>{result.safe}</strong></div>
            <div><span>无效编码</span><strong>{result.invalid}</strong></div>
          </div>
          <p className="lt-operation-result-note"><AlertTriangle size={16}/> 未命中并不代表全面合规，请根据导出的原始条目核查限制与例外。</p>
          {result.output_path && <div className="lt-operation-output"><FileSpreadsheet size={19}/>
            <div><strong>{getFileName(result.output_path)}</strong><span title={result.output_path}>{result.output_path}</span></div>
            <Button variant="outline" onClick={() => setShowResultFileDialog(true)}>查看结果</Button>
          </div>}
        </CardContent>
      </Card>}

      {/* 模板文件打开对话框 */}
      <FileOpenDialog
        open={showTemplateFileDialog}
        onOpenChange={setShowTemplateFileDialog}
        filePath={templateFilePath}
        title="模板下载完成"
        description="Excel 模板已下载，是否立即打开编辑？"
        fileName={getFileName(templateFilePath)}
      />

      {/* 处理结果文件打开对话框 */}
      <FileOpenDialog
        open={showResultFileDialog}
        onOpenChange={setShowResultFileDialog}
        filePath={result?.output_path || ''}
        title="Alta 禁运查询完成"
        description="禁运商品批量查询已完成，是否查看结果文件？"
        fileName={result?.output_path ? getFileName(result.output_path) : undefined}
      />
    </div>
  );
}
