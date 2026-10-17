use crate::commands::tax::database::TaxDatabase;
use crate::commands::update_history::database::HistoryDatabase;
use crate::commands::update_history::diff::diff_tariffs;
use crate::models::tax::{RemoteMetadata, TaxVersionInfo, VersionDetail};
use anyhow::{ensure, Context, Result};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::Path;
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
        Self::validate_database(staged_db.as_ref(), metadata.record_count)?;

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
            app_handle, &live_db, staged_db.as_ref(),
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
        if let Err(err) = std::fs::rename(staged_db.as_ref() as &Path, &live_db) {
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
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30)).build()?;
        let metadata = client.get(METADATA_URL).send().await?
            .error_for_status()?
            .json::<RemoteMetadata>().await?;
        Ok(metadata)
    }

    async fn download_database<F>(
        directory: &Path, metadata: &RemoteMetadata, progress: &mut F
    ) -> Result<tempfile::TempPath>
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
        // A complete tariff snapshot can exceed 400 MB. A five-minute *total*
        // request timeout rejects valid, slowly streaming downloads. Keep a
        // bounded connect timeout, plus an independent idle timeout for each
        // streamed chunk; always enforce the manifest size and SHA-256 below.
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(45)).build()?;
        let response = client.get(&url).send().await?.error_for_status()?;
        let total = response.content_length().unwrap_or(metadata.file_size);
        let mut file = tempfile::Builder::new()
            .prefix("tariffs-download-").suffix(".db")
            .tempfile_in(directory)?;
        let mut received: u64 = 0;
        let mut hash = Sha256::new();
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
        file.as_file_mut().sync_all()?;
        Ok(file.into_temp_path()) // Automatically delete on failed validation or install.
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
}
