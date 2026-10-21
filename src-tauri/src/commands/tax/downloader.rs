use crate::commands::tax::database::TaxDatabase;
use crate::commands::update_history::database::HistoryDatabase;
use crate::commands::update_history::diff::diff_tariffs;
use crate::models::tax::{RemoteMetadata, TaxVersionInfo, VersionDetail};
use anyhow::{anyhow, ensure, Context, Result};
use futures_util::StreamExt;
use md5::Md5;
use sha2::{Digest, Sha256};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Manager;

/// 同时计算 SHA-256 与 MD5 的 Write 适配器：一遍 IO 完成双哈希校验。
struct DualHasher {
    sha256: Sha256,
    md5: Md5,
}

impl DualHasher {
    fn new() -> Self {
        Self { sha256: Sha256::new(), md5: Md5::new() }
    }
}

impl Write for DualHasher {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.sha256.update(buf);
        self.md5.update(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

const METADATA_URL: &str =
    "https://github.com/liao-works/cursor-tax-tools/releases/download/latest-data/metadata.json";
const RELEASE_BASE: &str =
    "https://github.com/liao-works/cursor-tax-tools/releases/download";

/// 单次快照下载的最大尝试次数（含首次）；仅对「无进展的连续失败」计费，
/// 每次尝试有实质推进（≥ PROGRESS_RESET_MIN_BYTES）就重置预算。
const MAX_DOWNLOAD_ATTEMPTS: u32 = 5;
/// 每个流式数据块的最大停滞时间；超过即视为连接已死，触发续传重试。
const CHUNK_STALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(150);
/// 计为「实质推进」的最小新增字节数；防止慢性涓流让重试无限循环。
const PROGRESS_RESET_MIN_BYTES: u64 = 1024 * 1024;
/// 分段并行下载的连接数；弱网单连接吞吐受限，多连接可成倍提速。
const PARALLEL_CONNECTIONS: u64 = 6;
/// 快照不小于该值才启用分段（小文件单连接即可，省去分段管理开销）。
const MIN_SEGMENTED_SIZE: u64 = 16 * 1024 * 1024;
/// 单段最小字节数；决定中等大小文件的分段数。
const MIN_SEGMENT_SIZE: u64 = 4 * 1024 * 1024;

/// 一次下载要取的资产：清单里的 zstd 压缩包，或（旧清单语义下的）原始快照本体。
struct AssetPlan {
    url: String,
    expected_size: u64,
    expected_hex: String,
    /// 可选 MD5 第二重校验值（小写 hex）；清单未提供时为 None
    expected_md5: Option<String>,
    staging: PathBuf,
    compressed: bool,
}

/// 单个资产的下载结论：Installed = staging 已就位并通过终验；
/// AssetUnavailable = 资产本身缺失/损坏（压缩路径可降级原始快照）；
/// Failed = 链路类失败耗尽重试预算（换更大的原始文件重试没有意义）。
enum AssetOutcome {
    Installed,
    AssetUnavailable(anyhow::Error),
    Failed(anyhow::Error),
}

/// 单次请求失败的分类：HTTP 404/410 说明资产本身拿不到（续传无意义），
/// RangeIgnored 说明服务器不支持分段请求（仅分段路径使用，需回退单连接），
/// 其余按可续传处理。
enum AttemptFailure {
    Unavailable(anyhow::Error),
    RangeIgnored(anyhow::Error),
    Retryable(anyhow::Error),
}

impl From<anyhow::Error> for AttemptFailure {
    fn from(error: anyhow::Error) -> Self {
        AttemptFailure::Retryable(error)
    }
}

impl AttemptFailure {
    /// std 错误类型（reqwest::Error / std::io::Error 等）一律按可续传处理。
    fn retryable<E: std::error::Error + Send + Sync + 'static>(error: E) -> Self {
        AttemptFailure::Retryable(anyhow::Error::new(error))
    }
}

/// Install *immutable* release assets. The current public channel stays on latest-data.
/// Future shadow or V2 data MUST NOT use this production installer until promoted.
pub struct TaxDataDownloader;

impl TaxDataDownloader {
    pub async fn check_update(app_handle: &tauri::AppHandle) -> Result<TaxVersionInfo> {
        Self::reconcile_pending_state(app_handle);
        let local = Self::get_local_version(app_handle)?;
        let metadata = Self::fetch_remote_metadata().await?;
        let remote = VersionDetail {
            version: metadata.version.clone(),
            records: metadata.record_count,
            date: metadata.timestamp.split('T').next().unwrap_or("unknown").to_string(),
        };
        Ok(TaxVersionInfo {
            has_update: remote.version != local.version,
            local,
            remote,
            changelog: metadata.changelog.unwrap_or_default(),
            data_changes: metadata.data_changes,
        })
    }

    /// Local availability is NEVER coupled to an HTTP request.
    pub fn local_has_data(app_handle: &tauri::AppHandle) -> Result<bool> {
        let dir = app_handle.path().app_data_dir().context("App data directory")?;
        if !dir.join("tariffs.db").exists() {
            return Ok(false);
        }
        Ok(TaxDatabase::new(app_handle)?.get_record_count()? > 0)
    }

    /// 启动/检查更新时的自愈：
    /// 1) 元数据丢失但备份存在（安装瞬间被杀的窗口）→ 恢复备份；
    /// 2) 数据库丢失但元数据存在 → 移除失效元数据，让界面回到「未下载数据」而非报错版本。
    pub fn reconcile_pending_state(app_handle: &tauri::AppHandle) {
        if let Ok(dir) = app_handle.path().app_data_dir() {
            Self::reconcile_at(&dir);
        }
    }

    fn reconcile_at(dir: &Path) {
        let live_metadata = dir.join("tariffs.db.metadata.json");
        let backup_metadata = dir.join("tariffs.db.metadata.backup.json");
        if !live_metadata.exists() && backup_metadata.exists() {
            if std::fs::rename(&backup_metadata, &live_metadata).is_ok() {
                log::info!("Restored tariff metadata from backup after interrupted install");
            }
        }
        let live_db = dir.join("tariffs.db");
        if !live_db.exists() && live_metadata.exists() {
            let _ = std::fs::remove_file(&live_metadata);
        }
    }

    pub async fn download_and_install<F>(
        app_handle: &tauri::AppHandle,
        mut progress_callback: F,
    ) -> Result<bool>
    where
        F: FnMut(u64, u64),
    {
        // Fetch metadata ONCE, then pin the binary to the versioned Release.
        let metadata = Self::fetch_remote_metadata().await?;
        let dir = app_handle.path().app_data_dir().context("App data directory")?;
        std::fs::create_dir_all(&dir)?;
        let staged_db = Self::download_database(&dir, &metadata, &mut progress_callback).await?;
        Self::validate_database(&staged_db, metadata.record_count)?;

        // Prepare metadata before changing the live DB.
        let staged_metadata = {
            let mut file = tempfile::Builder::new()
                .prefix("tariffs-metadata-").suffix(".tmp")
                .tempfile_in(&dir)?;
            file.write_all(serde_json::to_string_pretty(&metadata)?.as_bytes())?;
            file.as_file_mut().sync_all()?;
            file.into_temp_path()
        };

        let live_db = dir.join("tariffs.db");
        let backup_db = dir.join("tariffs.db.backup");
        let live_metadata = dir.join("tariffs.db.metadata.json");
        let backup_metadata = dir.join("tariffs.db.metadata.backup.json");

        // History is best-effort, but may never alter a downloaded authoritative snapshot.
        let local = Self::get_local_version(app_handle).unwrap_or_else(|_| VersionDetail {
            version: "unknown".into(), records: 0, date: "unknown".into()
        });
        if let Err(err) = Self::record_full_update_diff(
            app_handle, &live_db, &staged_db,
            &local.version, &metadata.version
        ) {
            log::warn!("Cannot store tax update diff: {}", err);
        }

        // On Windows, renaming a staged file over an open target can fail.
        // Move the old target away first, then promote the verified staged DB.
        // Clear both obsolete backups BEFORE touching the live database.
        // A cleanup error must never leave half an upgrade in place.
        if backup_db.exists() {
            std::fs::remove_file(&backup_db)?;
        }
        if backup_metadata.exists() {
            std::fs::remove_file(&backup_metadata)?;
        }
        let had_old_db = live_db.exists();
        if had_old_db {
            std::fs::rename(&live_db, &backup_db)?;
        }
        if let Err(err) = std::fs::rename(&staged_db, &live_db) {
            if had_old_db {
                std::fs::rename(&backup_db, &live_db)
                    .context("Database promotion failed and rollback failed")?;
            }
            return Err(err).context("Unable to promote verified tax database");
        }

        let had_old_metadata = live_metadata.exists();
        let metadata_commit: Result<()> = (|| {
            if had_old_metadata {
                std::fs::rename(&live_metadata, &backup_metadata)?;
            }
            std::fs::rename(staged_metadata.as_ref() as &Path, &live_metadata)?;
            Ok(())
        })();
        if let Err(err) = metadata_commit {
            // All possible failure paths attempt to restore the previous usable pair.
            std::fs::remove_file(&live_db)
                .context("Metadata install failed and new DB could not be removed")?;
            if had_old_db {
                std::fs::rename(&backup_db, &live_db)
                    .context("Metadata install failed and previous DB could not be restored")?;
            }
            if had_old_metadata && backup_metadata.exists() {
                std::fs::rename(&backup_metadata, &live_metadata)
                    .context("Metadata install failed and previous metadata could not be restored")?;
            }
            return Err(err).context("Metadata install failed; old data restored");
        }

        log::info!("Tariff data safely installed: {}", metadata.version);
        // 清理遗留的 staging（含分段下载的 .part 分片）与旧版临时下载文件
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name.starts_with("tariffs.staging-")
                    && (name.ends_with(".db") || name.ends_with(".db.zst") || name.contains(".part"))
                    || name.starts_with("tariffs-download-")
                {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
        Ok(true)
    }

    fn release_url(version: &str) -> Result<String> {
        // No untrusted URL from metadata is executed, and no path traversal possible.
        // Preview releases are intentionally not eligible for live installation.
        let safe_prefix = version.starts_with("data-");
        ensure!(safe_prefix && version.len() <= 110 &&
            version.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'.'),
            "Unexpected tariff release identifier");
        Ok(format!("{}/{}/tariffs.db", RELEASE_BASE, version))
    }

    fn validate_database(path: &Path, expected_rows: i64) -> Result<()> {
        let conn = rusqlite::Connection::open_with_flags(
            path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
        ).context("Opening staged tax snapshot")?;
        let check: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        ensure!(check == "ok", "SQLite integrity_check failed: {}", check);
        let columns: Vec<String> = conn
            .prepare("PRAGMA table_info(tariffs)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for required in ["code", "rate", "url", "north_ireland_rate", "description"] {
            ensure!(columns.iter().any(|col| col == required),
                "Tariff snapshot missing column {}", required);
        }
        let actual: i64 = conn.query_row("SELECT COUNT(*) FROM tariffs", [], |row| row.get(0))?;
        ensure!(actual > 0 && actual == expected_rows,
            "Tax record count mismatch; expected {}, got {}", expected_rows, actual);
        let rated: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tariffs WHERE rate IS NOT NULL AND TRIM(rate) != ''",
            [], |row| row.get(0))?;
        ensure!(rated > 0, "Snapshot contains no populated UK rates");
        Ok(())
    }

    pub fn get_local_version(app_handle: &tauri::AppHandle) -> Result<VersionDetail> {
        let dir = app_handle.path().app_data_dir().context("App data directory")?;
        if !dir.join("tariffs.db").exists() {
            return Ok(VersionDetail {
                version: "none".into(), records: 0, date: "none".into()
            });
        }
        let actual_records = TaxDatabase::new(app_handle)?.get_record_count()?;
        let metadata_path = dir.join("tariffs.db.metadata.json");
        if let Ok(raw) = std::fs::read_to_string(&metadata_path) {
            if let Ok(meta) = serde_json::from_str::<RemoteMetadata>(&raw) {
                return Ok(VersionDetail {
                    version: meta.version,
                    records: actual_records,
                    date: meta.timestamp.split('T').next().unwrap_or("unknown").to_string()
                });
            }
        }
        Ok(VersionDetail {
            version: "unknown".into(), records: actual_records, date: "unknown".into()
        })
    }

    async fn fetch_remote_metadata() -> Result<RemoteMetadata> {
        let client = crate::core::http::apply_system_proxy(
            reqwest::Client::builder().timeout(std::time::Duration::from_secs(30)),
        )
        .build()?;
        let metadata = client.get(METADATA_URL).send().await?
            .error_for_status()?
            .json::<RemoteMetadata>().await?;
        Ok(metadata)
    }

    /// 下载快照到与目标版本绑定的 staging 文件；同名 staging 已存在时发起
    /// Range 续传（服务器不支持分段则整体重下）。清单提供 zstd 压缩资产时
    /// 优先下载压缩包（弱网下传输量只有原始快照的零头）；压缩资产缺失、
    /// 损坏或格式不被识别时，自动降级为原始 tariffs.db 下载，保持对纯 db
    /// 发布形态的兼容。流中断/停滞自动退避续传，且重试预算只对「无进展的
    /// 连续失败」计费。最终以清单的（解压后）大小 + 完整文件 SHA-256 全量
    /// 校验为准，校验通过前绝不进入安装。
    async fn download_database<F>(
        directory: &Path, metadata: &RemoteMetadata, progress: &mut F
    ) -> Result<PathBuf>
    where
        F: FnMut(u64, u64),
    {
        let expected_hex = Self::parse_sha256(metadata.file_hash.as_ref()
            .context("Missing file_hash: refusing unauthenticated snapshot")?)?;
        ensure!(metadata.file_size > 0, "Metadata file_size must be positive");
        let raw_md5 = metadata.file_md5.as_deref().and_then(|value| {
            let parsed = Self::parse_md5(value);
            if parsed.is_none() {
                log::warn!("清单 file_md5 字段异常（{value}），跳过 MD5 第二重校验");
            }
            parsed
        });
        let mut plan = Self::resolve_asset_plan(metadata, directory, &expected_hex)?;
        let staging = directory.join(format!("tariffs.staging-{}.db", metadata.version));

        // A complete tariff snapshot can exceed 400 MB. A five-minute *total*
        // request timeout rejects valid, slowly streaming downloads. Keep a
        // bounded connect timeout, plus an independent idle timeout for each
        // streamed chunk; always enforce the manifest size and SHA-256 below.
        let client = crate::core::http::apply_system_proxy(
            reqwest::Client::builder().connect_timeout(std::time::Duration::from_secs(45)),
        )
        .build()?;

        let outcome = Self::download_plan(
            &client, &plan, &staging, metadata.file_size, &expected_hex, raw_md5.as_deref(), progress,
        ).await;
        let outcome = match outcome {
            AssetOutcome::Installed | AssetOutcome::Failed(_) => outcome,
            AssetOutcome::AssetUnavailable(error) if !plan.compressed => {
                AssetOutcome::Failed(error)
            }
            // 压缩资产不可用（缺失/损坏/格式不识别）：降级为原始 db 下载。
            // 原始快照与压缩资产是独立上传的文件，不受同一份损坏影响。
            AssetOutcome::AssetUnavailable(error) => {
                log::warn!("压缩资产不可用，降级为原始快照下载: {error:#}");
                let _ = std::fs::remove_file(&plan.staging);
                plan = Self::raw_asset_plan(metadata, directory, &expected_hex)?;
                Self::download_plan(
                    &client, &plan, &staging, metadata.file_size, &expected_hex, raw_md5.as_deref(), progress,
                ).await
            }
        };
        match outcome {
            AssetOutcome::Installed => Ok(staging),
            AssetOutcome::Failed(error) | AssetOutcome::AssetUnavailable(error) => {
                // {:#} 保留原因链，数据更新日志里仍能看到最底层错误（如 stream failed）。
                Err(anyhow!("{error:#}"))
            }
        }
    }

    /// 带重试预算的单资产下载：大文件用多连接分段并行（每段独立断点），
    /// 小文件或服务器不支持 Range 时退回单连接顺序下载；流中断/停滞自动
    /// 退避续传，重试预算只对「无进展的连续失败」计费。
    async fn download_plan<F>(
        client: &reqwest::Client,
        plan: &AssetPlan,
        staging: &Path,
        raw_size: u64,
        raw_hex: &str,
        raw_md5: Option<&str>,
        progress: &mut F,
    ) -> AssetOutcome
    where
        F: FnMut(u64, u64),
    {
        let mut failures_without_progress: u32 = 0;
        let mut prev_len: u64 = Self::downloaded_len(plan);
        let mut attempts: u32 = 0;
        let mut last_error: Option<anyhow::Error> = None;
        let mut segmented = Self::should_segment(plan.expected_size);
        loop {
            if failures_without_progress >= MAX_DOWNLOAD_ATTEMPTS {
                break;
            }
            if let Some(error) = last_error.as_ref() {
                let delay = Self::retry_delay(failures_without_progress + 1);
                log::warn!(
                    "税率数据下载第 {} 次尝试失败，{} 秒后从断点续传: {}",
                    attempts,
                    delay.as_secs(),
                    error
                );
                tokio::time::sleep(delay).await;
            }
            attempts += 1;
            let attempt = if segmented {
                Self::download_segmented(client, plan, progress).await
            } else {
                Self::download_asset(client, &plan.url, &plan.staging, plan.expected_size, progress).await
            };
            match attempt {
                Ok(received) if received == plan.expected_size => {
                    // 资产字节完整后的校验/解压属于内容完整性问题，与链路抖动
                    // 无关；压缩路径的资产损坏可降级，原始路径只能报错。
                    return match Self::finalize_snapshot(plan, staging, raw_size, raw_hex, raw_md5) {
                        Ok(()) => AssetOutcome::Installed,
                        Err(error) if plan.compressed => AssetOutcome::AssetUnavailable(error),
                        Err(error) => AssetOutcome::Failed(error),
                    };
                }
                Ok(received) => {
                    // 服务器提前正常关流（截断）：按可续传失败处理。
                    last_error = Some(anyhow!(
                        "连接在下载完成前关闭: received {} expected {}",
                        received, plan.expected_size
                    ));
                }
                Err(AttemptFailure::RangeIgnored(error)) => {
                    // 服务器忽略 Range 返回 200，分段不可行：清理分片，改走单连接
                    log::warn!("服务器不支持分段请求，回退单连接顺序下载: {error:#}");
                    Self::remove_parts(plan);
                    segmented = false;
                    last_error = Some(error);
                }
                Err(AttemptFailure::Unavailable(error)) => {
                    return AssetOutcome::AssetUnavailable(error);
                }
                Err(AttemptFailure::Retryable(error)) => last_error = Some(error),
            }
            let now_len = Self::downloaded_len(plan);
            if now_len >= prev_len.saturating_add(PROGRESS_RESET_MIN_BYTES) {
                log::info!("本次尝试推进了 {} 字节，重置续传重试预算", now_len - prev_len);
                failures_without_progress = 0;
            } else {
                failures_without_progress += 1;
            }
            prev_len = now_len;
        }
        let error = last_error.expect("download attempts recorded no error");
        AssetOutcome::Failed(anyhow!(
            "下载中断，连续 {} 次续传无进展；断点已保留，再次下载将从断点继续: {:#}",
            failures_without_progress, error
        ))
    }

    /// 是否启用分段并行下载。
    fn should_segment(expected_size: u64) -> bool {
        expected_size >= MIN_SEGMENTED_SIZE
    }

    /// 把 [0, total) 切成尽量均匀、首段可多 1 字节的分段（闭区间约定见
    /// 返回值）；段数由 MIN_SEGMENT_SIZE 与 PARALLEL_CONNECTIONS 共同决定。
    fn segment_bounds(total: u64) -> Vec<(u64, u64)> {
        if total == 0 {
            return Vec::new();
        }
        let count = (((total + MIN_SEGMENT_SIZE - 1) / MIN_SEGMENT_SIZE) as usize)
            .min(PARALLEL_CONNECTIONS as usize)
            .min(total as usize);
        let base = total / count as u64;
        let remainder = total % count as u64;
        let mut bounds = Vec::with_capacity(count);
        let mut start = 0u64;
        for index in 0..count {
            let length = base + if (index as u64) < remainder { 1 } else { 0 };
            bounds.push((start, start + length));
            start += length;
        }
        bounds
    }

    /// 第 index 段的分片暂存文件。
    fn part_path(plan: &AssetPlan, index: usize) -> PathBuf {
        let file_name = plan.staging
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "part".to_string());
        plan.staging.with_file_name(format!("{file_name}.part{index}"))
    }

    /// 清理全部分片文件（best-effort）。
    fn remove_parts(plan: &AssetPlan) {
        for index in 0..Self::segment_bounds(plan.expected_size).len() {
            let _ = std::fs::remove_file(Self::part_path(plan, index));
        }
    }

    /// 当前已下载字节数：分段模式为各分片长度之和，单连接模式为 staging 长度。
    fn downloaded_len(plan: &AssetPlan) -> u64 {
        if Self::should_segment(plan.expected_size) {
            Self::segment_bounds(plan.expected_size)
                .iter()
                .enumerate()
                .map(|(index, _)| {
                    std::fs::metadata(Self::part_path(plan, index))
                        .map(|meta| meta.len())
                        .unwrap_or(0)
                })
                .sum()
        } else {
            std::fs::metadata(&plan.staging).map(|meta| meta.len()).unwrap_or(0)
        }
    }

    /// 全部段完成后按序拼接分片为最终 staging，并清理分片。
    /// 任一分片缺失/短缺都报可续传错误，保留现场供重试。
    fn assemble_parts(plan: &AssetPlan) -> Result<()> {
        let mut output = std::fs::OpenOptions::new()
            .write(true).create(true).truncate(true)
            .open(&plan.staging)?;
        for (index, (start, end)) in Self::segment_bounds(plan.expected_size).iter().enumerate() {
            let part = Self::part_path(plan, index);
            let expected = end - start;
            let actual = std::fs::metadata(&part).map(|meta| meta.len()).unwrap_or(0);
            if actual != expected {
                ensure!(actual == 0,
                    "分片 {index} 尺寸异常: {} / {expected}", actual);
                continue; // 空分片（如全新分段）直接跳过
            }
            let mut input = std::fs::File::open(&part)?;
            std::io::copy(&mut input, &mut output)?;
        }
        output.sync_all()?;
        drop(output);
        let assembled = std::fs::metadata(&plan.staging)?.len();
        ensure!(assembled == plan.expected_size,
            "拼接后尺寸异常: {} / {}", assembled, plan.expected_size);
        Self::remove_parts(plan);
        Ok(())
    }

    /// 分段并行下载：每段独立连接 + 独立分片文件（可独立续传），全部段
    /// 完成后拼接。任一段返回致命分类（资产缺失/Range 被忽略）时中止其余
    /// 段；普通失败由调用方的重试预算接管——已完成的段下次零成本跳过。
    async fn download_segmented<F>(
        client: &reqwest::Client,
        plan: &AssetPlan,
        progress: &mut F,
    ) -> Result<u64, AttemptFailure>
    where
        F: FnMut(u64, u64),
    {
        let bounds = Self::segment_bounds(plan.expected_size);
        let total = plan.expected_size;
        let received = Arc::new(std::sync::atomic::AtomicU64::new(Self::downloaded_len(plan)));
        let mut tasks = tokio::task::JoinSet::new();
        for (index, &(start, end)) in bounds.iter().enumerate() {
            let client = client.clone();
            let url = plan.url.clone();
            let part = Self::part_path(plan, index);
            let counter = received.clone();
            tasks.spawn(async move {
                Self::download_segment(&client, &url, &part, start, end, counter).await
            });
        }

        let mut mode_failure: Option<AttemptFailure> = None;
        let mut retryable_error: Option<anyhow::Error> = None;
        let mut pump = tokio::time::interval(std::time::Duration::from_millis(200));
        pump.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        while !tasks.is_empty() {
            tokio::select! {
                _ = pump.tick() => {
                    progress(received.load(std::sync::atomic::Ordering::Relaxed), total);
                }
                joined = tasks.join_next() => {
                    // 循环顶部已保证非空，join_next 不会返回 None
                    let joined = joined.context("分片任务意外缺失")?;
                    let outcome = match joined {
                        Ok(outcome) => outcome,
                        Err(join_error) if join_error.is_cancelled() => {
                            continue; // 模式级失败后主动中止的其余段
                        }
                        Err(join_error) => {
                            Err(AttemptFailure::Retryable(anyhow!("分片任务异常退出: {join_error}")))
                        }
                    };
                    match outcome {
                        Ok(()) => {}
                        Err(AttemptFailure::Retryable(error)) => {
                            retryable_error.get_or_insert(error);
                        }
                        Err(failure @ (AttemptFailure::Unavailable(_)
                            | AttemptFailure::RangeIgnored(_))) => {
                            // 模式级失败：其余段的连接已无意义，立即中止
                            mode_failure.get_or_insert(failure);
                            tasks.abort_all();
                        }
                    }
                }
            }
        }
        progress(received.load(std::sync::atomic::Ordering::Relaxed), total);
        if let Some(failure) = mode_failure {
            return Err(failure);
        }
        match retryable_error {
            Some(error) => Err(AttemptFailure::Retryable(error)),
            None => {
                Self::assemble_parts(plan).map_err(AttemptFailure::from)?;
                Ok(total)
            }
        }
    }

    /// 下载单个分段到其分片文件：从分片现有长度续传，显式带上段末界，
    /// 服务器必须返回 206；写满段长即完成。
    async fn download_segment(
        client: &reqwest::Client,
        url: &str,
        part: &Path,
        start: u64,
        end: u64,
        received: Arc<std::sync::atomic::AtomicU64>,
    ) -> Result<(), AttemptFailure> {
        let segment_size = end - start;
        let resume_from: u64 = std::fs::metadata(part)
            .map(|meta| meta.len())
            .unwrap_or(0);
        if resume_from >= segment_size {
            return Ok(()); // 之前尝试已完成
        }
        // 注意：续传起点已计入 download_segmented 的初始计数器，这里不再累加
        let mut request = client.get(url);
        request = request.header(reqwest::header::RANGE,
            format!("bytes={}-{}", start + resume_from, end - 1));
        let response = request.send().await.map_err(AttemptFailure::retryable)?;
        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND || status == reqwest::StatusCode::GONE {
            return Err(AttemptFailure::Unavailable(anyhow!(
                "资产不存在: HTTP {status}"
            )));
        }
        if status != reqwest::StatusCode::PARTIAL_CONTENT {
            // 典型情形：服务器忽略 Range 返回 200，内容起点与本段不符
            return Err(AttemptFailure::RangeIgnored(anyhow!(
                "分段请求未返回 206: HTTP {status}"
            )));
        }
        let mut file = std::fs::OpenOptions::new()
            .write(true).create(true)
            .truncate(resume_from == 0)
            .open(part).map_err(AttemptFailure::retryable)?;
        file.seek(SeekFrom::Start(resume_from)).map_err(AttemptFailure::retryable)?;
        let mut stream = response.bytes_stream();
        let mut written = resume_from;
        loop {
            let chunk = match tokio::time::timeout(CHUNK_STALL_TIMEOUT, stream.next()).await {
                Ok(Some(chunk)) => chunk
                    .map_err(|error| AttemptFailure::Retryable(
                        anyhow::Error::new(error).context("Download stream failed")
                    ))?,
                Ok(None) => break,
                Err(_elapsed) => return Err(AttemptFailure::Retryable(anyhow!(
                    "分片下载停滞超过 150 秒"
                ))),
            };
            if written + chunk.len() as u64 > segment_size {
                return Err(AttemptFailure::Retryable(anyhow!(
                    "分片内容超出段长（Range 未按请求截取）"
                )));
            }
            file.write_all(&chunk).map_err(AttemptFailure::retryable)?;
            written += chunk.len() as u64;
            received.fetch_add(chunk.len() as u64, std::sync::atomic::Ordering::Relaxed);
        }
        file.sync_all().map_err(AttemptFailure::retryable)?;
        drop(file);
        if written != segment_size {
            return Err(AttemptFailure::Retryable(anyhow!(
                "分片不完整: {written} / {segment_size}"
            )));
        }
        Ok(())
    }

    /// "sha256:<64 位 hex>" → 归一化小写 hex；顺带完成格式校验。
    fn parse_sha256(value: &str) -> Result<String> {
        let hex = value.strip_prefix("sha256:").context("Unsupported checksum algorithm")?;
        ensure!(hex.len() == 64 &&
            hex.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "Invalid snapshot SHA-256 value");
        Ok(hex.to_ascii_lowercase())
    }

    /// "md5:<32 位 hex>" → 归一化小写 hex；格式异常返回 None（辅助校验，
    /// 只告警不阻断）。
    fn parse_md5(value: &str) -> Option<String> {
        let hex = value.strip_prefix("md5:")?;
        if hex.len() != 32 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        Some(hex.to_ascii_lowercase())
    }

    /// 决定本次要下载的资产：清单带 zstd 压缩块则取压缩包；格式不被识别
    /// 或压缩块字段异常时**降级原始快照**（保证对纯 db 发布形态的兼容），
    /// 只有版本号本身非法才报错。
    fn resolve_asset_plan(
        metadata: &RemoteMetadata, directory: &Path, raw_hex: &str,
    ) -> Result<AssetPlan> {
        match metadata.compressed.as_ref() {
            Some(compressed) if compressed.format == "zstd" => {
                let expected_hex = match Self::parse_sha256(&compressed.file_hash) {
                    Ok(hex) => hex,
                    Err(error) => {
                        log::warn!("压缩资产哈希字段异常，回退原始快照下载: {error:#}");
                        return Self::raw_asset_plan(metadata, directory, raw_hex);
                    }
                };
                if compressed.file_size == 0 {
                    log::warn!("压缩资产 file_size 为 0，回退原始快照下载");
                    return Self::raw_asset_plan(metadata, directory, raw_hex);
                }
                let asset = compressed.asset.as_str();
                // 资产名拼进下载 URL，校验字符集防止路径穿越（与 release_url 同级防线）
                if asset.is_empty() || asset.len() > 110 ||
                    !asset.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
                {
                    log::warn!("压缩资产名称异常（{asset}），回退原始快照下载");
                    return Self::raw_asset_plan(metadata, directory, raw_hex);
                }
                let expected_md5 = compressed.md5.as_deref().and_then(|value| {
                    let parsed = Self::parse_md5(value);
                    if parsed.is_none() {
                        log::warn!("压缩资产 md5 字段异常（{value}），跳过 MD5 第二重校验");
                    }
                    parsed
                });
                Ok(AssetPlan {
                    url: format!("{}/{}/{}", RELEASE_BASE, metadata.version, asset),
                    expected_size: compressed.file_size,
                    expected_hex,
                    expected_md5,
                    staging: directory.join(format!("tariffs.staging-{}.db.zst", metadata.version)),
                    compressed: true,
                })
            }
            Some(other) => {
                log::warn!(
                    "清单使用了不支持的压缩格式（{}），回退原始快照下载",
                    other.format
                );
                Self::raw_asset_plan(metadata, directory, raw_hex)
            }
            None => Self::raw_asset_plan(metadata, directory, raw_hex),
        }
    }

    /// 旧清单语义：直接下载原始 tariffs.db。
    fn raw_asset_plan(
        metadata: &RemoteMetadata, directory: &Path, raw_hex: &str,
    ) -> Result<AssetPlan> {
        Ok(AssetPlan {
            url: Self::release_url(&metadata.version)?,
            expected_size: metadata.file_size,
            expected_hex: raw_hex.to_string(),
            expected_md5: metadata.file_md5.as_deref().and_then(Self::parse_md5),
            staging: directory.join(format!("tariffs.staging-{}.db", metadata.version)),
            compressed: false,
        })
    }

    /// 资产字节完整后的本地收尾：压缩资产先验自身哈希（尽早暴露传输损坏），
    /// 流式解压到最终 staging，再对（解压后的）快照做尺寸 + SHA-256 + MD5
    /// 终验。任一校验失败都会清掉 staging 内容——绝不让坏数据以「尺寸完整」
    /// 的假象留存。只涉及本地 IO，可单元测试。
    fn finalize_snapshot(
        plan: &AssetPlan, staging: &Path, raw_size: u64, raw_hex: &str, raw_md5: Option<&str>,
    ) -> Result<()> {
        if plan.compressed {
            Self::verify_file(&plan.staging, plan.expected_size, &plan.expected_hex,
                plan.expected_md5.as_deref())
                .context("Compressed asset verification failed")?;
            {
                let input = std::io::BufReader::new(std::fs::File::open(&plan.staging)?);
                let mut output = std::io::BufWriter::new(std::fs::OpenOptions::new()
                    .write(true).create(true).truncate(true).open(staging)?);
                zstd::stream::copy_decode(input, &mut output)
                    .context("Zstd decompression failed")?;
                output.flush()?;
            }
            let _ = std::fs::remove_file(&plan.staging);
        }
        let verified = Self::verify_file(staging, raw_size, raw_hex, raw_md5);
        if verified.is_err() {
            let _ = std::fs::remove_file(staging);
        }
        verified
    }

    /// 单文件的尺寸 + SHA-256 + 可选 MD5 校验（双哈希一遍 IO 完成）。
    fn verify_file(
        path: &Path, expected_size: u64, expected_hex: &str, expected_md5: Option<&str>,
    ) -> Result<()> {
        let actual_size = std::fs::metadata(path)?.len();
        ensure!(actual_size == expected_size,
            "Snapshot size mismatch: received {} expected {}", actual_size, expected_size);
        let mut file = std::fs::File::open(path)?;
        let mut hasher = DualHasher::new();
        std::io::copy(&mut file, &mut hasher)?;
        let sha256 = format!("{:x}", hasher.sha256.finalize());
        ensure!(sha256.eq_ignore_ascii_case(expected_hex),
            "Snapshot SHA-256 mismatch: refusing installation");
        if let Some(expected) = expected_md5 {
            let md5 = format!("{:x}", hasher.md5.finalize());
            ensure!(md5.eq_ignore_ascii_case(expected),
                "Snapshot MD5 mismatch: refusing installation");
        }
        Ok(())
    }

    /// 第 next_attempt（2 起）次尝试前的退避间隔：3s、6s、12s、24s。
    fn retry_delay(next_attempt: u32) -> std::time::Duration {
        std::time::Duration::from_secs(3 * (1u64 << (next_attempt - 2).min(4)))
    }

    /// 单次资产下载尝试：按 staging 现状发起请求（有半成品就带 Range 续传），
    /// 流式写入直到服务器正常关流，返回累计偏移。HTTP 状态异常返回
    /// `Unavailable`（资产本身拿不到，续传没有意义），其余失败按可续传处理；
    /// staging 内容在异常退出时仍然有效（追加写入）。
    async fn download_asset<F>(
        client: &reqwest::Client,
        url: &str,
        staging: &Path,
        expected_size: u64,
        progress: &mut F,
    ) -> Result<u64, AttemptFailure>
    where
        F: FnMut(u64, u64),
    {
        // 每次尝试都从 staging 实际长度出发：既覆盖上一次应用运行留下的半成品，
        // 也覆盖本次的重试（包括上一块只写了一部分的情况）。
        let mut resume_from: u64 = 0;
        match std::fs::metadata(staging) {
            Ok(existing) if existing.len() < expected_size => resume_from = existing.len(),
            _ => { let _ = std::fs::remove_file(staging); }
        }

        let mut request = client.get(url);
        if resume_from > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={resume_from}-"));
        }
        let response = request.send().await.map_err(AttemptFailure::retryable)?;
        let status = response.status();
        // 只有「资产确实不存在」（404/410，如发布端漏传 .zst）才立即判定
        // 不可用；5xx/429 等瞬时错误仍走续传重试，避免抖动触发大文件降级
        if status == reqwest::StatusCode::NOT_FOUND || status == reqwest::StatusCode::GONE {
            return Err(AttemptFailure::Unavailable(anyhow!(
                "资产不存在: HTTP {status}"
            )));
        }
        if !(status.is_success() || status == reqwest::StatusCode::PARTIAL_CONTENT) {
            return Err(AttemptFailure::Retryable(anyhow!(
                "资产请求被拒绝: HTTP {status}"
            )));
        }
        // 服务器忽略 Range 返回 200 时只能整体重下
        let resuming = resume_from > 0 && status == reqwest::StatusCode::PARTIAL_CONTENT;
        if !resuming {
            resume_from = 0;
            let _ = std::fs::remove_file(staging);
        }

        let total = response.content_length()
            .map(|len| len + resume_from)
            .unwrap_or(expected_size);
        let mut received: u64 = resume_from;
        let mut file = std::fs::OpenOptions::new()
            .write(true).create(true).truncate(false)
            .open(staging).map_err(AttemptFailure::retryable)?;
        file.seek(SeekFrom::Start(resume_from)).map_err(AttemptFailure::retryable)?;
        if resuming {
            progress(received, total);
        }
        let mut stream = response.bytes_stream();
        loop {
            let chunk = match tokio::time::timeout(CHUNK_STALL_TIMEOUT, stream.next()).await {
                Ok(Some(chunk)) => chunk
                    .map_err(|error| AttemptFailure::Retryable(
                        anyhow::Error::new(error).context("Download stream failed")
                    ))?,
                Ok(None) => break,
                Err(_elapsed) => return Err(AttemptFailure::Retryable(anyhow!(
                    "Tariff data download stalled for 150 seconds"
                ))),
            };
            received += chunk.len() as u64;
            if received > expected_size {
                return Err(AttemptFailure::Retryable(anyhow!(
                    "Snapshot larger than manifest"
                )));
            }
            file.write_all(&chunk).map_err(AttemptFailure::retryable)?;
            progress(received, total);
        }
        file.sync_all().map_err(AttemptFailure::retryable)?;
        drop(file);
        Ok(received)
    }

    fn record_full_update_diff(
        app_handle: &tauri::AppHandle,
        old_db_path: &Path, new_db_path: &Path, from: &str, to: &str
    ) -> Result<()> {
        let old = if old_db_path.exists() {
            TaxDatabase::read_all_from_path(old_db_path).unwrap_or_default()
        } else {
            Vec::new()
        };
        let new = TaxDatabase::read_all_from_path(new_db_path)?;
        let session_id = uuid::Uuid::new_v4().to_string();
        let records = diff_tariffs(&old, &new, &session_id, Some(from), Some(to));
        let db = HistoryDatabase::new(app_handle)?;
        db.insert_changes(&records)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 与 testdata/snapshot-fixture.db.zst 一一对应的校验值；
    /// 由 testdata/make_fixture.py 生成（zstd level 15）。
    const FIXTURE_RAW_SIZE: u64 = 344553;
    const FIXTURE_RAW_HASH: &str = "0b7f1ef8e191433499521dc1d64540f7338360a6b924492e1cedc15910c02c8d";
    const FIXTURE_RAW_MD5: &str = "37780cc743d6c22a1539a7413d5241da";
    const FIXTURE_ZST_SIZE: u64 = 24911;
    const FIXTURE_ZST_HASH: &str = "d8628d4944837bc4c76e28c1ff98725827ae67bb0e57b507b55f02baa558b493";
    const FIXTURE_ZST_MD5: &str = "dfc2330c1b0804c8be4458fcddc73508";

    fn test_metadata(file_hash: &str, compressed: Option<crate::models::tax::CompressedAsset>) -> RemoteMetadata {
        RemoteMetadata {
            version: "data-36851279616".into(),
            timestamp: "2026-10-21T00:00:00Z".into(),
            last_modified: "2026-10-21T00:00:00Z".into(),
            file_size: FIXTURE_RAW_SIZE,
            file_hash: Some(file_hash.into()),
            file_md5: Some(format!("md5:{FIXTURE_RAW_MD5}")),
            record_count: 1,
            download_urls: crate::models::tax::DownloadUrls {
                primary: String::new(),
                metadata: String::new(),
                mirror: Vec::new(),
            },
            compressed,
            changelog: None,
            data_changes: None,
        }
    }

    fn compressed_block() -> crate::models::tax::CompressedAsset {
        crate::models::tax::CompressedAsset {
            format: "zstd".into(),
            asset: "tariffs.db.zst".into(),
            file_size: FIXTURE_ZST_SIZE,
            file_hash: format!("sha256:{FIXTURE_ZST_HASH}"),
            md5: Some(format!("md5:{FIXTURE_ZST_MD5}")),
        }
    }

    #[test]
    fn resolve_plan_prefers_compressed_asset() {
        let metadata = test_metadata(
            &format!("sha256:{FIXTURE_RAW_HASH}"),
            Some(compressed_block()),
        );
        let dir = tempfile::tempdir().unwrap();
        let plan = TaxDataDownloader::resolve_asset_plan(&metadata, dir.path(), FIXTURE_RAW_HASH).unwrap();
        assert!(plan.compressed);
        assert_eq!(plan.expected_size, FIXTURE_ZST_SIZE);
        assert_eq!(plan.expected_hex, FIXTURE_ZST_HASH);
        assert_eq!(plan.expected_md5.as_deref(), Some(FIXTURE_ZST_MD5));
        assert!(plan.url.ends_with("/data-36851279616/tariffs.db.zst"));
        assert!(plan.staging.to_string_lossy().ends_with(".db.zst"));
    }

    #[test]
    fn resolve_plan_carries_raw_md5_without_compression() {
        let metadata = test_metadata(&format!("sha256:{FIXTURE_RAW_HASH}"), None);
        let dir = tempfile::tempdir().unwrap();
        let plan = TaxDataDownloader::resolve_asset_plan(&metadata, dir.path(), FIXTURE_RAW_HASH).unwrap();
        assert_eq!(plan.expected_md5.as_deref(), Some(FIXTURE_RAW_MD5));
    }

    #[test]
    fn should_segment_gates_small_files() {
        assert!(!TaxDataDownloader::should_segment(MIN_SEGMENTED_SIZE - 1));
        assert!(TaxDataDownloader::should_segment(MIN_SEGMENTED_SIZE));
        assert!(TaxDataDownloader::should_segment(400 * 1024 * 1024));
    }

    #[test]
    fn segment_bounds_partition_exactly() {
        // 精确整除、有余数、不足一段、刚好一整段等多种形态
        for total in [1u64, 4 * 1024 * 1024, 17 * 1024 * 1024 + 7,
            100 * 1024 * 1024, 400 * 1024 * 1024 + 123, MIN_SEGMENTED_SIZE] {
            let bounds = TaxDataDownloader::segment_bounds(total);
            assert!(!bounds.is_empty());
            // 无缝衔接且覆盖 [0, total)
            assert_eq!(bounds.first().unwrap().0, 0);
            assert_eq!(bounds.last().unwrap().1, total);
            for pair in bounds.windows(2) {
                assert_eq!(pair[0].1, pair[1].0, "total={total}");
            }
            let covered: u64 = bounds.iter().map(|(start, end)| end - start).sum();
            assert_eq!(covered, total, "total={total}");
            // 段数上限与最小段长约束
            assert!(bounds.len() <= PARALLEL_CONNECTIONS as usize, "total={total}");
        }
        assert!(TaxDataDownloader::segment_bounds(0).is_empty());
        // 大文件应正好用满连接数
        assert_eq!(TaxDataDownloader::segment_bounds(400 * 1024 * 1024).len(),
            PARALLEL_CONNECTIONS as usize);
    }

    fn segmented_test_plan(dir: &tempfile::TempDir, size: u64) -> AssetPlan {
        AssetPlan {
            url: "https://example.invalid/tariffs.db.zst".into(),
            expected_size: size,
            expected_hex: FIXTURE_ZST_HASH.into(),
            expected_md5: None,
            staging: dir.path().join("tariffs.staging-test.db.zst"),
            compressed: true,
        }
    }

    #[test]
    fn assemble_parts_joins_segments_and_cleans_up() {
        let dir = tempfile::tempdir().unwrap();
        let total = 10 * 1024 * 1024; // 10MB → 3 段（4/4/2）
        let plan = segmented_test_plan(&dir, total);
        let bounds = TaxDataDownloader::segment_bounds(total);
        // 各分片写入确定性内容：第 i 段全部填 i 对应的字节
        let mut expected = Vec::with_capacity(total as usize);
        for (index, (start, end)) in bounds.iter().enumerate() {
            let part = TaxDataDownloader::part_path(&plan, index);
            let body = vec![index as u8 + 1; (end - start) as usize];
            std::fs::write(&part, &body).unwrap();
            expected.extend_from_slice(&body);
        }
        TaxDataDownloader::assemble_parts(&plan).unwrap();
        assert_eq!(std::fs::read(&plan.staging).unwrap(), expected);
        for index in 0..bounds.len() {
            assert!(!TaxDataDownloader::part_path(&plan, index).exists());
        }
    }

    #[test]
    fn assemble_parts_rejects_short_segment_without_consuming_parts() {
        let dir = tempfile::tempdir().unwrap();
        let total = 10 * 1024 * 1024;
        let plan = segmented_test_plan(&dir, total);
        let bounds = TaxDataDownloader::segment_bounds(total);
        for (index, (start, end)) in bounds.iter().enumerate() {
            let body = vec![index as u8 + 1; (end - start) as usize];
            std::fs::write(TaxDataDownloader::part_path(&plan, index), &body).unwrap();
        }
        // 截短第 2 段 → 拼接必须失败且分片保留（供下次续传）
        std::fs::write(TaxDataDownloader::part_path(&plan, 1), b"short").unwrap();
        assert!(TaxDataDownloader::assemble_parts(&plan).is_err());
        assert!(TaxDataDownloader::part_path(&plan, 0).exists());
        assert!(TaxDataDownloader::part_path(&plan, 1).exists());
    }

    #[test]
    fn downloaded_len_counts_parts_then_staging() {
        let dir = tempfile::tempdir().unwrap();
        let total = MIN_SEGMENTED_SIZE; // 16MB（门槛上）→ 4 段分段模式
        let plan = segmented_test_plan(&dir, total);
        assert_eq!(TaxDataDownloader::downloaded_len(&plan), 0);
        std::fs::write(TaxDataDownloader::part_path(&plan, 0), vec![0u8; 1024]).unwrap();
        std::fs::write(TaxDataDownloader::part_path(&plan, 2), vec![0u8; 512]).unwrap();
        assert_eq!(TaxDataDownloader::downloaded_len(&plan), 1024 + 512);
        // 小文件走单连接口径：看 staging 长度
        let small = segmented_test_plan(&dir, 1024);
        assert_eq!(TaxDataDownloader::downloaded_len(&small), 0);
        std::fs::write(&small.staging, vec![0u8; 256]).unwrap();
        assert_eq!(TaxDataDownloader::downloaded_len(&small), 256);
    }

    #[test]
    fn resolve_plan_degrades_unknown_compression_to_raw() {
        let metadata = test_metadata(
            &format!("sha256:{FIXTURE_RAW_HASH}"),
            Some(crate::models::tax::CompressedAsset {
                format: "rar".into(),
                asset: "tariffs.db.rar".into(),
                file_size: 1,
                file_hash: format!("sha256:{FIXTURE_ZST_HASH}"),
                md5: None,
            }),
        );
        let dir = tempfile::tempdir().unwrap();
        let plan = TaxDataDownloader::resolve_asset_plan(&metadata, dir.path(), FIXTURE_RAW_HASH).unwrap();
        // 未来格式 + 旧客户端：必须兼容纯 db 发布形态，回退原始快照
        assert!(!plan.compressed);
        assert_eq!(plan.expected_size, FIXTURE_RAW_SIZE);
        assert!(plan.url.ends_with("/tariffs.db"));
    }

    #[test]
    fn resolve_plan_degrades_bad_asset_name_to_raw() {
        let metadata = test_metadata(
            &format!("sha256:{FIXTURE_RAW_HASH}"),
            Some(crate::models::tax::CompressedAsset {
                format: "zstd".into(),
                asset: "../latest-data/tariffs.db.zst".into(),
                file_size: FIXTURE_ZST_SIZE,
                file_hash: format!("sha256:{FIXTURE_ZST_HASH}"),
                md5: None,
            }),
        );
        let dir = tempfile::tempdir().unwrap();
        let plan = TaxDataDownloader::resolve_asset_plan(&metadata, dir.path(), FIXTURE_RAW_HASH).unwrap();
        // 路径穿越类资产名不可信：降级原始快照而不是拼进 URL
        assert!(!plan.compressed);
        assert!(plan.url.ends_with("/tariffs.db"));
    }

    #[test]
    fn resolve_plan_degrades_broken_compressed_block_to_raw() {
        let metadata = test_metadata(
            &format!("sha256:{FIXTURE_RAW_HASH}"),
            Some(crate::models::tax::CompressedAsset {
                format: "zstd".into(),
                asset: "tariffs.db.zst".into(),
                file_size: 0,
                file_hash: "not-a-hash".into(),
                md5: None,
            }),
        );
        let dir = tempfile::tempdir().unwrap();
        let plan = TaxDataDownloader::resolve_asset_plan(&metadata, dir.path(), FIXTURE_RAW_HASH).unwrap();
        assert!(!plan.compressed);
        assert_eq!(plan.expected_size, FIXTURE_RAW_SIZE);
    }

    #[test]
    fn resolve_plan_falls_back_to_raw_snapshot() {
        let metadata = test_metadata(&format!("sha256:{FIXTURE_RAW_HASH}"), None);
        let dir = tempfile::tempdir().unwrap();
        let plan = TaxDataDownloader::resolve_asset_plan(&metadata, dir.path(), FIXTURE_RAW_HASH).unwrap();
        assert!(!plan.compressed);
        assert_eq!(plan.expected_size, FIXTURE_RAW_SIZE);
        assert_eq!(plan.expected_hex, FIXTURE_RAW_HASH);
        assert!(plan.url.ends_with("/tariffs.db"));
        assert!(plan.staging.to_string_lossy().ends_with(".db"));
    }

    #[test]
    fn finalize_installs_decompressed_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let zst_path = dir.path().join("snapshot.db.zst");
        let staging = dir.path().join("snapshot.db");
        std::fs::write(&zst_path, include_bytes!("testdata/snapshot-fixture.db.zst")).unwrap();
        let plan = AssetPlan {
            url: String::new(),
            expected_size: FIXTURE_ZST_SIZE,
            expected_hex: FIXTURE_ZST_HASH.into(),
            expected_md5: Some(FIXTURE_ZST_MD5.into()),
            staging: zst_path,
            compressed: true,
        };
        TaxDataDownloader::finalize_snapshot(&plan, &staging, FIXTURE_RAW_SIZE, FIXTURE_RAW_HASH,
            Some(FIXTURE_RAW_MD5)).unwrap();
        assert_eq!(std::fs::metadata(&staging).unwrap().len(), FIXTURE_RAW_SIZE);
        // 解压完成的压缩包随即清理
        assert!(!plan.staging.exists());
    }

    #[test]
    fn finalize_rejects_corrupt_compressed_asset() {
        let dir = tempfile::tempdir().unwrap();
        let zst_path = dir.path().join("snapshot.db.zst");
        let staging = dir.path().join("snapshot.db");
        // 篡改一个字节：资产校验（尺寸/哈希）在此处暴露
        let mut blob = include_bytes!("testdata/snapshot-fixture.db.zst").to_vec();
        blob[100] ^= 0xff;
        std::fs::write(&zst_path, &blob).unwrap();
        let plan = AssetPlan {
            url: String::new(),
            expected_size: FIXTURE_ZST_SIZE,
            expected_hex: FIXTURE_ZST_HASH.into(),
            expected_md5: Some(FIXTURE_ZST_MD5.into()),
            staging: zst_path,
            compressed: true,
        };
        assert!(TaxDataDownloader::finalize_snapshot(&plan, &staging, FIXTURE_RAW_SIZE, FIXTURE_RAW_HASH,
            Some(FIXTURE_RAW_MD5)).is_err());
        // 绝不让未通过校验的内容以正确尺寸假象留下
        assert!(!staging.exists() || std::fs::metadata(&staging).unwrap().len() != FIXTURE_RAW_SIZE);
    }

    #[test]
    fn finalize_verifies_uncompressed_snapshot_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let staging = dir.path().join("snapshot.db");
        let raw = zstd::stream::decode_all(include_bytes!("testdata/snapshot-fixture.db.zst").as_slice()).unwrap();
        std::fs::write(&staging, &raw).unwrap();
        let plan = AssetPlan {
            url: String::new(),
            expected_size: raw.len() as u64,
            expected_hex: FIXTURE_RAW_HASH.into(),
            expected_md5: Some(FIXTURE_RAW_MD5.into()),
            staging: staging.clone(),
            compressed: false,
        };
        TaxDataDownloader::finalize_snapshot(&plan, &staging, raw.len() as u64, FIXTURE_RAW_HASH,
            Some(FIXTURE_RAW_MD5)).unwrap();

        // 校验失败会清掉 staging，每条破坏性断言前都要重写
        let refresh = |path: &Path| std::fs::write(path, &raw).unwrap();
        refresh(&staging);
        // 尺寸不符必须拒绝
        assert!(TaxDataDownloader::finalize_snapshot(&plan, &staging, raw.len() as u64 + 1, FIXTURE_RAW_HASH,
            Some(FIXTURE_RAW_MD5)).is_err());
        refresh(&staging);
        // SHA-256 不符必须拒绝
        let wrong = "0".repeat(64);
        assert!(TaxDataDownloader::finalize_snapshot(&plan, &staging, raw.len() as u64, &wrong,
            Some(FIXTURE_RAW_MD5)).is_err());
        refresh(&staging);
        // MD5 不符必须拒绝（即使 SHA-256 通过）
        assert!(TaxDataDownloader::finalize_snapshot(&plan, &staging, raw.len() as u64, FIXTURE_RAW_HASH,
            Some(&"0".repeat(32))).is_err());
        refresh(&staging);
        // MD5 缺席时仅 SHA-256 生效（兼容不带 md5 字段的旧清单）
        TaxDataDownloader::finalize_snapshot(&plan, &staging, raw.len() as u64, FIXTURE_RAW_HASH, None).unwrap();
        refresh(&staging);
        // 清单 MD5 与文件不一致且内容被换：错误信息应指向 MD5
        let err = TaxDataDownloader::finalize_snapshot(&plan, &staging, raw.len() as u64, FIXTURE_RAW_HASH,
            Some(&"f".repeat(32))).unwrap_err().to_string();
        assert!(err.contains("MD5"), "unexpected error: {err}");
    }

    #[test]
    fn retry_delay_grows_to_capped_backoff() {
        assert_eq!(TaxDataDownloader::retry_delay(2), std::time::Duration::from_secs(3));
        assert_eq!(TaxDataDownloader::retry_delay(3), std::time::Duration::from_secs(6));
        assert_eq!(TaxDataDownloader::retry_delay(4), std::time::Duration::from_secs(12));
        assert_eq!(TaxDataDownloader::retry_delay(5), std::time::Duration::from_secs(24));
        assert_eq!(TaxDataDownloader::retry_delay(99), std::time::Duration::from_secs(48));
    }

    #[test]
    fn reject_unsafe_release_identifiers() {
        assert!(TaxDataDownloader::release_url("data-36851279616").is_ok());
        assert!(TaxDataDownloader::release_url("../latest-data").is_err());
        assert!(TaxDataDownloader::release_url("target-duty-test-001").is_err());
        assert!(TaxDataDownloader::release_url("https://evil.example").is_err());
    }

    #[test]
    fn reject_wrong_schema_even_for_valid_sqlite() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let db = rusqlite::Connection::open(file.path()).unwrap();
        db.execute("CREATE TABLE other (code TEXT)", []).unwrap();
        drop(db);
        assert!(TaxDataDownloader::validate_database(file.path(), 1).is_err());
    }

    #[test]
    fn reconcile_restores_metadata_backup_when_live_missing() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("tariffs.db.metadata.backup.json"), "{}").unwrap();
        std::fs::File::create(dir.path().join("tariffs.db")).unwrap();
        TaxDataDownloader::reconcile_at(dir.path());
        assert!(dir.path().join("tariffs.db.metadata.json").exists());
        assert!(!dir.path().join("tariffs.db.metadata.backup.json").exists());
    }

    #[test]
    fn reconcile_drops_metadata_when_db_missing() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("tariffs.db.metadata.json"), "{}").unwrap();
        TaxDataDownloader::reconcile_at(dir.path());
        assert!(!dir.path().join("tariffs.db.metadata.json").exists());
    }

    #[test]
    fn reconcile_keeps_intact_pair() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::File::create(dir.path().join("tariffs.db")).unwrap();
        std::fs::write(dir.path().join("tariffs.db.metadata.json"), "{}").unwrap();
        std::fs::write(dir.path().join("tariffs.db.metadata.backup.json"), "{}").unwrap();
        TaxDataDownloader::reconcile_at(dir.path());
        // 成对的库与元数据保持原样，遗留备份不误删（留给下次安装前清理）
        assert!(dir.path().join("tariffs.db.metadata.json").exists());
    }
}
