import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { SingleQueryTab } from './components/SingleQueryTab';
import { BatchQueryTab } from './components/BatchQueryTab';
import { UpdateTab } from './components/UpdateTab';

const validTabs = ['single', 'batch', 'update'];
export function TaxPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') || 'single';
  const tab = validTabs.includes(requested) ? requested : 'single';
  return (
    <div className="lt-feature space-y-6">
      <FeatureHeader eyebrow="TRADE / TARIFF" title="英国 / 北爱尔兰关税查询"
        description="输入商品编码，查询本地英国及北爱尔兰税率、反倾销和反补贴字段。结果附带来源与核验状态。"
        illustrationSrc="/illustrations/tariff-hero.svg"/>
      <Tabs value={tab} onValueChange={value => setParams(value === 'single' ? {} : { tab: value })} className="space-y-4">
        <TabsList>
          <TabsTrigger value="single">单码查询</TabsTrigger>
          <TabsTrigger value="batch">批量 Excel 查询</TabsTrigger>
          <TabsTrigger value="update">数据更新与审核</TabsTrigger>
        </TabsList>
        <TabsContent value="single" className="space-y-4"><SingleQueryTab /></TabsContent>
        <TabsContent value="batch" className="space-y-4"><BatchQueryTab /></TabsContent>
        <TabsContent value="update" className="space-y-4"><UpdateTab /></TabsContent>
      </Tabs>
    </div>
  );
}
