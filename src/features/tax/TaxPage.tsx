import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SingleQueryTab } from './components/SingleQueryTab';
import { BatchQueryTab } from './components/BatchQueryTab';
import { UpdateTab } from './components/UpdateTab';

export function TaxPage() {
  const [activeTab, setActiveTab] = useState('single');
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">英国 / 北爱关税查询</h2>
        <p className="text-muted-foreground">
          在同一商品编码下查看英国与北爱两地区税率及各自的核验状态
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="single">单个查询</TabsTrigger>
          <TabsTrigger value="batch">批量查询</TabsTrigger>
          <TabsTrigger value="update">数据更新</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-4">
          <SingleQueryTab onSwitchToUpdate={() => setActiveTab('update')} />
        </TabsContent>

        <TabsContent value="batch" className="space-y-4">
          <BatchQueryTab />
        </TabsContent>

        <TabsContent value="update" className="space-y-4">
          <UpdateTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
