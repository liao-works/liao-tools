//! Ed25519 signature verification for manual, non-production tariff review.
//! A public key MUST be compiled into the binary (TAX_V2_TRUSTED_PUBLIC_KEY_HEX).
//! The manifest cannot choose its own trust key. No installation is performed.
use anyhow::{ensure, Context, Result};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::Path;

const MAX_ZIP: u64 = 40 * 1024 * 1024;
const MAX_DB: u64 = 40 * 1024 * 1024;
const MAX_MANIFEST: u64 = 64 * 1024;

#[derive(Debug, Deserialize)]
struct SignedManifest {
    schema_version: u32,
    channel: String,
    signed: bool,
    production_eligible: bool,
    signature_alg: String,
    key_id: String,
    release_id: String,
    as_of: String,
    artifact: SignedArtifact,
    quality: SignedQuality,
    source: SignedSource,
}

#[derive(Debug, Deserialize)]
struct SignedSource {
    measure_type: String,
    geographical_area: String,
    effective_date: String,
    filtered_csv_sha256: String,
}

#[derive(Debug, Deserialize)]
struct SignedArtifact {
    name: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Deserialize)]
struct SignedQuality {
    record_count: u64,
    gb_verified: u64,
    gb_conditional: u64,
    ni_unverified: u64,
}

#[derive(Debug, Serialize)]
pub struct SignedReviewResult {
    pub release_id: String,
    pub as_of: String,
    pub key_id: String,
    pub verified_signature: bool,
    pub production_eligible: bool,
    pub record_count: u64,
    pub gb_verified: u64,
    pub gb_conditional: u64,
    pub ni_unverified: u64,
    pub sha256: String,
}

/// CI/test builds may opt in with a TEST-only trust anchor. Missing key is
/// deliberately false, and no manifest-provided key may replace it.
pub fn trusted_key_available() -> bool {
    option_env!("TAX_V2_TRUSTED_PUBLIC_KEY_HEX").is_some()
}

fn pinned_key() -> Result<[u8; 32]> {
    let value = option_env!("TAX_V2_TRUSTED_PUBLIC_KEY_HEX")
        .context("This binary has no preconfigured tariff signing public key")?;
    parse_key_hex(value)
}

fn parse_key_hex(value: &str) -> Result<[u8; 32]> {
    ensure!(value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit()),
        "Invalid embedded Ed25519 public key");
    let mut key = [0u8; 32];
    for (index, part) in value.as_bytes().chunks_exact(2).enumerate() {
        key[index] = u8::from_str_radix(std::str::from_utf8(part)?, 16)?;
    }
    Ok(key)
}

fn verify_ed25519(pubkey: &[u8; 32], message: &[u8], signature: &[u8]) -> Result<()> {
    ensure!(signature.len() == 64, "Expected 64 Ed25519 signature bytes");
    let key = VerifyingKey::from_bytes(pubkey)
        .context("Malformed embedded Ed25519 public key")?;
    let signed = Signature::from_slice(signature)
        .context("Malformed signed tariff manifest signature")?;
    key.verify(message, &signed)
        .context("Untrusted or corrupted tariff manifest signature")?;
    Ok(())
}

fn validate_manifest(m: &SignedManifest) -> Result<()> {
    ensure!(m.schema_version == 2 && m.channel == "signed-shadow-review"
        && m.signed && !m.production_eligible && m.signature_alg == "ed25519",
        "A signed review bundle is NOT a production release");
    ensure!(m.release_id.starts_with("target-duty-")
        && m.release_id.len() <= 128
        && m.release_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.'),
        "Invalid release ID");
    ensure!(!m.key_id.is_empty() && m.key_id.len() < 63
        && m.key_id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'),
        "Unexpected key ID");
    ensure!(m.artifact.name == "target-duty.db" && m.artifact.size > 0
        && m.artifact.size <= MAX_DB
        && m.artifact.sha256.len() == 64
        && m.artifact.sha256.bytes().all(|b| b.is_ascii_hexdigit()),
        "Signed DB format/digest invalid");
    ensure!(m.source.measure_type == "103" && m.source.geographical_area == "1011"
        && chrono::NaiveDate::parse_from_str(&m.source.effective_date, "%Y-%m-%d").is_ok()
        && m.source.effective_date == m.as_of
        && m.source.filtered_csv_sha256.len() == 64
        && m.source.filtered_csv_sha256.bytes().all(|b| b.is_ascii_hexdigit()),
        "Signed source is not a matching dated DBT third-country 103/1011 snapshot");
    ensure!(m.quality.record_count >= 100
        && m.quality.gb_verified + m.quality.gb_conditional == m.quality.record_count
        && m.quality.ni_unverified == m.quality.record_count,
        "Signed review does not pass GB/NI quality gate");
    ensure!(chrono::NaiveDate::parse_from_str(&m.as_of, "%Y-%m-%d").is_ok(),
        "Invalid signed data effective date");
    Ok(())
}

/// ONLY returns a verification summary. Does NOT modify any database or pointer.
pub fn verify_signed_review(path: &str) -> Result<SignedReviewResult> {
    let key = pinned_key()?;
    verify_zip_with_key(Path::new(path), &key)
}

fn verify_zip_with_key(path: &Path, key: &[u8; 32]) -> Result<SignedReviewResult> {
    ensure!(path.is_file() && std::fs::metadata(path)?.len() <= MAX_ZIP,
        "Signed review ZIP missing or too large");
    let mut zip = zip::ZipArchive::new(File::open(path)?)?;
    ensure!(zip.len() == 3, "Signed review ZIP must contain exactly three files");
    let mut names = zip.file_names().map(str::to_string).collect::<Vec<_>>();
    names.sort();
    ensure!(names == ["manifest.json", "manifest.sig", "target-duty.db"],
        "Unexpected file names in signed review ZIP");
    let manifest = {
        let mut entry = zip.by_name("manifest.json")?;
        ensure!(entry.size() <= MAX_MANIFEST, "Manifest too large");
        let mut bytes = Vec::new();
        entry.take(MAX_MANIFEST + 1).read_to_end(&mut bytes)?;
        ensure!(bytes.len() as u64 <= MAX_MANIFEST, "Manifest exceeds limit");
        bytes
    };
    let signature = {
        let mut entry = zip.by_name("manifest.sig")?;
        ensure!(entry.size() == 64, "Unexpected Ed25519 signature size");
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        bytes
    };
    // The cryptographic check MUST happen before interpreting manifest fields.
    verify_ed25519(key, &manifest, &signature)?;
    let parsed: SignedManifest = serde_json::from_slice(&manifest)?;
    validate_manifest(&parsed)?;
    let mut staged = tempfile::NamedTempFile::new()?;
    let mut sha = Sha256::new();
    let mut bytes_received = 0u64;
    {
        let mut zipped = zip.by_name("target-duty.db")?;
        ensure!(zipped.size() == parsed.artifact.size && zipped.size() <= MAX_DB,
                "Signed DB size mismatch");
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let n = zipped.read(&mut buffer)?;
            if n == 0 { break; }
            bytes_received += n as u64;
            ensure!(bytes_received <= parsed.artifact.size,
                "Signed DB expanded past expected byte size");
            use std::io::Write;
            staged.write_all(&buffer[..n])?;
            sha.update(&buffer[..n]);
        }
    }
    let actual_sha = format!("{:x}", sha.finalize());
    ensure!(bytes_received == parsed.artifact.size
        && actual_sha.eq_ignore_ascii_case(&parsed.artifact.sha256),
        "Signed manifest does not match SQLite bytes");
    let conn = Connection::open_with_flags(staged.path(), OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    ensure!(integrity == "ok", "Signed SQLite failed integrity check");
    let (rows, gb, conditional, ni): (i64,i64,i64,i64) = conn.query_row(
        "SELECT COUNT(*),\n         SUM(CASE WHEN uk_rate_status='verified' AND TRIM(rate)!='' THEN 1 ELSE 0 END),\n         SUM(CASE WHEN uk_rate_status='conditional' AND TRIM(rate)='' THEN 1 ELSE 0 END),\n         SUM(CASE WHEN ni_rate_status IN ('stale','pending') THEN 1 ELSE 0 END)\n         FROM tariffs", [], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))?;
    ensure!(rows as u64 == parsed.quality.record_count
        && gb as u64 == parsed.quality.gb_verified
        && conditional as u64 == parsed.quality.gb_conditional
        && ni as u64 == parsed.quality.ni_unverified
        && gb + conditional == rows && ni == rows,
        "Signed SQLite quality does not match trusted manifest");

    Ok(SignedReviewResult {
        release_id: parsed.release_id,
        as_of: parsed.as_of,
        key_id: parsed.key_id,
        verified_signature: true,
        production_eligible: false,
        record_count: parsed.quality.record_count,
        gb_verified: parsed.quality.gb_verified,
        gb_conditional: parsed.quality.gb_conditional,
        ni_unverified: parsed.quality.ni_unverified,
        sha256: actual_sha,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use std::io::Write;

    fn test_bundle(path: &Path, seed: &[u8;32], bad: bool) {
        let root = tempfile::tempdir().unwrap();
        let db_path = root.path().join("db.sqlite");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch("CREATE TABLE tariffs(code TEXT,rate TEXT,uk_rate_status TEXT,ni_rate_status TEXT);").unwrap();
        for i in 0..120 {
            conn.execute("INSERT INTO tariffs VALUES (?1,'0%','verified','pending')",
                [format!("{:010}",i)]).unwrap();
        }
        drop(conn);
        let db_bytes = std::fs::read(&db_path).unwrap();
        let digest = format!("{:x}", Sha256::digest(&db_bytes));
        let manifest = serde_json::json!({
            "schema_version": 2, "channel": "signed-shadow-review",
            "signed": true, "production_eligible": false,
            "signature_alg": "ed25519", "key_id": "ci-fixture",
            "release_id": "target-duty-signed-test",
            "as_of": "2026-10-13",
            "source": {
                "measure_type": "103", "geographical_area": "1011",
                "effective_date": "2026-10-13", "filtered_csv_sha256": "a".repeat(64)
            },
            "artifact": {"name": "target-duty.db", "size": db_bytes.len(), "sha256": digest},
            "quality": {"record_count": 120,"gb_verified":120,"gb_conditional":0,"ni_unverified":120}
        }).to_string();
        let signing_key = SigningKey::from_bytes(seed);
        let mut sig = signing_key.sign(manifest.as_bytes()).to_bytes().to_vec();
        if bad { sig[0] ^= 0x80; }
        let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
        let opts = zip::write::FileOptions::default();
        zip.start_file("manifest.json", opts).unwrap();
        zip.write_all(manifest.as_bytes()).unwrap();
        zip.start_file("manifest.sig", opts).unwrap();
        zip.write_all(&sig).unwrap();
        zip.start_file("target-duty.db", opts).unwrap();
        zip.write_all(&db_bytes).unwrap();
        zip.finish().unwrap();
    }

    #[test]
    fn signed_review_is_authenticated_but_never_production_eligible() {
        let seed = [7u8;32];
        let key = SigningKey::from_bytes(&seed).verifying_key().to_bytes();
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("signed.zip");
        test_bundle(&archive, &seed, false);
        let result = verify_zip_with_key(&archive, &key).unwrap();
        assert!(result.verified_signature);
        assert!(!result.production_eligible);
        assert_eq!(result.gb_verified, 120);
        assert_eq!(result.ni_unverified, 120);
    }

    #[test]
    fn rejects_tampered_signature_and_wrong_key() {
        let seed = [7u8;32];
        let key = SigningKey::from_bytes(&seed).verifying_key().to_bytes();
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("tampered.zip");
        test_bundle(&archive, &seed, true);
        assert!(verify_zip_with_key(&archive, &key).is_err());
        let valid = dir.path().join("valid.zip");
        test_bundle(&valid, &seed, false);
        assert!(verify_zip_with_key(&valid, &[8u8;32]).is_err());
    }

    #[test]
    fn signature_contract_rejects_wrong_official_source_even_when_signed() {
        let m = SignedManifest {
            schema_version: 2, channel: "signed-shadow-review".into(), signed: true,
            production_eligible: false, signature_alg: "ed25519".into(),
            key_id: "ci".into(), release_id: "target-duty-test".into(),
            as_of: "2026-10-13".into(),
            source: SignedSource {
                measure_type: "142".into(), geographical_area: "1011".into(),
                effective_date: "2026-10-13".into(), filtered_csv_sha256: "a".repeat(64)
            },
            artifact: SignedArtifact {
                name: "target-duty.db".into(), size: 1024, sha256: "b".repeat(64)
            },
            quality: SignedQuality {
                record_count: 120, gb_verified: 120, gb_conditional: 0, ni_unverified: 120
            },
        };
        assert!(validate_manifest(&m).is_err());
        assert!(validate_manifest(&SignedManifest {
            source: SignedSource {
                measure_type: "103".into(), geographical_area: "1011".into(),
                effective_date: "2026-10-12".into(), filtered_csv_sha256: "a".repeat(64)
            }, ..m
        }).is_err());
    }

    #[test]
    fn empty_key_cannot_disable_verification() {
        assert!(parse_key_hex("").is_err());
        assert!(parse_key_hex("../invalid").is_err());
    }
}
