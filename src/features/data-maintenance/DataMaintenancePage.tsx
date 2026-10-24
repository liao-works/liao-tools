import { useSearchParams, Link } from 'react-router-dom';
import { Database, FileSearch, History, ShieldAlert } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { UpdateTab } from '@/features/tax/components/UpdateTab';
import { DataManageTab } from '@/features/alta/components/DataManageTab';
import { TutorialLink } from '@/components/common/TutorialLink';
import { openUpdateHistory } from '@/hooks/use-update-history';

type DataModule = 'tax' | 'alta';

export function DataMaintenancePage() {
  const [params, setParams] = useSearchParams();
  const module: DataModule = params.get('module') === 'alta' ? 'alta' : 'tax';

  function changeModule(value: string) {
    const next: DataModule = value === 'alta' ? 'alta' : 'tax';
    setParams({ module: next }, { replace: true });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground-emphasis md:text-3xl">数据维护</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          查看本地数据版本、检查数据来源更新，以及查看真实的更新记录。
          英国 / 北爱关税与 Alta 禁运数据库相互独立。
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-fg" aria-hidden="true" />
        <p className="text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground-emphasis">更新不等于已完成税率核验。</strong>
          本地安装、远程可用、核验状态和审核候选是不同概念；尤其 NI 条件数据不能因为下载或审计通过而直接当作确定税率。
        </p>
      </div>

      <Tabs value={module} onValueChange={changeModule} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="数据模块">
            <TabsTrigger value="tax"><Database className="mr-2 h-4 w-4" />英国 / 北爱关税</TabsTrigger>
            <TabsTrigger value="alta"><FileSearch className="mr-2 h-4 w-4" />Alta 禁运</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => openUpdateHistory({ module })}>
              <History className="h-4 w-4" />更新历史
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to={module === 'tax' ? '/tax' : '/alta'}>返回业务查询</Link>
            </Button>
            <TutorialLink featureId="data-maintenance" showLabel variant="outline" />
          </div>
        </div>
        <TabsContent value="tax" className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="pt-5">
              <p className="text-sm font-semibold text-foreground-emphasis">关税数据</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                正式数据库更新继续使用现有受保护的下载命令。NI Other 审核与影子预览仅供核对，不会自动升格为正式税率。
              </p>
            </CardContent>
          </Card>
          <UpdateTab />
        </TabsContent>
        <TabsContent value="alta" className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="pt-5">
              <p className="text-sm font-semibold text-foreground-emphasis">禁运清单</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                读取当前本地清单记录数和更新时间；查询时“未命中”仅表示当前清单未匹配，不能证明商品全面合规。
              </p>
            </CardContent>
          </Card>
          <DataManageTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
