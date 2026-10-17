use crate::models::alta::ForbiddenItem;
use crate::models::tax::TaxTariff;
use crate::models::update_history::ChangeRecord;
use std::collections::HashMap;

/// 对比两份关税数据，生成行级变更记录。
/// version_from/version_to 仅 tax 全量更新有值。
pub fn diff_tariffs(
    old: &[TaxTariff],
    new: &[TaxTariff],
    session_id: &str,
    version_from: Option<&str>,
    version_to: Option<&str>,
) -> Vec<ChangeRecord> {
    let old_map: HashMap<&str, &TaxTariff> = old.iter().map(|t| (t.code.as_str(), t)).collect();
    let new_map: HashMap<&str, &TaxTariff> = new.iter().map(|t| (t.code.as_str(), t)).collect();
    let mut out = Vec::new();

    // tax 对比的共有字段：(字段名, 取值函数)
    let fields: [(&str, fn(&TaxTariff) -> Option<String>); 10] = [
        ("rate", |t| Some(t.rate.clone())),
        ("north_ireland_rate", |t| t.north_ireland_rate.clone()),
        ("description", |t| t.description.clone()),
        ("other_rate", |t| t.other_rate.clone()),
        ("anti_dumping_rate", |t| t.anti_dumping_rate.clone()),
        ("countervailing_rate", |t| t.countervailing_rate.clone()),
        ("ni_anti_dumping_rate", |t| t.ni_anti_dumping_rate.clone()),
        ("ni_countervailing_rate", |t| t.ni_countervailing_rate.clone()),
        ("trade_remedy_details", |t| t.trade_remedy_details.clone()),
        ("rate_options", |t| t.rate_options.clone()),
    ];

    let mk = |code: &str, field: Option<&str>, old_v: Option<String>,
              new_v: Option<String>, ct: &str| -> ChangeRecord {
        ChangeRecord {
            session_id: session_id.into(),
            module: "tax".into(),
            update_type: "full".into(),
            version_from: version_from.map(Into::into),
            version_to: version_to.map(Into::into),
            code: code.into(),
            field: field.map(Into::into),
            old_value: old_v,
            new_value: new_v,
            change_type: ct.into(),
        }
    };

    // added：新有旧无（new_value 存新商品描述）
    for (code, n) in &new_map {
        if !old_map.contains_key(code) {
            out.push(mk(code, None, None, n.description.clone(), "added"));
        }
    }
    // removed + modified
    for (code, o) in &old_map {
        match new_map.get(code) {
            None => out.push(mk(code, None, o.description.clone(), None, "removed")),
            Some(n) => {
                for (fname, fget) in &fields {
                    let ov = fget(o);
                    let nv = fget(n);
                    if ov != nv {
                        out.push(mk(code, Some(fname), ov, nv, "modified"));
                    }
                }
            }
        }
    }
    out
}

/// 对比两份禁运清单，生成行级变更记录（以 hs_code 为键）。
pub fn diff_forbidden_items(
    old: &[ForbiddenItem],
    new: &[ForbiddenItem],
    session_id: &str,
) -> Vec<ChangeRecord> {
    let old_map: HashMap<&str, &ForbiddenItem> =
        old.iter().map(|i| (i.hs_code.as_str(), i)).collect();
    let new_map: HashMap<&str, &ForbiddenItem> =
        new.iter().map(|i| (i.hs_code.as_str(), i)).collect();
    let mut out = Vec::new();

    let fields: [(&str, fn(&ForbiddenItem) -> Option<String>); 3] = [
        ("description", |i| Some(i.description.clone())),
        ("additional_info", |i| Some(i.additional_info.clone())),
        ("source_url", |i| Some(i.source_url.clone())),
    ];

    let mk = |code: &str, field: Option<&str>, old_v: Option<String>,
              new_v: Option<String>, ct: &str| -> ChangeRecord {
        ChangeRecord {
            session_id: session_id.into(),
            module: "alta".into(),
            update_type: "full".into(),
            version_from: None,
            version_to: None,
            code: code.into(),
            field: field.map(Into::into),
            old_value: old_v,
            new_value: new_v,
            change_type: ct.into(),
        }
    };

    for (code, _n) in &new_map {
        if !old_map.contains_key(code) {
            out.push(mk(code, None, None, None, "added"));
        }
    }
    for (code, o) in &old_map {
        match new_map.get(code) {
            None => out.push(mk(code, None, None, None, "removed")),
            Some(n) => {
                for (fname, fget) in &fields {
                    let ov = fget(o);
                    let nv = fget(n);
                    if ov != nv {
                        out.push(mk(code, Some(fname), ov, nv, "modified"));
                    }
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tariff(code: &str, rate: &str, ni: Option<&str>) -> TaxTariff {
        TaxTariff {
            code: code.into(),
            description: Some(format!("商品{}", code)),  // 测试用描述
            rate: rate.into(),
            url: String::new(),
            north_ireland_rate: ni.map(Into::into),
            north_ireland_url: None,
            other_rate: None,
            anti_dumping_rate: None,
            countervailing_rate: None,
            ni_anti_dumping_rate: None,
            ni_countervailing_rate: None,
            trade_remedy_details: None,
            rate_options: None,
            last_updated: None,
            uk_source_version: None,
            ni_source_version: None,
            uk_verified_at: None,
            ni_verified_at: None,
            uk_rate_status: None,
            ni_rate_status: None,
            similarity: None,
        }
    }

    #[test]
    fn test_diff_added_removed_modified() {
        let old = vec![tariff("01", "5%", Some("3%")), tariff("02", "0%", None)];
        let new = vec![tariff("01", "6%", Some("3%")), tariff("03", "0%", None)];
        let recs = diff_tariffs(&old, &new, "s1", Some("data-1"), Some("data-2"));

        // 01: rate 5%→6% (modified)
        assert!(recs.iter().any(|r| r.code == "01" && r.field.as_deref() == Some("rate")
            && r.old_value.as_deref() == Some("5%") && r.new_value.as_deref() == Some("6%")));
        // 02: removed，old_value=旧描述
        let removed = recs.iter().find(|r| r.code == "02" && r.change_type == "removed").unwrap();
        assert_eq!(removed.old_value.as_deref(), Some("商品02"));
        assert_eq!(removed.new_value, None);
        assert_eq!(removed.field, None);
        // 03: added，new_value=新描述
        let added = recs.iter().find(|r| r.code == "03" && r.change_type == "added").unwrap();
        assert_eq!(added.new_value.as_deref(), Some("商品03"));
        assert_eq!(added.old_value, None);
        assert_eq!(added.field, None);
    }

    #[test]
    fn test_remedy_changes_in_new_snapshot_are_recorded() {
        let old = vec![tariff("7010901000", "6%", Some("5%"))];
        let mut changed = old.clone();
        changed[0].anti_dumping_rate = Some("52.97%（其他企业，8A95）".into());
        changed[0].ni_countervailing_rate = Some("按企业/条件适用（见详情）".into());
        changed[0].trade_remedy_details = Some(r#"[{"type":"anti_dumping"}]"#.into());
        let history = diff_tariffs(&old, &changed, "change", None, None);
        assert!(history.iter().any(|c| c.field.as_deref() == Some("anti_dumping_rate")));
        assert!(history.iter().any(|c| c.field.as_deref() == Some("ni_countervailing_rate")));
        assert!(history.iter().any(|c| c.field.as_deref() == Some("trade_remedy_details")));
        let mut options_changed = old.clone();
        options_changed[0].rate_options = Some(r#"[{"region":"GB","expression":"5%","applicability":"default"}]"#.into());
        let option_history = diff_tariffs(&old, &options_changed, "options", None, None);
        assert!(option_history.iter().any(|c| c.field.as_deref() == Some("rate_options")));
    }

    #[test]
    fn test_diff_no_change() {
        let old = vec![tariff("01", "5%", None)];
        let new = vec![tariff("01", "5%", None)];
        assert!(diff_tariffs(&old, &new, "s1", None, None).is_empty());
    }
}
