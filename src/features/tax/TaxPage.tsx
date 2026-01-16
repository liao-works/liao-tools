import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SingleQueryTab } from './components/SingleQueryTab';
import { BatchQueryTab } from './components/BatchQueryTab';
import { UpdateTab } from './components/UpdateTab';

export function TaxPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">英国海关税率查询</h2>
        <p className="text-muted-foreground">
          查询商品海关编码税率，支持英国和北爱尔兰地区
        </p>
      </div>

      <Tabs defaultValue="single" className="space-y-4">
        <TabsList>
          <TabsTrigger value="single">单个查询</TabsTrigger>
          <TabsTrigger value="batch">批量查询</TabsTrigger>
          <TabsTrigger value="update">数据更新</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-4">
          <SingleQueryTab />
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
