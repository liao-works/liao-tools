import { useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { QueryTab } from './components/QueryTab';
import { BatchTab } from './components/BatchTab';
import { DataManageTab } from './components/DataManageTab';

export function AltaPage() {
  const [params, setParams] = useSearchParams();
  const tab = ['query', 'batch', 'manage'].includes(params.get('tab') || '')
    ? params.get('tab')! : 'query';
  const setTab = (value: string) => setParams(value === 'query' ? {} : { tab: value });
  return (
    <div className="lt-feature space-y-6">
      <FeatureHeader eyebrow="COMPLIANCE / ALTA" title="Alta 禁运商品查询"
        description="按 HS Code 匹配禁运条目。请同时核对匹配位数、适用范围和例外条件；未命中不等于全面合规。"
        icon={<ShieldCheck size={36} strokeWidth={1.5}/>}/>
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="query">单码检查</TabsTrigger>
          <TabsTrigger value="batch">批量筛查</TabsTrigger>
          <TabsTrigger value="manage">禁运数据维护</TabsTrigger>
        </TabsList>
        <TabsContent value="query" className="space-y-4"><QueryTab onSwitchToManage={() => setTab('manage')}/></TabsContent>
        <TabsContent value="batch" className="space-y-4"><BatchTab onSwitchToManage={() => setTab('manage')}/></TabsContent>
        <TabsContent value="manage" className="space-y-4"><DataManageTab/></TabsContent>
      </Tabs>
    </div>
  );
}
