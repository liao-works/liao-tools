import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QueryTab } from './components/QueryTab';
import { BatchTab } from './components/BatchTab';
import { DataManageTab } from './components/DataManageTab';

export function AltaPage() {
  const [activeTab, setActiveTab] = useState('query');

  const switchToManageTab = () => {
    setActiveTab('manage');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Alta禁运商品查询</h2>
        <p className="text-muted-foreground">
          查询HS Code禁运状态，支持单个查询和批量处理
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="query">查询</TabsTrigger>
          <TabsTrigger value="batch">批量处理</TabsTrigger>
          <TabsTrigger value="manage">数据管理</TabsTrigger>
        </TabsList>

        <TabsContent value="query" className="space-y-4">
          <QueryTab onSwitchToManage={switchToManageTab} />
        </TabsContent>

        <TabsContent value="batch" className="space-y-4">
          <BatchTab onSwitchToManage={switchToManageTab} />
        </TabsContent>

        <TabsContent value="manage" className="space-y-4">
          <DataManageTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
