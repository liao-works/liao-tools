//! Manual, unsigned XI/NI Other audit-review file viewer.
//! A review report is *not authoritative* tariff data and cannot modify SQLite.
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const MAX_REPORT_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
pub struct NiReviewItem {
    pub code: String,
    pub verdict: String,
    pub comparison: String,
    pub legacy: Option<String>,
    pub candidate: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NiReviewReport {
    pub kind: String,
    pub as_of: String,
    pub samples: usize,
    pub chapters: usize,
    pub required_chapters: usize,
    pub audit_sha256: String,
    pub evidence_complete: bool,
    pub status: String,
    pub manual_review_count: usize,
    pub manual_review_items: Vec<NiReviewItem>,
    pub production_eligible: bool,
    pub other_semantics_verified: bool,
}

pub fn load_ni_review(path: &str) -> Result<NiReviewReport> {
    let file = Path::new(path);
    ensure!(file.is_file(), "NI review report does not exist");
    let metadata = fs::metadata(file)?;
    ensure!(metadata.len() > 0 && metadata.len() <= MAX_REPORT_BYTES,
        "NI review JSON exceeds 1 MiB limit");
    let bytes = fs::read(file)?;
    load_ni_review_bytes(&bytes)
}

fn load_ni_review_bytes(bytes: &[u8]) -> Result<NiReviewReport> {
    ensure!(!bytes.is_empty() && bytes.len() as u64 <= MAX_REPORT_BYTES,
        "NI review payload exceeds bounds");
    let report: NiReviewReport = serde_json::from_slice(bytes)
        .context("Invalid XI evidence report JSON")?;
    ensure!(report.kind == "xi-other-evidence-gate-v1",
        "Not a supported XI review report");
    ensure!(!report.production_eligible && !report.other_semantics_verified,
        "Review report cannot mark NI Other as production verified");
    ensure!(chrono::NaiveDate::parse_from_str(&report.as_of, "%Y-%m-%d").is_ok(),
        "Invalid audit reference date");
    ensure!(report.audit_sha256.len() == 64
        && report.audit_sha256.bytes().all(|b| b.is_ascii_hexdigit()),
        "Missing source evidence SHA-256");
    ensure!(report.samples > 0 && report.samples <= 100
        && report.chapters <= report.samples
        && report.required_chapters > 0 && report.required_chapters <= 96,
        "Invalid NI sample coverage");
    ensure!(report.manual_review_count == report.manual_review_items.len()
        && report.manual_review_count <= report.samples,
        "Manual-review list does not match reported count");
    let complete = report.samples >= report.required_chapters
        && report.chapters >= report.required_chapters;
    ensure!(complete == report.evidence_complete
        && report.status == if complete { "review_required" } else { "insufficient_evidence" },
        "NI review status inconsistent with chapter coverage");
    let mut seen = std::collections::HashSet::new();
    for item in &report.manual_review_items {
        ensure!(item.code.len() == 10
            && item.code.bytes().all(|b| b.is_ascii_digit())
            && seen.insert(&item.code), "Malformed/duplicate NI review code");
        ensure!(item.verdict.len() <= 64 && item.comparison.len() <= 80,
            "Invalid NI review category");
        ensure!(item.legacy.as_ref().map_or(true, |s| s.len() <= 400)
            && item.candidate.as_ref().map_or(true, |s| s.len() <= 400),
            "Duty expression exceeds review display limits");
        if let Some(url) = &item.source_url {
            let expected = format!(
                "https://www.trade-tariff.service.gov.uk/xi/commodities/{}", item.code);
            ensure!(*url == expected, "Untrusted NI source URL");
        }
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> serde_json::Value {
        json!({
            "kind": "xi-other-evidence-gate-v1",
            "as_of": "2026-10-13", "samples": 24, "chapters": 24,
            "required_chapters": 24, "audit_sha256": "a".repeat(64),
            "evidence_complete": true, "status": "review_required",
            "manual_review_count": 1,
            "manual_review_items": [{
                "code": "0101210000", "verdict": "needs_measure_review",
                "comparison": "no_unambiguous_candidate", "legacy": "0%",
                "candidate": null,
                "source_url": "https://www.trade-tariff.service.gov.uk/xi/commodities/0101210000"
            }],
            "production_eligible": false, "other_semantics_verified": false
        })
    }

    #[test]
    fn audited_summary_can_be_reviewed_but_never_promoted() {
        let report = load_ni_review_bytes(fixture().to_string().as_bytes()).unwrap();
        assert!(!report.production_eligible);
        assert_eq!(report.manual_review_count, 1);
    }

    #[test]
    fn reject_fake_production_or_source_url() {
        let mut sample = fixture();
        sample["production_eligible"] = json!(true);
        assert!(load_ni_review_bytes(sample.to_string().as_bytes()).is_err());
        let mut sample = fixture();
        sample["manual_review_items"][0]["source_url"] = json!("https://evil.example");
        assert!(load_ni_review_bytes(sample.to_string().as_bytes()).is_err());
        let mut sample = fixture();
        sample["other_semantics_verified"] = json!(true);
        assert!(load_ni_review_bytes(sample.to_string().as_bytes()).is_err());
    }

    #[test]
    fn reject_wrong_claimed_coverage_and_corrupt_json() {
        let mut sample = fixture();
        sample["chapters"] = json!(1);
        assert!(load_ni_review_bytes(sample.to_string().as_bytes()).is_err());
        assert!(load_ni_review_bytes(b"not JSON").is_err());
    }
}
