import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { SingleQueryTab } from './components/SingleQueryTab';
import { CalcTab } from './components/CalcTab';
import { BatchQueryTab } from './components/BatchQueryTab';
import { UpdateTab } from './components/UpdateTab';
import { DataStatsTab } from './components/DataStatsTab';

const validTabs = ['single', 'calc', 'batch', 'update', 'stats'];
export function TaxPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') || 'single';
  const tab = validTabs.includes(requested) ? requested : 'single';
  return (
    <div className="lt-feature space-y-6">
      <FeatureHeader eyebrow="TRADE / TARIFF" title="英国 / 北爱尔兰关税查询"
        description="输入商品编码，查询中国原产商品进入英国与北爱尔兰的普通第三国税率；暂无数据时显示 —。"
        illustrationSrc="/illustrations/tariff-hero.svg"/>
      <Tabs value={tab} onValueChange={value => setParams(value === 'single' ? {} : { tab: value })} className="space-y-4">
        <TabsList>
          <TabsTrigger value="single">单码查询</TabsTrigger>
          <TabsTrigger value="calc">成本试算</TabsTrigger>
          <TabsTrigger value="batch">批量 Excel 查询</TabsTrigger>
          <TabsTrigger value="update">数据更新与审核</TabsTrigger>
          <TabsTrigger value="stats">数据统计</TabsTrigger>
        </TabsList>
        <TabsContent value="single" className="space-y-4"><SingleQueryTab /></TabsContent>
        <TabsContent value="calc" className="space-y-4"><CalcTab /></TabsContent>
        <TabsContent value="batch" className="space-y-4"><BatchQueryTab /></TabsContent>
        <TabsContent value="update" className="space-y-4"><UpdateTab /></TabsContent>
        <TabsContent value="stats" className="space-y-4"><DataStatsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
