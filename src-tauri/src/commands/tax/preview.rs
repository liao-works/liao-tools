//! Experimental shadow preview importer.
//! The archive is deliberately unsigned and CANNOT be installed as the live
//! tariff database. All paths reside under app_data/tax-preview/snapshots.
use anyhow::{ensure, Context, Result};
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

const MAX_ARCHIVE: u64 = 40 * 1024 * 1024;
const MAX_DB: u64 = 40 * 1024 * 1024;
const MAX_MANIFEST: u64 = 64 * 1024;

#[derive(Debug, Deserialize)]
struct PreviewManifest {
    schema_version: u32,
    channel: String,
    release_id: String,
    as_of: String,
    signed: bool,
    production_eligible: bool,
    artifact: PreviewArtifact,
    quality: PreviewQuality,
}

#[derive(Debug, Deserialize)]
struct PreviewArtifact {
    name: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Deserialize)]
struct PreviewQuality {
    record_count: u64,
    gb_verified: u64,
    gb_conditional: u64,
    ni_unverified: u64,
}

#[derive(Debug, Serialize)]
pub struct PreviewSummary {
    pub release_id: String,
    pub as_of: String,
    pub digest: String,
    pub record_count: u64,
    pub gb_verified: u64,
    pub gb_conditional: u64,
    pub ni_unverified: u64,
    pub production_eligible: bool,
}

#[derive(Debug, Serialize)]
pub struct PreviewRate {
    pub code: String,
    pub description: Option<String>,
    pub gb_rate: String,
    pub ni_legacy_rate: Option<String>,
    pub gb_status: String,
    pub ni_status: String,
}

fn valid_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn valid_code(value: &str) -> bool {
    value.len() == 10 && value.bytes().all(|b| b.is_ascii_digit())
}

fn preview_root(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join("tax-preview").join("snapshots"))
}

fn verify_snapshot(path: &Path, manifest: &PreviewManifest) -> Result<()> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .context("Cannot open preview SQLite read-only")?;
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    ensure!(integrity == "ok", "Preview SQLite integrity check failed");
    let columns: Vec<String> = conn.prepare("PRAGMA table_info(tariffs)")?
        .query_map([], |row| row.get(1))?
        .collect::<std::result::Result<_, _>>()?;
    for field in ["code", "rate", "description", "north_ireland_rate",
                  "uk_rate_status", "ni_rate_status"] {
        ensure!(columns.iter().any(|x| x == field), "Missing preview column: {}", field);
    }
    let (total, good, conditional, ni): (i64, i64, i64, i64) = conn.query_row(
        "SELECT COUNT(*),\n         SUM(CASE WHEN uk_rate_status='verified' AND TRIM(rate)!='' THEN 1 ELSE 0 END),\n         SUM(CASE WHEN uk_rate_status='conditional' AND TRIM(rate)='' THEN 1 ELSE 0 END),\n         SUM(CASE WHEN ni_rate_status IN ('stale','pending') THEN 1 ELSE 0 END)\n         FROM tariffs",
        [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
    ensure!(total > 100 && total as u64 == manifest.quality.record_count
        && good as u64 == manifest.quality.gb_verified
        && conditional as u64 == manifest.quality.gb_conditional
        && ni as u64 == manifest.quality.ni_unverified
        && good + conditional == total && ni == total,
        "Preview quality checks mismatch or NI has unapproved verification");
    Ok(())
}

fn validate_manifest(manifest: &PreviewManifest) -> Result<()> {
    ensure!(manifest.schema_version == 2 && manifest.channel == "shadow-preview",
        "Only shadow-preview schema V2 is supported");
    ensure!(!manifest.signed && !manifest.production_eligible,
        "Production-signed tariff packages are not supported by preview importer");
    ensure!(manifest.release_id.starts_with("target-duty-")
        && manifest.release_id.len() <= 128
        && manifest.release_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.'),
        "Unexpected preview release identifier");
    ensure!(manifest.as_of.len() == 10 &&
            manifest.as_of.bytes().all(|b| b.is_ascii_digit() || b == b'-'),
            "Invalid effective date format");
    ensure!(manifest.artifact.name == "target-duty.db" &&
            manifest.artifact.size > 0 && manifest.artifact.size <= MAX_DB &&
            valid_digest(&manifest.artifact.sha256),
            "Preview artifact outside limits or missing valid digest");
    ensure!(manifest.quality.record_count >= 100,
            "Preview does not meet minimum record threshold");
    Ok(())
}

/// A deliberately *manual* import. Never touches production tariffs.db.
pub fn import_archive(app: &tauri::AppHandle, archive_path: &str) -> Result<PreviewSummary> {
    let root = preview_root(app)?;
    import_archive_to_root(&root, archive_path)
}

fn import_archive_to_root(root: &Path, archive_path: &str) -> Result<PreviewSummary> {
    let path = Path::new(archive_path);
    ensure!(path.is_file(), "Preview ZIP does not exist");
    ensure!(fs::metadata(path)?.len() <= MAX_ARCHIVE, "Preview ZIP too large");
    let mut zip = zip::ZipArchive::new(File::open(path)?)?;
    ensure!(zip.len() == 2, "Preview ZIP must have exactly two entries");
    let manifest_bytes = {
        let mut entry = zip.by_name("manifest.json").context("Missing manifest.json")?;
        ensure!(entry.size() <= MAX_MANIFEST, "Preview manifest too large");
        let mut buffer = Vec::new();
        entry.take(MAX_MANIFEST + 1).read_to_end(&mut buffer)?;
        ensure!(buffer.len() as u64 <= MAX_MANIFEST, "Manifest exceeds safety limit");
        buffer
    };
    let manifest: PreviewManifest = serde_json::from_slice(&manifest_bytes)
        .context("Invalid preview manifest")?;
    validate_manifest(&manifest)?;
    fs::create_dir_all(root)?;
    let mut temporary = tempfile::Builder::new()
        .prefix("preview-").suffix(".db").tempfile_in(&root)?;
    let (digest, received) = {
        let mut entry = zip.by_name("target-duty.db").context("Missing target-duty.db")?;
        ensure!(entry.size() == manifest.artifact.size && entry.size() <= MAX_DB,
            "Preview ZIP content size differs from manifest");
        let mut hash = Sha256::new();
        let mut received = 0u64;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let len = entry.read(&mut buffer)?;
            if len == 0 { break; }
            received += len as u64;
            ensure!(received <= manifest.artifact.size, "Preview file exceeds expected size");
            temporary.write_all(&buffer[..len])?;
            hash.update(&buffer[..len]);
        }
        (format!("{:x}", hash.finalize()), received)
    };
    ensure!(received == manifest.artifact.size &&
            digest.eq_ignore_ascii_case(&manifest.artifact.sha256),
            "Preview SHA-256 mismatch");
    temporary.as_file_mut().sync_all()?;
    verify_snapshot(temporary.path(), &manifest)?;
    // An immutable content-addressed directory makes partial installs harmless.
    let destination = root.join(&digest);
    if destination.exists() {
        ensure!(destination.join("target-duty.db").exists(), "Incomplete existing preview");
        // Re-check local file to prevent tampered content from being reused.
        let existing = fs::read(destination.join("target-duty.db"))?;
        ensure!(format!("{:x}", Sha256::digest(&existing)) == digest,
                "Existing preview checksum mismatch");
        verify_snapshot(&destination.join("target-duty.db"), &manifest)?;
    } else {
        let staging = tempfile::Builder::new().prefix("staging-").tempdir_in(&root)?;
        let staging_db = staging.path().join("target-duty.db");
        fs::copy(temporary.path(), &staging_db)?;
        fs::write(staging.path().join("manifest.json"), &manifest_bytes)?;
        fs::rename(staging.path(), &destination).context("Cannot complete preview import")?;
    }
    Ok(PreviewSummary {
        release_id: manifest.release_id, as_of: manifest.as_of,
        digest, record_count: manifest.quality.record_count,
        gb_verified: manifest.quality.gb_verified,
        gb_conditional: manifest.quality.gb_conditional,
        ni_unverified: manifest.quality.ni_unverified,
        production_eligible: false,
    })
}

pub fn lookup(app: &tauri::AppHandle, digest: &str, code: &str) -> Result<Option<PreviewRate>> {
    lookup_from_root(&preview_root(app)?, digest, code)
}

fn lookup_from_root(root: &Path, digest: &str, code: &str) -> Result<Option<PreviewRate>> {
    ensure!(valid_digest(digest), "Invalid preview snapshot ID");
    ensure!(valid_code(code), "Commodity code must be exactly 10 digits");
    let base = root.join(digest.to_ascii_lowercase());
    let path = base.join("target-duty.db");
    ensure!(path.is_file(), "Preview snapshot has not been imported");
    // Local preview content is untrusted and cannot be used for duty declarations.
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut stmt = conn.prepare(
        "SELECT code,description,rate,north_ireland_rate,uk_rate_status,ni_rate_status\n         FROM tariffs WHERE code = ?1")?;
    let mut rows = stmt.query(params![code])?;
    if let Some(row) = rows.next()? {
        Ok(Some(PreviewRate {
            code: row.get(0)?, description: row.get(1)?,
            gb_rate: row.get(2)?, ni_legacy_rate: row.get(3)?,
            gb_status: row.get(4)?, ni_status: row.get(5)?,
        }))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shadow_contract_does_not_accept_production() {
        let m = PreviewManifest {
            schema_version: 2, channel: "shadow-preview".into(),
            release_id: "target-duty-test".into(), as_of: "2026-10-13".into(),
            signed: false, production_eligible: false,
            artifact: PreviewArtifact {
                name: "target-duty.db".into(), size: 1024, sha256: "a".repeat(64)
            },
            quality: PreviewQuality {
                record_count: 100, gb_verified: 90, gb_conditional: 10,
                ni_unverified: 100
            }
        };
        assert!(validate_manifest(&m).is_ok());
        let prod = PreviewManifest { production_eligible: true, ..m };
        assert!(validate_manifest(&prod).is_err());
        assert!(!valid_code("0101210000;"));
        assert!(!valid_digest("../x"));
    }


    fn make_fixture(archive_path: &Path, changed_hash: bool, status: &str) {
        let folder = tempfile::tempdir().unwrap();
        let dbpath = folder.path().join("source.db");
        let conn = Connection::open(&dbpath).unwrap();
        conn.execute_batch("CREATE TABLE tariffs(
            code TEXT PRIMARY KEY, description TEXT, rate TEXT,
            north_ireland_rate TEXT, uk_rate_status TEXT, ni_rate_status TEXT);").unwrap();
        for i in 0..120 {
            conn.execute(
                "INSERT INTO tariffs VALUES(?1,'Test duty','8%',NULL,?2,'pending')",
                params![format!("{:010}", i), status]).unwrap();
        }
        drop(conn);
        let body = fs::read(&dbpath).unwrap();
        let digest = format!("{:x}", Sha256::digest(&body));
        let manifest = serde_json::json!({
            "schema_version": 2, "channel": "shadow-preview",
            "release_id": "target-duty-test-001", "as_of": "2026-10-13",
            "signed": false, "production_eligible": false,
            "artifact": {
                "name": "target-duty.db", "size": body.len(),
                "sha256": if changed_hash { "a".repeat(64) } else { digest }
            },
            "quality": {
                "record_count": 120, "gb_verified": 120,
                "gb_conditional": 0, "ni_unverified": 120
            }
        });
        let archive = File::create(archive_path).unwrap();
        let mut writer = zip::ZipWriter::new(archive);
        let options = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        writer.start_file("manifest.json", options).unwrap();
        writer.write_all(manifest.to_string().as_bytes()).unwrap();
        writer.start_file("target-duty.db", options).unwrap();
        writer.write_all(&body).unwrap();
        writer.finish().unwrap();
    }

    #[test]
    fn accepts_shadow_preview_without_touching_production() {
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path().join("preview").join("snapshots");
        let archive = folder.path().join("preview.zip");
        make_fixture(&archive, false, "verified");
        let prod = folder.path().join("tariffs.db");
        fs::write(&prod, b"unchanged-production-file").unwrap();
        let info = import_archive_to_root(&root, archive.to_str().unwrap()).unwrap();
        assert_eq!(info.record_count, 120);
        assert!(!info.production_eligible);
        let row = lookup_from_root(&root, &info.digest, "0000000000").unwrap().unwrap();
        assert_eq!(row.gb_rate, "8%");
        assert_eq!(row.ni_status, "pending");
        assert_eq!(fs::read(prod).unwrap(), b"unchanged-production-file");
    }

    #[test]
    fn corrupted_preview_is_rejected_before_placing_snapshot() {
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path().join("snapshots");
        let archive = folder.path().join("tampered.zip");
        make_fixture(&archive, true, "verified");
        assert!(import_archive_to_root(&root, archive.to_str().unwrap()).is_err());
        let children = fs::read_dir(root).unwrap().count();
        assert_eq!(children, 0);
    }

    #[test]
    fn fabricated_verification_status_does_not_pass_validation() {
        let folder = tempfile::tempdir().unwrap();
        let root = folder.path().join("snapshots");
        let archive = folder.path().join("wrong-status.zip");
        make_fixture(&archive, false, "unknown");
        assert!(import_archive_to_root(&root, archive.to_str().unwrap()).is_err());
    }

    #[test]
    fn rejected_invalid_zip_never_enters_snapshots() {
        let file = tempfile::NamedTempFile::new().unwrap();
        assert!(zip::ZipArchive::new(File::open(file.path()).unwrap()).is_err());
    }
}
