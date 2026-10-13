import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { RefreshCw, Download, Loader2, CheckCircle, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { taxApi } from '@/lib/api/tax';
import type { TaxPreviewRate, TaxPreviewSummary, TaxSignedReviewResult, NiReviewReport } from '@/lib/api/tax';
import type { TaxTariff, TaxVersionInfo } from '@/types';
import { openUpdateHistory } from '@/hooks/use-update-history';

export function UpdateTab() {
  const [versionInfo, setVersionInfo] = useState<TaxVersionInfo | null>(null);
  const [localVersion, setLocalVersion] = useState<TaxVersionInfo['local'] | null>(null);
  const [offlineCheck, setOfflineCheck] = useState(false);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [previewInfo, setPreviewInfo] = useState<TaxPreviewSummary | null>(null);
  const [previewRate, setPreviewRate] = useState<TaxPreviewRate | null>(null);
  const [productionRate, setProductionRate] = useState<TaxTariff | null>(null);
  const [previewCode, setPreviewCode] = useState('0101210000');
  const [importingPreview, setImportingPreview] = useState(false);
  const [queryingPreview, setQueryingPreview] = useState(false);
  const [hasTrustedSigner, setHasTrustedSigner] = useState(false);
  const [verifyingSigned, setVerifyingSigned] = useState(false);
  const [verifiedReview, setVerifiedReview] = useState<TaxSignedReviewResult | null>(null);
  const [niReview, setNiReview] = useState<NiReviewReport | null>(null);
  const [readingNiReview, setReadingNiReview] = useState(false);

  const { toast } = useToast();

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const handleCheckUpdate = async () => {
    setChecking(true);
    setLogs([]);
    addLog('开始检查更新...');
    // Show local snapshot independently of connectivity or remote metadata.
    try {
      setLocalVersion(await taxApi.getLocalVersion());
    } catch (error) {
      addLog(`本地版本读取失败: ${String(error)}`);
    }

    try {
      const data = await taxApi.checkUpdate();
      setVersionInfo(data);
      setLocalVersion(data.local);
      setOfflineCheck(false);
      addLog('检查完成');
      
      if (data.has_update) {
        addLog(`发现新版本: ${data.remote.version}`);
        addLog(`新增记录: ${data.remote.records - data.local.records} 条`);
        // 更新前预览（来自服务端 data_changes）
        if (data.data_changes?.summary) {
          const s = data.data_changes.summary;
          addLog(`本次预计变动: 新增 ${s.added} / 删除 ${s.removed} / 修改 ${s.modified}`);
        }
        toast({
          title: '发现新版本',
          description: data.data_changes?.summary
            ? `新增 ${data.data_changes.summary.added} / 删除 ${data.data_changes.summary.removed} / 修改 ${data.data_changes.summary.modified}`
            : `版本 ${data.remote.version} 可用`,
        });
      } else {
        addLog('当前已是最新版本');
        toast({
          title: '已是最新版本',
          description: '无需更新',
        });
      }
    } catch (error) {
      const errorMsg = String(error);
      setVersionInfo(null);
      setOfflineCheck(true);
      addLog(`未能连接远程数据源，仍可使用已有本地数据库: ${errorMsg}`);
      toast({
        title: '无法联网检查最新版本',
        description: '本地已安装的数据仍可离线查询，请注意版本日期。',
      });
    } finally {
      setChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setDownloading(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    addLog('开始下载更新...');

    try {
      await taxApi.downloadUpdate((downloaded, total) => {
        setDownloadedBytes(downloaded);
        setTotalBytes(total);
        const percentage = total > 0 ? (downloaded / total) * 100 : 0;
        setDownloadProgress(percentage);
        
        if (Math.floor(percentage) % 25 === 0 && percentage > 0 && percentage < 100) {
          addLog(`下载进度: ${percentage.toFixed(1)}% (${formatBytes(downloaded)} / ${formatBytes(total)})`);
        }
      });
      
      addLog('下载完成');
      addLog('数据库已更新！');
      
      toast({
        title: '更新成功',
        description: '税率数据库已更新到最新版本',
      });
      
      // 重新检查版本信息
      await handleCheckUpdate();
    } catch (error) {
      const errorMsg = String(error);
      addLog(`更新失败: ${errorMsg}`);
      toast({
        title: '更新失败',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleReadNiReview = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'NI Other 审核报告', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;
    setReadingNiReview(true);
    setNiReview(null);
    try {
      const report = await taxApi.readNiReview(selected);
      setNiReview(report);
      toast({
        title: 'NI 审核报告已读取',
        description: `${report.samples} 个样本，${report.manual_review_count} 条需要人工复核`,
      });
    } catch (error) {
      toast({ title: '审核报告无效', description: String(error), variant: 'destructive' });
    } finally {
      setReadingNiReview(false);
    }
  };

  const showOfficialNiCode = (code: string) => {
    if (!/^\d{10}$/.test(code)) return;
    void taxApi.openUrl(
      `https://www.trade-tariff.service.gov.uk/xi/commodities/${code}`
    ).catch((error) =>
      toast({ title: '无法打开官方商品页面', description: String(error), variant: 'destructive' })
    );
  };

  // Shadow preview data is never promoted to the production tariff DB.
  const handleImportPreview = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: '第三国税率影子预览包', extensions: ['zip'] }],
    });
    if (!selected || typeof selected !== 'string') return;
    setImportingPreview(true);
    try {
      const info = await taxApi.importPreview(selected);
      setPreviewInfo(info);
      setPreviewRate(null);
      setProductionRate(null);
      toast({
        title: '预览包已隔离导入',
        description: `读取 ${info.record_count.toLocaleString()} 条，仅供审计，不会替换正式税率库`,
      });
    } catch (error) {
      toast({ title: '预览包校验失败', description: String(error), variant: 'destructive' });
    } finally {
      setImportingPreview(false);
    }
  };

  const handlePreviewLookup = async () => {
    if (!previewInfo) return;
    if (!/^\d{10}$/.test(previewCode)) {
      toast({ title: '请输入完整 10 位商品编码', variant: 'destructive' });
      return;
    }
    setQueryingPreview(true);
    try {
      const [result, live] = await Promise.all([
        taxApi.previewLookup(previewInfo.digest, previewCode),
        taxApi.exactSearch(previewCode).catch(() => null),
      ]);
      setPreviewRate(result);
      setProductionRate(live);
      if (!result) toast({ title: '预览包中未找到此商品编码' });
    } catch (error) {
      toast({ title: '预览查询失败', description: String(error), variant: 'destructive' });
    } finally {
      setQueryingPreview(false);
    }
  };

  const handleVerifySigned = async () => {
    const selected = await open({
      multiple: false, directory: false,
      filters: [{ name: 'Ed25519 签名审计包', extensions: ['zip'] }],
    });
    if (!selected || typeof selected !== 'string') return;
    setVerifyingSigned(true);
    setVerifiedReview(null);
    try {
      const result = await taxApi.verifySignedReview(selected);
      setVerifiedReview(result);
      toast({
        title: '签名和数据完整性已验证',
        description: '发行方身份已验证，但仍是非生产审计数据包。',
      });
    } catch (error) {
      toast({
        title: '签名验证失败 / 数据包不可信',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setVerifyingSigned(false);
    }
  };

  useEffect(() => {
    taxApi.hasSignedReviewTrustKey()
      .then(setHasTrustedSigner)
      .catch(() => setHasTrustedSigner(false));
  }, []);

  // 组件加载时自动检查更新
  useEffect(() => {
    handleCheckUpdate();
  }, []);

  return (
    <div className="space-y-4">
      {/* 版本对比 */}
      {(localVersion || versionInfo) && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* 本地版本 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-info" />
                本地版本
              </CardTitle>
              <CardDescription>当前使用的数据版本</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">版本号</span>
                <span className="text-sm font-medium">{(localVersion ?? versionInfo!.local).version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">记录数</span>
                <span className="text-sm font-medium">{(localVersion ?? versionInfo!.local).records.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">更新日期</span>
                <span className="text-sm font-medium">{(localVersion ?? versionInfo!.local).date}</span>
              </div>
            </CardContent>
          </Card>

          {/* Remote info is absent when offline, not a false "up to date". */}
          {versionInfo && <Card className={versionInfo.has_update ? 'border-primary' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div
                  className={`h-3 w-3 rounded-full ${versionInfo.has_update ? 'bg-success' : 'bg-muted-foreground/60'}`}
                />
                远程版本
              </CardTitle>
              <CardDescription>
                {versionInfo.has_update ? '🎉 有可用更新' : '✅ 已是最新版本'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">版本号</span>
                <span className="text-sm font-medium">{versionInfo.remote.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">记录数</span>
                <span className="text-sm font-medium">{versionInfo.remote.records.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">发布日期</span>
                <span className="text-sm font-medium">{versionInfo.remote.date}</span>
              </div>
            </CardContent>
          </Card>}
        </div>
      )}

      {offlineCheck && (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            当前无法获取远程版本。本地数据仍可查询，但无法确认是不是最新税率。
          </CardContent>
        </Card>
      )}

      {/* 操作按钮 */}
      <Card>
        <CardHeader>
          <CardTitle>更新操作</CardTitle>
          <CardDescription>检查并下载最新的税率数据</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleCheckUpdate} disabled={checking} className="flex-1">
              {checking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  检查中...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  检查更新
                </>
              )}
            </Button>
            <Button
              onClick={handleDownloadUpdate}
              disabled={!versionInfo?.has_update || downloading || offlineCheck}
              variant={versionInfo?.has_update ? 'default' : 'secondary'}
              className="flex-1"
            >
              {downloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  下载中...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  立即更新
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUpdateHistory({ module: 'tax' })}
            >
              <History className="mr-2 h-4 w-4" />
              更新历史
            </Button>
          </div>

          {downloading && (
            <div className="space-y-2">
              <Progress value={downloadProgress} />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{downloadProgress.toFixed(1)}%</span>
                {totalBytes > 0 && (
                  <span>
                    {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* XI Other candidates are *review evidence*, never tax rates to import. */}
      <Card>
        <CardHeader>
          <CardTitle>NI Other · 证据审核</CardTitle>
          <CardDescription>
            加载采集端产生的 xi-review-gate.json，查看跨章节覆盖、差异和人工复核清单。
            此报告未经生产签名验证，且不证明第三国措施与页面 Other 分组完全等价。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" disabled={readingNiReview} onClick={handleReadNiReview}>
            {readingNiReview ? '校验报告中...' : '选择 NI 审核报告 JSON'}
          </Button>
          {niReview && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                日期：{niReview.as_of} · {niReview.samples} 个样本 · 涉及 {niReview.chapters} 个 HS 章节
                · 覆盖门槛：{niReview.required_chapters}
              </div>
              <div className="text-sm font-medium">
                {niReview.evidence_complete ? '证据覆盖要求已达到，仍需业务确认' : '样本不足，不能进入业务核验'}
                · 待人工复核：{niReview.manual_review_count} 项
              </div>
              <div className="rounded-md border p-3 text-xs text-muted-foreground">
                所有 NI Other 结果仍为候选，不允许写入正式税率库。报告仅包含人工核验线索，
                并非关税申报依据。原始审计数据的 SHA-256：{niReview.audit_sha256}
              </div>
              {niReview.manual_review_items.length > 0 && (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {niReview.manual_review_items.map((item) => (
                    <div key={item.code} className="rounded-md border px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-medium">{item.code}</span>
                        <Button size="sm" variant="ghost" onClick={() => showOfficialNiCode(item.code)}>
                          核对官方页面
                        </Button>
                      </div>
                      <div className="text-muted-foreground">{item.comparison} · {item.verdict}</div>
                      <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                        <div>旧版 NI：{item.legacy || '无'}</div>
                        <div>XI 候选：{item.candidate || '无确定候选'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Experimental GB shadow-preview; cannot change production data. */}
      <Card>
        <CardHeader>
          <CardTitle>第三国税率 · 独立预览</CardTitle>
          <CardDescription>
            导入采集端 CI 生成的 target-duty-preview.zip，与正式离线数据库完全隔离。
            此数据包未经生产签名，NI Other 尚未通过规则核验，请勿据此办理关税申报。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={handleImportPreview} disabled={importingPreview}>
            {importingPreview ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {importingPreview ? '校验和导入中' : '选择影子预览 ZIP'}
          </Button>
          {previewInfo && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                版本：{previewInfo.release_id} · 数据日期：{previewInfo.as_of}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <div>商品编码：{previewInfo.record_count.toLocaleString()}</div>
                <div>GB 唯一税率：{previewInfo.gb_verified.toLocaleString()}</div>
                <div>条件/歧义：{previewInfo.gb_conditional.toLocaleString()}</div>
                <div>NI 未核验：{previewInfo.ni_unverified.toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="预览商品编码"
                  value={previewCode}
                  maxLength={10}
                  onChange={(event) => {
                    setPreviewCode(event.target.value);
                    setPreviewRate(null);
                    setProductionRate(null);
                  }}
                  placeholder="输入完整 10 位商品编码"
                  className="max-w-xs font-mono"
                />
                <Button variant="secondary" disabled={queryingPreview} onClick={handlePreviewLookup}>
                  {queryingPreview ? '查询中...' : '查询预览'}
                </Button>
              </div>
              {previewRate && (
                <div className="rounded-md border p-3 space-y-1 text-sm">
                  <div>商品编码：<span className="font-mono">{previewRate.code}</span></div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <div className="font-medium">当前生产数据库</div>
                      <div>GB：{productionRate?.rate || '未找到 / 本地未安装'}</div>
                      <div>NI：{productionRate?.north_ireland_rate || '无'}</div>
                      <div className="text-xs text-muted-foreground">
                        {productionRate?.uk_rate_status || '旧版·来源未经核验'}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">官方 GB 目标税率预览（不能直接申报）</div>
                      <div>GB：{previewRate.gb_status === 'verified'
                        ? previewRate.gb_rate : '条件/歧义：需人工复核'}</div>
                      <div>NI 历史值：{previewRate.ni_legacy_rate || '无'}</div>
                      <div className="text-xs text-muted-foreground">
                        GB：{previewRate.gb_status} · NI：{previewRate.ni_status}（均未完成 NI Other 正式校验）
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                此预览包仅验证来源数据与桌面查询兼容性，不会修改正式 tariffs.db，
                不会自动同步，也不能直接升级为正式数据。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {hasTrustedSigner && (
        <Card>
          <CardHeader>
            <CardTitle>签名审计包验证（非生产）</CardTitle>
            <CardDescription>
              使用桌面应用编译时内置的 Ed25519 公钥验证发行者身份和数据库完整性。
              即使验证成功，也不会安装到正式税率数据库。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={handleVerifySigned} disabled={verifyingSigned}>
              {verifyingSigned ? '正在核验签名...' : '选择签名审计 ZIP 进行验证'}
            </Button>
            {verifiedReview && (
              <div className="text-sm space-y-1">
                <p>签名状态：{verifiedReview.verified_signature ? '已通过可信公钥校验' : '未通过'}</p>
                <p>签名密钥：{verifiedReview.key_id} · 版本：{verifiedReview.release_id}</p>
                <p>数据：{verifiedReview.record_count.toLocaleString()} 条 · 日期：{verifiedReview.as_of}</p>
                <p className="text-muted-foreground">此文件未获生产发布资格，也不证明 NI Other 税率业务正确性。</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 更新日志 */}
      {versionInfo?.changelog && versionInfo.changelog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>更新日志</CardTitle>
            <CardDescription>最近的数据更新记录</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {versionInfo.changelog.map((log, index) => (
                <div key={index} className="flex gap-3">
                  <CheckCircle className="h-5 w-5 text-success-fg shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{log.message}</p>
                    <p className="text-xs text-muted-foreground">{log.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 操作日志 */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>操作日志</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted p-4">
              <div className="space-y-1 font-mono text-sm">
                {logs.map((log, index) => (
                  <div key={index} className="text-muted-foreground">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
