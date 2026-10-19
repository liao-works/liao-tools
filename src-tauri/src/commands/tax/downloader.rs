use crate::commands::tax::database::TaxDatabase;
use crate::commands::update_history::database::HistoryDatabase;
use crate::commands::update_history::diff::diff_tariffs;
use crate::models::tax::{RemoteMetadata, TaxVersionInfo, VersionDetail};
use anyhow::{ensure, Context, Result};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

const METADATA_URL: &str =
    "https://github.com/liao-works/cursor-tax-tools/releases/download/latest-data/metadata.json";
const RELEASE_BASE: &str =
    "https://github.com/liao-works/cursor-tax-tools/releases/download";

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
        // 清理遗留的 staging 与旧版临时下载文件（当前 staging 已被晋升走）
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if (name.starts_with("tariffs.staging-") && name.ends_with(".db"))
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
    /// Range 续传（服务器不支持分段则整体重下）。最终仍以清单大小 + SHA-256
    /// 全量校验为准，校验通过前绝不进入安装。
    async fn download_database<F>(
        directory: &Path, metadata: &RemoteMetadata, progress: &mut F
    ) -> Result<PathBuf>
    where
        F: FnMut(u64, u64),
    {
        let expected_hash = metadata.file_hash.as_ref()
            .context("Missing file_hash: refusing unauthenticated snapshot")?;
        let expected_hex = expected_hash.strip_prefix("sha256:")
            .context("Unsupported checksum algorithm")?;
        ensure!(expected_hex.len() == 64 &&
            expected_hex.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "Invalid snapshot SHA-256 value");
        ensure!(metadata.file_size > 0, "Metadata file_size must be positive");
        let url = Self::release_url(&metadata.version)?;
        let staging = directory.join(format!("tariffs.staging-{}.db", metadata.version));

        // 与目标版本一致的半成品 → 断点续传；尺寸异常（超清单）→ 丢弃重下
        let mut resume_from: u64 = 0;
        match std::fs::metadata(&staging) {
            Ok(existing) if existing.len() < metadata.file_size => resume_from = existing.len(),
            _ => { let _ = std::fs::remove_file(&staging); }
        }

        // A complete tariff snapshot can exceed 400 MB. A five-minute *total*
        // request timeout rejects valid, slowly streaming downloads. Keep a
        // bounded connect timeout, plus an independent idle timeout for each
        // streamed chunk; always enforce the manifest size and SHA-256 below.
        let client = crate::core::http::apply_system_proxy(
            reqwest::Client::builder().connect_timeout(std::time::Duration::from_secs(45)),
        )
        .build()?;
        let mut request = client.get(&url);
        if resume_from > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={resume_from}-"));
        }
        let response = request.send().await?.error_for_status()?;
        // 服务器忽略 Range 返回 200 时只能整体重下
        let resuming = resume_from > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
        if !resuming {
            resume_from = 0;
            let _ = std::fs::remove_file(&staging);
        }

        let total = response.content_length()
            .map(|len| len + resume_from)
            .unwrap_or(metadata.file_size);
        let mut received: u64 = resume_from;
        let mut hash = Sha256::new();
        if resuming {
            // 续传前重算已有前缀的哈希，保证最终 SHA-256 覆盖完整文件
            let mut prefix = std::fs::File::open(&staging)?;
            std::io::copy(&mut prefix, &mut hash)?;
        }
        let mut file = std::fs::OpenOptions::new()
            .write(true).create(true).truncate(false)
            .open(&staging)?;
        file.seek(SeekFrom::Start(resume_from))?;
        if resuming {
            progress(received, total);
        }
        let mut stream = response.bytes_stream();
        while let Some(chunk) = tokio::time::timeout(
            std::time::Duration::from_secs(150), stream.next()
        ).await.context("Tariff data download stalled for 150 seconds")? {
            let bytes = chunk.context("Download stream failed")?;
            received += bytes.len() as u64;
            ensure!(received <= metadata.file_size, "Snapshot larger than manifest");
            file.write_all(&bytes)?;
            hash.update(&bytes);
            progress(received, total);
        }
        ensure!(received == metadata.file_size,
            "Snapshot size mismatch: received {} expected {}", received, metadata.file_size);
        let digest = format!("{:x}", hash.finalize());
        ensure!(digest.eq_ignore_ascii_case(expected_hex),
            "Snapshot SHA-256 mismatch: refusing installation");
        file.sync_all()?;
        drop(file);
        Ok(staging) // 晋升成功后由调用方清理；失败时保留以支持再次续传
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
