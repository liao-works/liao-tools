import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Loader2, PackageSearch, Search, Ship, X } from 'lucide-react';
import { FeatureHeader } from '@/components/layout/FeatureHeader';
import { TutorialLink } from '@/components/common/TutorialLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { recordUsage } from '@/lib/api/usage';
import { shippingApi, type ShippingLookupResult } from '@/lib/api/shipping';
import { openUrlPath } from '@/lib/file-opener';
import { queryErrorMessage } from '@/lib/hs-code';
import {
  SHIPPING_LINES,
  SHIPPING_LINES_CAPTURED_AT,
  SHIPPING_LINES_SOURCE_URL,
  filterShippingLines,
  identifyTrackingNumber,
  shippingLineLetters,
  wubaliuTrackUrl,
  type ShippingLine,
} from './data';

function OpenLineButton({ line, field, label, icon: Icon }: {
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

function LinesDirectory() {
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState<string | null>(null);

  const letters = useMemo(shippingLineLetters, []);
  const results = useMemo(() => filterShippingLines(query, letter), [query, letter]);

  return (
    <div className="space-y-4">
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
                  <OpenLineButton line={line} field="official" label="官网" icon={Globe} />
                  <OpenLineButton line={line} field="tracking" label="货物追踪" icon={PackageSearch} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

type LookupState = 'idle' | 'loading' | 'ok' | 'error';

function CargoTracking() {
  const navigate = useNavigate();
  const [number, setNumber] = useState('');
  const [remote, setRemote] = useState<ShippingLookupResult | null>(null);
  const [remoteState, setRemoteState] = useState<LookupState>('idle');
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const lookupSeq = useRef(0);

  const match = useMemo(() => identifyTrackingNumber(number), [number]);
  const hasInput = match.normalized.length > 0;

  // 在线识别：停顿 700ms 后自动查询；本地识别永远即时先行，在线失败静默降级
  useEffect(() => {
    if (!hasInput) {
      lookupSeq.current += 1;
      setRemote(null);
      setRemoteState('idle');
      setRemoteError(null);
      return;
    }
    const category = match.kind === 'air-mawb' ? 'air' : match.kind === 'express' ? 'express' : 'sea';
    const seq = ++lookupSeq.current;
    const timer = window.setTimeout(() => {
      setRemoteState('loading');
      shippingApi
        .lookup(match.normalized, category)
        .then((result) => {
          if (lookupSeq.current !== seq) return;
          setRemote(result);
          setRemoteState('ok');
        })
        .catch((error) => {
          if (lookupSeq.current !== seq) return;
          setRemote(null);
          setRemoteState('error');
          setRemoteError(queryErrorMessage(error));
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [match.normalized, match.kind, hasInput]);

  const openWuba = () => {
    recordUsage({ tool: 'shipping', action: 'query', items: 1 });
    void openUrlPath(wubaliuTrackUrl(match.normalized, match.kind)).catch(() => undefined);
  };
  const openTrackingTool = () => {
    recordUsage({ tool: 'shipping', action: 'query', items: 1 });
    navigate(`/tracking?numbers=${encodeURIComponent(match.normalized)}`);
  };
  const openOfficial = () => {
    if (!match.line?.tracking) return;
    recordUsage({ tool: 'shipping', action: 'query', items: 1 });
    void openUrlPath(match.line.tracking).catch(() => undefined);
  };
  const openRemoteJump = (url: string) => {
    recordUsage({ tool: 'shipping', action: 'query', items: 1 });
    void openUrlPath(url).catch(() => undefined);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="输入提单号 / 集装箱号 / 快递单号，如 COSU1234567890"
              className="pl-9 pr-9"
            />
            {number && (
              <button
                type="button"
                aria-label="清空单号"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent"
                onClick={() => setNumber('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            海运单号本地识别承运商后直达官方查询页，同时联网请求 5688 在线识别（覆盖更全的单号模式）；
            快递单号交由运单轨迹（17TRACK）查询。本地识别完全离线可用。
          </p>
        </CardContent>
      </Card>

      {hasInput && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{match.kindLabel}</Badge>
              <span className="font-mono text-sm text-muted-foreground">{match.normalized}</span>
            </div>

            {match.line && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">本地识别：</span>
                <span className="font-medium">{match.line.cn || match.line.en}</span>
                <Badge variant="secondary" className="font-mono text-xs">{match.line.code}</Badge>
              </div>
            )}

            {match.kind === 'sea-container' && !match.line && (
              <p className="text-sm text-muted-foreground">
                箱主代码 {match.normalized.slice(0, 4)} 未命中内置船司前缀，等待在线识别，或在下方名录中手动查找。
              </p>
            )}
            {match.kind === 'sea-bl' && !match.line && (
              <p className="text-sm text-muted-foreground">
                提单前缀 {match.normalized.slice(0, 4)} 未命中内置船司前缀，等待在线识别，或在下方名录中手动查找。
              </p>
            )}
            {match.kind === 'unknown' && (
              <p className="text-sm text-muted-foreground">
                未识别出单号类型，可在运单轨迹工具中批量查询，或由 5688 尝试识别。
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {match.kind === 'express' && (
                <Button size="sm" className="h-8" onClick={openTrackingTool}>
                  <PackageSearch size={14} className="mr-1" />
                  去运单轨迹查询{match.carrierLabel ? `（${match.carrierLabel}）` : ''}
                </Button>
              )}
              {match.line?.tracking && (
                <Button size="sm" className="h-8" onClick={openOfficial}>
                  <Globe size={14} className="mr-1" />
                  打开{match.line.cn || match.line.en}官方跟踪页
                </Button>
              )}
              <Button size="sm" variant={match.line?.tracking ? 'outline' : 'default'} className="h-8" onClick={openWuba}>
                <Globe size={14} className="mr-1" />
                5688 识别并查询
              </Button>
              {match.kind !== 'express' && (
                <Button size="sm" variant="outline" className="h-8" onClick={openTrackingTool}>
                  <PackageSearch size={14} className="mr-1" />
                  在运单轨迹中查询
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {hasInput && remoteState !== 'idle' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              在线识别（5688）
              {remoteState === 'loading' && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            </div>

            {remoteState === 'error' && (
              <p className="text-sm text-muted-foreground">
                在线识别暂不可用（{remoteError}），已回退本地识别与跳转方案。
              </p>
            )}

            {remoteState === 'ok' && remote && (
              <>
                {remote.carriers.length > 0 ? (
                  <div className="space-y-2">
                    {remote.carriers.map((carrier) => (
                      <div key={carrier.carrierCode + carrier.jumpUrl} className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="font-mono text-xs">{carrier.carrierCode}</Badge>
                        <span className="text-sm font-medium">{carrier.carrierName || carrier.carrierNameEn}</span>
                        {carrier.carrierNameEn && carrier.carrierName && (
                          <span className="text-xs text-muted-foreground truncate max-w-60">{carrier.carrierNameEn}</span>
                        )}
                        {carrier.confidence != null && (
                          <span className="text-xs text-muted-foreground">置信 {carrier.confidence}%</span>
                        )}
                        {carrier.jumpUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => openRemoteJump(carrier.jumpUrl as string)}
                          >
                            <Globe size={12} className="mr-1" />
                            官方查询页
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">5688 未能识别该单号的承运商。</p>
                )}

                {remote.trackEvents.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">物流巴巴系统内轨迹（{remote.trackEvents.length} 条）</p>
                    <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border p-3">
                      {remote.trackEvents.map((event, index) => (
                        <div key={index} className="text-sm flex gap-2 flex-wrap">
                          {event.sdate && <span className="font-mono text-xs text-muted-foreground">{event.sdate}</span>}
                          {event.place && <Badge variant="secondary" className="text-xs">{event.place}</Badge>}
                          {event.intro && <span>{event.intro}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ShippingLinesPage() {
  return (
    <div className="lt-feature space-y-6">
      <FeatureHeader
        eyebrow="业务查询"
        title="船司查询"
        description={`收录 ${SHIPPING_LINES.length} 家船司的官网与货物跟踪入口，支持单号识别直达官方查询页`}
        icon={<Ship size={26} strokeWidth={1.8} />}
        action={<TutorialLink featureId="shipping" variant="outline" />}
      />

      <Tabs defaultValue="lines" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lines">船司名录</TabsTrigger>
          <TabsTrigger value="track">货物追踪</TabsTrigger>
        </TabsList>
        <TabsContent value="lines">
          <LinesDirectory />
        </TabsContent>
        <TabsContent value="track">
          <CargoTracking />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        数据来源：
        <button
          type="button"
          className="lt-tax-source-link"
          onClick={() => { void openUrlPath(SHIPPING_LINES_SOURCE_URL).catch(() => undefined); }}
        >
          物流巴巴 · 船公司大全
        </button>
        （{SHIPPING_LINES_CAPTURED_AT} 收录）。货物追踪与 5688 的逻辑一致：识别单号后跳转承运商官方查询页。
      </p>
    </div>
  );
}
