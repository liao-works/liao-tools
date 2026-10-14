import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, AlertTriangle, Download, ExternalLink, Loader2, RefreshCw,
  ShieldCheck, Clock3, PackageCheck, Settings2, ArrowUpRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  checkForUpdates, downloadUpdate, installUpdate, listenToDownloadProgress,
  loadUpdateSettings, saveUpdateSettings, updateLastCheckTime,
  type UpdateInfo, type UpdateSettings, type DownloadProgress
} from '@/lib/updater';

interface Props { initialInfo?: UpdateInfo | null; embedded?: boolean; }

function sizeLabel(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) return '未知';
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function friendlyError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = 'message' in error ? String(error.message) : '检查更新失败';
    return message;
  }
  return '更新失败，请稍后重试或前往官方 Release 页面下载。';
}
function defaultSettings(): UpdateSettings {
  return { auto_check: true, last_check_time: 0, check_interval_hours: 24 };
}
const RELEASES = 'https://github.com/liao-works/liao-tools/releases';

export function UpdateCenter({ initialInfo = null, embedded = false }: Props) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<UpdateSettings>(defaultSettings);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [info, setInfo] = useState<UpdateInfo | null>(initialInfo);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'downloading' | 'ready' | 'launching' | 'launched' | 'error'>('idle');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloadPath, setDownloadPath] = useState('');
  const [installerMessage, setInstallerMessage] = useState('');
  const started = useRef(false);
  const busy = phase === 'checking' || phase === 'downloading' || phase === 'launching';

  useEffect(() => {
    let active = true;
    void loadUpdateSettings().then(value => { if (active) setSettings(value); })
      .catch(err => { if (active) setSettingsError(friendlyError(err)); })
      .finally(() => { if (active) setSettingsLoading(false); });
    return () => { active = false; };
  }, []);

  const check = useCallback(async () => {
    setPhase('checking'); setError(''); setInfo(null); setDownloadPath(''); setProgress(null); setInstallerMessage('');
    try {
      const next = await checkForUpdates();
      setInfo(next);
      setPhase('idle');
      // A failed network check must not throttle the next startup.
      await updateLastCheckTime().catch(() => undefined);
      setSettings(old => ({ ...old, last_check_time: Math.floor(Date.now() / 1000) }));
    } catch (err) {
      setPhase('error'); setError(friendlyError(err));
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialInfo) {
      setInfo(initialInfo);
      return;
    }
    void check();
  }, [check, initialInfo]);

  const savePrefs = async (newValue: UpdateSettings) => {
    const previous = settings;
    setSettings(newValue);
    setSettingsError('');
    try {
      await saveUpdateSettings(newValue);
      toast({ title: '更新偏好已保存' });
    } catch (err) {
      setSettings(previous);
      setSettingsError(friendlyError(err));
    }
  };

  const canDownload = !!info?.has_update && !!info.platform_specific_url && !!info.checksum_sha256;
  const handleDownload = async () => {
    if (!info || !canDownload || busy) return;
    setPhase('downloading'); setError(''); setDownloadPath(''); setProgress(null);
    let stop: (() => void) | undefined;
    try {
      stop = await listenToDownloadProgress(value => setProgress(value));
      const path = await downloadUpdate(info.platform_specific_url!, info.latest_version, info.checksum_sha256!);
      setDownloadPath(path);
      setPhase('ready');
    } catch (err) {
      setError(friendlyError(err));
      setPhase('error');
    } finally {
      stop?.();
    }
  };
  const handleInstall = async () => {
    if (!downloadPath || busy) return;
    setPhase('launching'); setError('');
    try {
      // Always show the OS installer. Starting an installer is NOT equivalent
      // to successful installation; never claim "installed" here.
      const message = await installUpdate(downloadPath, false);
      setInstallerMessage(message);
      setPhase('launched');
    } catch (err) {
      setPhase('error'); setError(friendlyError(err));
    }
  };
  const openRelease = async () => {
    const url = info?.download_url || RELEASES;
    if (!url.startsWith('https://github.com/liao-works/liao-tools/releases')) {
      setError('更新来源地址异常，已拒绝打开。');
      return;
    }
    try {
      await openUrl(url);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return <div className={embedded ? 'lt-update-center lt-update-center--embedded' : 'lt-update-center lt-feature'}>
    {!embedded && <header className="lt-update-page-head">
      <span className="lt-kicker">APPLICATION / UPDATES</span>
      <h1>应用更新</h1>
      <p>检查官方版本、核对下载包完整性，并由系统安装程序完成升级。</p>
    </header>}
    <div className="lt-update-hero">
      <div className="lt-update-summary">
        <span className="lt-kicker">VERSION CENTER</span>
        <h2>{phase === 'checking' ? '正在检查新版本…' :
          info?.has_update ? '发现可用的新版本' :
          info ? '当前已是最新版本' : '保持工具稳定更新'}</h2>
        <p>{info?.has_update ? `Liao Tools ${info.latest_version} 已发布，下载前会核对 GitHub 提供的 SHA-256。` :
          info ? '你可以继续使用当前版本，也可以随时重新检查官方发布。' :
          '建议启用启动时检查：有新版本时提醒，由你确认后再下载安装。'}</p>
        <div className="lt-update-version-pills">
          <span>当前版本 <strong>{info?.current_version || '等待检查'}</strong></span>
          <span>最新版本 <strong>{info?.latest_version || '—'}</strong></span>
        </div>
        <div className="lt-update-action-row">
          <Button onClick={() => void check()} disabled={busy} variant="outline">
            {phase === 'checking' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
            {phase === 'checking' ? '检查中…' : '重新检查'}
          </Button>
          {info?.has_update && canDownload && !downloadPath && <Button onClick={() => void handleDownload()} disabled={busy}>
            <Download className="mr-2 h-4 w-4"/>下载并验证更新
          </Button>}
          {downloadPath && phase !== 'launched' && <Button onClick={() => void handleInstall()} disabled={busy}>
            <PackageCheck className="mr-2 h-4 w-4"/>打开系统安装程序
          </Button>}
          <Button variant="ghost" onClick={openRelease}>
            官方发布页面 <ExternalLink className="ml-2 h-4 w-4"/>
          </Button>
        </div>
      </div>
      <img src="/illustrations/update-scene.svg" alt="" aria-hidden="true"/>
    </div>

    {phase === 'downloading' && <div className="lt-update-progress" role="status" aria-live="polite">
      <div><strong>正在下载官方更新包…</strong><span>{progress ? `${progress.percentage.toFixed(1)}%` : '正在连接…'}</span></div>
      <Progress value={progress?.percentage || 0}/>
      <p>{progress ? `${sizeLabel(progress.downloaded)} / ${sizeLabel(progress.total)}` : '下载完成后自动核验 SHA-256，校验失败不会进入安装。'}</p>
    </div>}
    {phase === 'ready' && <div className="lt-update-status lt-update-status--good" role="status">
      <ShieldCheck size={20}/><div><strong>下载完成，完整性校验通过</strong>
        <p>安装包已验证，现在可以打开系统安装程序。升级完成后可能需要重新启动应用。</p>
      </div></div>}
    {phase === 'launched' && <div className="lt-update-status lt-update-status--good" role="status">
      <CheckCircle2 size={20}/><div><strong>安装包已打开</strong>
        <p>{installerMessage || '请按照系统提示完成升级。启动安装程序不代表升级已经完成。'}</p>
      </div></div>}
    {error && <div className="lt-update-status lt-update-status--error" role="alert">
      <AlertTriangle size={20}/><div><strong>更新操作未完成</strong><p>{error}</p></div>
    </div>}
    {info?.has_update && !canDownload && <div className="lt-update-status lt-update-status--warning" role="status">
      <AlertTriangle size={20}/><div><strong>当前发布暂不支持应用内安全安装</strong>
        <p>{!info.platform_specific_url ? '此版本没有适合当前操作系统和架构的安装包。' :
          '此安装包缺少有效的 SHA-256 元数据，为安全起见只提供官方发布页面。'}</p>
      </div></div>}

    <div className="lt-update-grid">
      <section className="lt-update-panel">
        <div className="lt-update-panel-title"><Clock3 size={18}/><h3>检查更新偏好</h3></div>
        <div className="lt-update-setting-row">
          <div><strong>启动时自动检查更新</strong><p>距离上次成功检查超过设定时间时自动检查；发现新版本后提醒，不自动安装。</p></div>
          <Switch checked={settings.auto_check} disabled={settingsLoading}
            aria-label="启动时自动检查更新"
            onCheckedChange={value => void savePrefs({ ...settings, auto_check: value })}/>
        </div>
        <div className="lt-update-setting-row">
          <div><strong>检查间隔</strong><p>在下一次启动应用时生效。</p></div>
          <Select disabled={settingsLoading || !settings.auto_check}
            value={String(settings.check_interval_hours || 24)}
            onValueChange={value => void savePrefs({ ...settings, check_interval_hours: Number(value) })}>
            <SelectTrigger aria-label="更新检查间隔" className="w-[132px]"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="6">每 6 小时</SelectItem>
              <SelectItem value="12">每 12 小时</SelectItem>
              <SelectItem value="24">每 24 小时</SelectItem>
              <SelectItem value="72">每 3 天</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="lt-update-settings-foot">
          <Settings2 size={15}/> 最近成功检查：
          {settings.last_check_time ? new Date(settings.last_check_time * 1000).toLocaleString('zh-CN') : '暂无记录'}
        </div>
        {settingsError && <p className="lt-update-inline-error" role="alert">{settingsError}</p>}
      </section>
      <section className="lt-update-panel">
        <div className="lt-update-panel-title"><ShieldCheck size={18}/><h3>发布信息与安全校验</h3></div>
        <dl className="lt-update-metadata">
          <div><dt>来源</dt><dd>GitHub 官方 Release</dd></div>
          <div><dt>发布日期</dt><dd>{info?.published_at ? new Date(info.published_at).toLocaleDateString('zh-CN') : '—'}</dd></div>
          <div><dt>安装包大小</dt><dd>{sizeLabel(info?.file_size)}</dd></div>
          <div><dt>SHA-256</dt><dd>{info?.checksum_sha256 ? '可校验 · 已由 GitHub 发布信息提供' : '未提供'}</dd></div>
        </dl>
        <p className="lt-update-security-foot">更新包需要通过完整性校验。应用不会自动运行未知 URL 或第三方安装程序。</p>
      </section>
    </div>
    {info?.has_update && !!info.release_notes && <section className="lt-update-panel lt-update-release-notes">
      <div className="lt-update-panel-title"><ArrowUpRight size={18}/><h3>版本更新说明</h3></div>
      <pre>{info.release_notes}</pre>
    </section>}
  </div>;
}
