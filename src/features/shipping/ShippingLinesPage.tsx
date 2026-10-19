import { useMemo, useState } from 'react';
import { Globe, PackageSearch, Search, Ship, X } from 'lucide-react';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { recordUsage } from '@/lib/api/usage';
import { openUrlPath } from '@/lib/file-opener';
import {
  SHIPPING_LINES,
  SHIPPING_LINES_CAPTURED_AT,
  SHIPPING_LINES_SOURCE_URL,
  filterShippingLines,
  shippingLineLetters,
  type ShippingLine,
} from './data';

function OpenLinkButton({
  line,
  field,
  label,
  icon: Icon,
}: {
  line: ShippingLine;
  field: 'official' | 'tracking';
  label: string;
  icon: typeof Globe;
}) {
  const url = line[field];
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!url}
      className="h-8 flex-1"
      onClick={() => {
        if (!url) return;
        recordUsage({ tool: 'shipping', action: 'query', items: 1 });
        void openUrlPath(url).catch(() => undefined);
      }}
    >
      <Icon size={14} className="mr-1" />
      {label}
    </Button>
  );
}

export function ShippingLinesPage() {
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState<string | null>(null);

  const letters = useMemo(shippingLineLetters, []);
  const results = useMemo(() => filterShippingLines(query, letter), [query, letter]);

  return (
    <div className="lt-feature space-y-6">
      <FeatureHeader
        eyebrow="业务查询"
        title="船司查询"
        description={`收录 ${SHIPPING_LINES.length} 家船司的官网与货物跟踪入口，支持按代码、中英文名搜索`}
        icon={<Ship size={26} strokeWidth={1.8} />}
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索船司代码、中文名或英文名，如 MSK / 马士基 / maersk"
              className="pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                aria-label="清空搜索"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent"
                onClick={() => setQuery('')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={letter === null ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setLetter(null)}
            >
              全部
            </Button>
            {letters.map((l) => (
              <Button
                key={l}
                size="sm"
                variant={letter === l ? 'default' : 'outline'}
                className="h-7 px-2.5 text-xs"
                onClick={() => setLetter(letter === l ? null : l)}
              >
                {l}
              </Button>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            共 {results.length} 家船司
            {letter && <> · 首字母 {letter}</>}
          </p>
        </CardContent>
      </Card>

      {results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            没有匹配的船司，换个关键词试试
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {results.map((line) => (
            <Card key={line.code} className="py-0">
              <CardContent className="p-4 space-y-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{line.cn || line.en}</span>
                    <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                      {line.code}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground truncate" title={line.en}>
                    {line.en}
                  </p>
                </div>
                <div className="flex gap-2">
                  <OpenLinkButton line={line} field="official" label="官网" icon={Globe} />
                  <OpenLinkButton line={line} field="tracking" label="货物追踪" icon={PackageSearch} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        数据来源：
        <button
          type="button"
          className="lt-tax-source-link"
          onClick={() => { void openUrlPath(SHIPPING_LINES_SOURCE_URL).catch(() => undefined); }}
        >
          物流巴巴 · 船公司大全
        </button>
        （{SHIPPING_LINES_CAPTURED_AT} 收录）。货物追踪会打开各船司官网，在对应页面输入提单号或集装箱号查询。
      </p>
    </div>
  );
}
