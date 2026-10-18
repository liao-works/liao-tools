//! 数据统计视图后端。
//!
//! 统计以本地 `tariffs.db.metadata.json`（发布器产出的权威清单）为主源，
//! 辅以对本地 SQLite 的少量实时计数做一致性校验。不在客户端重新推导
//! 覆盖率/条件税率等指标——那些是采集端计算的，客户端只如实展示。

use crate::commands::tax::database::TaxDatabase;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RegionDefaultCoverage {
    pub catalogue_codes: i64,
    pub codes_with_default_duty: i64,
    pub codes_without_default_duty: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RegionRemedyCoverage {
    pub source_rows: i64,
    pub projected_rows: i64,
    pub anti_dumping_codes: i64,
    pub countervailing_codes: i64,
    pub condition_rate_expressions: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TaxDataStats {
    pub available: bool,
    pub version: String,
    pub timestamp: String,
    pub file_size_bytes: u64,
    pub record_count: i64,
    // 实时校验（本地 SQLite）
    pub live_record_count: i64,
    pub live_records_match: bool,
    pub live_gb_with_rate: i64,
    pub live_xi_with_rate: i64,
    // 来源
    pub gb_source_version: String,
    pub gb_as_of: String,
    pub xi_as_of: String,
    // 覆盖
    pub gb_default: RegionDefaultCoverage,
    pub xi_default: RegionDefaultCoverage,
    // 条件与选项
    pub gb_rate_option_rows: i64,
    pub xi_rate_option_rows: i64,
    pub conditional_rate_options: i64,
    pub unresolved_rate_options: i64,
    pub missing_rate_expressions: i64,
    // 贸易救济
    pub gb_remedy: RegionRemedyCoverage,
    pub xi_remedy: RegionRemedyCoverage,
    // 空白默认税率的原因分布（官方 gap 审计）
    pub gap_audit_record_count: i64,
    pub gap_by_region_reason: BTreeMap<String, i64>,
    // 采集端声明的范围说明
    pub rate_scope: String,
}

fn get_i64(value: &serde_json::Value, keys: &[&str]) -> i64 {
    let mut node = value;
    for key in keys {
        node = &node[key];
    }
    node.as_i64().unwrap_or(0)
}

fn get_str(value: &serde_json::Value, keys: &[&str]) -> String {
    let mut node = value;
    for key in keys {
        node = &node[key];
    }
    node.as_str().unwrap_or_default().to_string()
}

fn region_default(value: &serde_json::Value, region: &str) -> RegionDefaultCoverage {
    RegionDefaultCoverage {
        catalogue_codes: get_i64(value, &["default_duty_coverage", region, "catalogue_codes"]),
        codes_with_default_duty: get_i64(
            value,
            &["default_duty_coverage", region, "codes_with_default_duty"],
        ),
        codes_without_default_duty: get_i64(
            value,
            &["default_duty_coverage", region, "codes_without_default_duty"],
        ),
    }
}

pub fn collect(app_handle: &tauri::AppHandle) -> Result<TaxDataStats> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .context("App data directory")?;
    let metadata_path = dir.join("tariffs.db.metadata.json");
    let db_path = dir.join("tariffs.db");
    if !metadata_path.exists() || !db_path.exists() {
        return Ok(TaxDataStats::default());
    }
    let raw = std::fs::read_to_string(&metadata_path)
        .context("Reading local tariff metadata")?;
    let meta: serde_json::Value =
        serde_json::from_str(&raw).context("Parsing local tariff metadata")?;

    let mut stats = TaxDataStats {
        available: true,
        version: get_str(&meta, &["version"]),
        timestamp: get_str(&meta, &["timestamp"]),
        file_size_bytes: meta["file_size"].as_u64().unwrap_or(0),
        record_count: get_i64(&meta, &["record_count"]),
        gb_source_version: get_str(&meta, &["source_versions", "GB"]),
        gb_as_of: get_str(&meta, &["source_versions", "GB_as_of"]),
        xi_as_of: get_str(&meta, &["source_versions", "XI_as_of"]),
        gb_default: region_default(&meta, "GB"),
        xi_default: region_default(&meta, "XI"),
        gb_rate_option_rows: get_i64(&meta, &["changes_summary", "gb_rate_option_projected_rows"]),
        xi_rate_option_rows: get_i64(&meta, &["changes_summary", "xi_rate_option_projected_rows"]),
        conditional_rate_options: get_i64(&meta, &["changes_summary", "conditional_rate_options"]),
        unresolved_rate_options: get_i64(&meta, &["changes_summary", "unresolved_rate_options"]),
        missing_rate_expressions: get_i64(&meta, &["changes_summary", "missing_rate_expressions"]),
        gap_audit_record_count: get_i64(
            &meta,
            &["default_rate_gap_audit", "record_count"],
        ),
        rate_scope: get_str(&meta, &["rate_scope"]),
        ..TaxDataStats::default()
    };

    let cs = &meta["changes_summary"];
    stats.gb_remedy = RegionRemedyCoverage {
        source_rows: get_i64(cs, &["gb_trade_remedy_source_rows"]),
        projected_rows: get_i64(cs, &["gb_trade_remedy_projected_rows"]),
        anti_dumping_codes: get_i64(cs, &["gb_anti_dumping_codes"]),
        countervailing_codes: get_i64(cs, &["gb_countervailing_codes"]),
        condition_rate_expressions: get_i64(cs, &["gb_remedy_condition_rate_expressions"]),
    };
    stats.xi_remedy = RegionRemedyCoverage {
        source_rows: get_i64(cs, &["xi_trade_remedy_source_rows"]),
        projected_rows: get_i64(cs, &["xi_trade_remedy_projected_rows"]),
        anti_dumping_codes: get_i64(cs, &["xi_anti_dumping_codes"]),
        countervailing_codes: get_i64(cs, &["xi_countervailing_codes"]),
        condition_rate_expressions: get_i64(cs, &["xi_remedy_condition_duty_expression_count"]),
    };
    if let Some(reasons) = meta["default_rate_gap_audit"]["by_region_reason"].as_object() {
        for (key, value) in reasons {
            if let Some(count) = value.as_i64() {
                stats.gap_by_region_reason.insert(key.clone(), count);
            }
        }
    }

    // 少量实时校验：本地库与清单是否一致（行数 + 摘要列非空计数）。
    let db = TaxDatabase::new(app_handle)?;
    stats.live_record_count = db.get_record_count()?;
    stats.live_records_match = stats.live_record_count == stats.record_count;
    (stats.live_gb_with_rate, stats.live_xi_with_rate) = db
        .count_populated_rates()
        .context("Counting populated rates")?;
    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_release_metadata_shape() {
        let raw = r#"{
          "version": "data-20261017-41ac6ec18264d24f",
          "timestamp": "2026-10-17T12:10:00Z",
          "file_size": 501174272,
          "record_count": 16744,
          "source_versions": {"GB": "v4.0.1630", "GB_as_of": "2026-10-17", "XI_as_of": "2026-10-17"},
          "changes_summary": {
            "gb_available_default_duty_codes": 16197,
            "gb_trade_remedy_projected_rows": 7615,
            "gb_anti_dumping_codes": 325,
            "gb_countervailing_codes": 63,
            "gb_remedy_condition_rate_expressions": 16022,
            "unresolved_rate_options": 0
          },
          "default_duty_coverage": {
            "GB": {"catalogue_codes": 16742, "codes_with_default_duty": 16197, "codes_without_default_duty": 545},
            "XI": {"catalogue_codes": 16730, "codes_with_default_duty": 15663, "codes_without_default_duty": 1067}
          },
          "default_rate_gap_audit": {
            "record_count": 1613,
            "by_region_reason": {"GB:no_103_source_rows": 7}
          },
          "rate_scope": "China-origin ordinary 103 duties ..."
        }"#;
        let meta: serde_json::Value = serde_json::from_str(raw).unwrap();
        let gb = region_default(&meta, "GB");
        assert_eq!(gb.catalogue_codes, 16742);
        assert_eq!(gb.codes_without_default_duty, 545);
        assert_eq!(get_i64(&meta, &["changes_summary", "unresolved_rate_options"]), 0);
        assert_eq!(get_str(&meta, &["source_versions", "GB"]), "v4.0.1630");
    }
}
