import { ProcessFlow } from './components/ProcessFlow';

export function ExcelPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Excel数据处理工具</h2>
        <p className="text-muted-foreground">
          支持UPS总结单和DPD数据预报模板填充
        </p>
      </div>

      <ProcessFlow />
    </div>
  );
}
