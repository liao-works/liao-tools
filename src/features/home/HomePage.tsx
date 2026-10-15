import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Command, Search } from 'lucide-react';
import { findTools, navGroups } from '@/components/layout/navigation';

export function HomePage() {
  const [query, setQuery] = useState('');
  const results = findTools(query);
  const isSearching = query.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <section className="pt-2 md:pt-8">
        <div className="mb-3 text-xs font-medium tracking-[0.14em] text-muted-foreground">LIAO TOOLS · 工作空间</div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground-emphasis md:text-3xl">今天要处理什么？</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          选择一个工具开始工作。查询结果、文件输出与操作状态均由对应工具管理。
        </p>
        <label className="mt-6 flex min-h-12 max-w-2xl items-center gap-3 rounded-xl border border-input bg-card px-4 shadow-xs transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
          <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="sr-only">搜索工具</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索关税、Alta、DPD、海铁、ASIN..."
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="hidden items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground sm:inline-flex">
            <Command className="h-3 w-3" /> K
          </span>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">使用 Ctrl / ⌘ + K，可在任意工具页面搜索并跳转。</p>
      </section>

      {isSearching ? (
        <section aria-live="polite" aria-label="工具搜索结果">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">搜索结果</h2>
            <span className="text-xs text-muted-foreground">{results.length} 个工具</span>
          </div>
          {results.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((item) => <ToolCard key={item.href} item={item} />)}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
              <p className="font-medium">没有找到匹配的工具</p>
              <p className="mt-1 text-sm text-muted-foreground">可尝试“关税”、“Excel”、“Amazon”等关键词。</p>
              <button type="button" className="mt-4 text-sm font-medium text-primary hover:underline" onClick={() => setQuery('')}>查看全部工具</button>
            </div>
          )}
        </section>
      ) : (
        <div className="space-y-8">
          {navGroups.filter((group) => group.title !== '工作空间').map((group) => (
            <section key={group.title} aria-label={group.title}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground-emphasis">{group.title}</h2>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((item) => <ToolCard key={item.href} item={item} />)}
              </div>
            </section>
          ))}
          <p className="border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
            数据状态和更新历史可从「数据维护」统一进入；查询与文件处理结果仍由对应工具管理。
          </p>
        </div>
      )}
    </div>
  );
}

function ToolCard({ item }: { item: ReturnType<typeof findTools>[number] }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      className="group flex min-h-28 items-start gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground-emphasis">
          <span>{item.title}</span>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
        </div>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.description}</p>
      </div>
    </Link>
  );
}
