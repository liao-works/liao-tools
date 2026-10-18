//! 关税成本试算：基于本地离线税率做应缴税费估算。
//!
//! 原则与查询模块一致：本地没有的数据绝不猜测。税率表达式无法解析、
//! 按量计税缺少数量、条件税率等情况都必须显式标注"无法试算"，
//! 绝不静默按 0 处理，也不生成看似确定的错误金额。

use crate::commands::tax::database::TaxDatabase;
use crate::commands::tax::query::TaxQuery;
use serde::{Deserialize, Serialize};

fn default_true() -> bool {
    true
}

fn default_vat_rate() -> f64 {
    20.0
}

/// 单码试算请求（前端统一 camelCase 传参）
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcRequest {
    pub code: String,
    /// 目的地：GB（英国）或 XI（北爱尔兰）
    #[serde(default = "default_destination")]
    pub destination: String,
    /// 中国原产：计入反倾销 / 反补贴附加税
    #[serde(default = "default_true")]
    pub china_origin: bool,
    pub goods_value: f64,
    #[serde(default)]
    pub freight: f64,
    #[serde(default)]
    pub insurance: f64,
    /// 计税数量：税率表达式含按量计税时必填
    #[serde(default)]
    pub quantity: Option<f64>,
    /// 金额币种，仅作展示；换算完全依赖用户填写的汇率
    #[serde(default = "default_currency")]
    pub currency: String,
    /// 1 单位币种兑 GBP 的汇率，<=0 时按 1 处理
    #[serde(default = "default_exchange_rate")]
    pub exchange_rate: f64,
    /// 进口 VAT 百分比（20 表示 20%），默认英国标准税率
    #[serde(default = "default_vat_rate")]
    pub vat_rate: f64,
}

fn default_destination() -> String {
    "GB".to_string()
}

fn default_currency() -> String {
    "GBP".to_string()
}

fn default_exchange_rate() -> f64 {
    1.0
}

impl CalcRequest {
    pub fn normalized_exchange_rate(&self) -> f64 {
        if self.exchange_rate.is_finite() && self.exchange_rate > 0.0 {
            self.exchange_rate
        } else {
            1.0
        }
    }
}

/// 单项税费构成
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcLine {
    pub label: String,
    /// 本地数据库中的原始税率表达式
    pub expression: String,
    /// 折算 GBP 后的金额；无法试算时为 null
    pub amount: Option<f64>,
    pub computable: bool,
    pub note: String,
}

/// 试算结果。金额均为 GBP；totals 为 null 表示含无法试算的构成项，
/// 此时只展示已解析部分，绝不出示一个看似完整的总额。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcResult {
    pub code: String,
    pub description: Option<String>,
    pub destination: String,
    pub currency: String,
    pub customs_value: f64,
    /// 基础关税表达式（原始字符串，供展示）
    pub expression: String,
    pub rate_status: Option<String>,
    pub lines: Vec<CalcLine>,
    pub duty_total: Option<f64>,
    pub vat_rate: f64,
    pub vat_total: Option<f64>,
    pub grand_total: Option<f64>,
    /// 关税 / 完税价值（%）
    pub duty_rate_effective: Option<f64>,
    /// 全部税费 / 完税价值（%）
    pub total_rate_effective: Option<f64>,
    pub fully_computed: bool,
    pub warnings: Vec<String>,
}

/// 批量试算汇总
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcBatchResult {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub errors: Vec<String>,
    pub output_path: String,
}

/// 批量试算的全局参数（模板金额按此币种填写）
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcBatchParams {
    #[serde(default = "default_destination")]
    pub destination: String,
    #[serde(default = "default_true")]
    pub china_origin: bool,
    #[serde(default = "default_currency")]
    pub currency: String,
    #[serde(default = "default_exchange_rate")]
    pub exchange_rate: f64,
    #[serde(default = "default_vat_rate")]
    pub vat_rate: f64,
}

/// 税率表达式解析结果
#[derive(Debug, PartialEq)]
pub enum DutyExpression {
    /// 官方标注 Free，即零关税
    Free,
    Parts(Vec<DutyPart>),
    /// 无法安全解析；说明原因，绝不当作 0
    Unsupported(String),
}

#[derive(Debug, PartialEq)]
pub enum DutyPart {
    Percent(f64),
    /// 按量计税：amount / divisor × 计税数量，unit 供展示
    Specific { amount: f64, unit: String, divisor: f64 },
}

/// 归一化表达式：小写 + 压缩空白
pub fn normalize_expression(expr: &str) -> String {
    expr.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// 取字符串中第一个数字（支持小数）
pub fn first_number(s: &str) -> Option<f64> {
    let chars: Vec<char> = s.chars().collect();
    let mut idx = 0;
    while idx < chars.len() {
        if chars[idx].is_ascii_digit() {
            let start = idx;
            while idx < chars.len() && (chars[idx].is_ascii_digit() || chars[idx] == '.') {
                idx += 1;
            }
            let text: String = chars[start..idx].iter().collect();
            return text.parse::<f64>().ok().filter(|n| n.is_finite());
        }
        idx += 1;
    }
    None
}

/// 计量单位前导数字作为除数："100 kg" → (100, "kg")，"kg" → (1, "kg")
fn unit_divisor(unit: &str) -> (f64, String) {
    let unit = unit.trim();
    let split = unit
        .find(|c: char| !c.is_ascii_digit() && c != '.' && c != ' ')
        .unwrap_or(unit.len());
    let (num, rest) = unit.split_at(split);
    let divisor = num.trim().parse::<f64>().ok().filter(|n| *n > 0.0).unwrap_or(1.0);
    (divisor, rest.trim().to_string())
}

fn parse_part(part: &str) -> Result<DutyPart, String> {
    let p = part.trim();
    if p.is_empty() {
        return Err("税率表达式含空片段".to_string());
    }
    if p.contains('%') {
        let n = first_number(p).ok_or_else(|| format!("百分比片段缺少数值“{p}”"))?;
        return Ok(DutyPart::Percent(n));
    }
    if p.contains("eur") {
        return Err(format!("按欧元计税的表达式需人工换算“{p}”"));
    }
    if p.contains('£') || p.contains("gbp") {
        let n = first_number(p).ok_or_else(|| format!("税额片段缺少数值“{p}”"))?;
        let unit_text = if let Some(idx) = p.find('/') {
            &p[idx + 1..]
        } else if let Some(idx) = p.find(" per ") {
            &p[idx + 5..]
        } else if let Some(idx) = p.find("per ") {
            &p[idx + 4..]
        } else {
            return Err(format!("税额片段缺少计价单位“{p}”"));
        };
        let (divisor, unit) = unit_divisor(unit_text);
        if unit.is_empty() {
            return Err(format!("税额片段缺少计价单位“{p}”"));
        }
        return Ok(DutyPart::Specific { amount: n, unit, divisor });
    }
    Err(format!("无法识别的税率片段“{p}”"))
}

/// 解析英国 / 北爱税率表达式。支持：百分比、£ 或 GBP 按量计税（含
/// "100 kg" 型除数）、"+" 组合；Free 视为零关税；MAX/MIN、欧元计税、
/// 无法识别的片段一律 Unsupported。
pub fn parse_expression(expr: &str) -> DutyExpression {
    let normalized = normalize_expression(expr);
    if normalized.is_empty() {
        return DutyExpression::Unsupported("本地无税率数据".to_string());
    }
    if normalized == "free" {
        return DutyExpression::Free;
    }
    let has_token = |token: &str| {
        normalized
            .split(|c: char| !c.is_ascii_alphabetic())
            .any(|word| word == token)
    };
    if has_token("max") || has_token("min") {
        return DutyExpression::Unsupported("含最高/最低税额选择（MAX/MIN），需人工判定".to_string());
    }
    let mut parts = Vec::new();
    for piece in normalized.split('+') {
        match parse_part(piece) {
            Ok(part) => parts.push(part),
            Err(reason) => return DutyExpression::Unsupported(reason),
        }
    }
    if parts.is_empty() {
        DutyExpression::Unsupported("税率表达式为空".to_string())
    } else {
        DutyExpression::Parts(parts)
    }
}

/// 单个部分的试算结果
#[derive(Debug)]
pub struct PartOutcome {
    pub amount: Option<f64>,
    pub note: String,
}

/// 按（GBP）完税价值与计税数量逐项试算
pub fn compute_parts(parts: &[DutyPart], customs_value: f64, quantity: Option<f64>) -> Vec<PartOutcome> {
    parts
        .iter()
        .map(|part| match part {
            DutyPart::Percent(pct) => PartOutcome {
                amount: Some(customs_value * pct / 100.0),
                note: format!("从价 {pct}%"),
            },
            DutyPart::Specific { amount, unit, divisor } => match quantity {
                Some(qty) if qty >= 0.0 => {
                    let note = if *divisor == 1.0 {
                        format!("按量 {} × {qty} {}", amount, unit)
                    } else {
                        format!("按量 {} / {} × {qty}", amount, format!("{divisor} {unit}"))
                    };
                    PartOutcome {
                        amount: Some(amount * qty / divisor),
                        note,
                    }
                }
                _ => PartOutcome {
                    amount: None,
                    note: format!("按量计税（{amount} / {unit}），需填写与表达式一致的计税数量"),
                },
            },
        })
        .collect()
}

fn warning_for_status(status: &Option<String>, region: &str) -> Option<String> {
    match status.as_deref() {
        Some("conditional") => Some(format!("{region}税率为条件税率，试算结果仅供参考，申报前必须核对官方页面。")),
        Some("stale") => Some(format!("{region}税率为历史数据，试算结果可能过期，请核对官方页面。")),
        _ => None,
    }
}

fn validated_inputs(req: &CalcRequest) -> Result<String, String> {
    let code = req.code.trim().replace([' ', '-'], "");
    if code.len() != 10 || !code.chars().all(|c| c.is_ascii_digit()) {
        return Err("请输入完整的 10 位数字商品编码".to_string());
    }
    if !req.destination.eq_ignore_ascii_case("GB") && !req.destination.eq_ignore_ascii_case("XI") {
        return Err("目的地仅支持 GB（英国）或 XI（北爱尔兰）".to_string());
    }
    for (name, value) in [("货值", req.goods_value), ("运费", req.freight), ("保险费", req.insurance)] {
        if !value.is_finite() || value < 0.0 {
            return Err(format!("{name}不能为负数或非法数值"));
        }
    }
    if !req.vat_rate.is_finite() || req.vat_rate < 0.0 {
        return Err("VAT 税率不能为负数".to_string());
    }
    if let Some(qty) = req.quantity {
        if !qty.is_finite() || qty < 0.0 {
            return Err("计税数量不能为负数".to_string());
        }
    }
    Ok(code)
}

/// 单码试算主入口
pub fn estimate(db: &TaxDatabase, req: &CalcRequest) -> Result<CalcResult, String> {
    let code = validated_inputs(req)?;
    let tariff = TaxQuery::exact_search(db, &code)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("未找到商品编码 {code} 的本地税率记录"))?;

    let is_xi = req.destination.eq_ignore_ascii_case("XI");
    let region_label = if is_xi { "北爱尔兰" } else { "英国" };
    let (rate_expr, rate_status, ad_expr, cv_expr) = if is_xi {
        (
            tariff.north_ireland_rate.clone().unwrap_or_default(),
            tariff.ni_rate_status.clone(),
            tariff.ni_anti_dumping_rate.clone(),
            tariff.ni_countervailing_rate.clone(),
        )
    } else {
        (
            tariff.rate.clone(),
            tariff.uk_rate_status.clone(),
            tariff.anti_dumping_rate.clone(),
            tariff.countervailing_rate.clone(),
        )
    };

    let fx = req.normalized_exchange_rate();
    let customs_value = (req.goods_value + req.freight + req.insurance) * fx;

    let mut warnings: Vec<String> = Vec::new();
    let mut lines: Vec<CalcLine> = Vec::new();
    let mut fully_computed = true;

    // 基础关税
    match parse_expression(&rate_expr) {
        DutyExpression::Free => {
            lines.push(CalcLine {
                label: "基础关税".to_string(),
                expression: rate_expr.trim().to_string(),
                amount: Some(0.0),
                computable: true,
                note: "Free（零关税）".to_string(),
            });
        }
        DutyExpression::Parts(parts) => {
            let outcomes = compute_parts(&parts, customs_value, req.quantity);
            let computable = outcomes.iter().all(|o| o.amount.is_some());
            let amount = if computable {
                Some(outcomes.iter().filter_map(|o| o.amount).sum())
            } else {
                fully_computed = false;
                None
            };
            lines.push(CalcLine {
                label: "基础关税".to_string(),
                expression: rate_expr.trim().to_string(),
                amount,
                computable,
                note: outcomes.iter().map(|o| o.note.as_str()).filter(|n| !n.is_empty()).collect::<Vec<_>>().join("；"),
            });
        }
        DutyExpression::Unsupported(reason) => {
            fully_computed = false;
            warnings.push(format!("基础关税无法自动试算：{reason}。"));
            lines.push(CalcLine {
                label: "基础关税".to_string(),
                expression: rate_expr.trim().to_string(),
                amount: None,
                computable: false,
                note: reason,
            });
        }
    };

    if let Some(warning) = warning_for_status(&rate_status, &format!("{region_label}")) {
        warnings.push(warning);
    }

    // 中国原产附加税：本地无记录属正常情况（多数商品无措施），
    // 但有记录却无法解析时必须显式标注。
    if req.china_origin {
        for (label, expr) in [("反倾销税", ad_expr), ("反补贴税", cv_expr)] {
            let Some(expr) = expr else { continue };
            if expr.trim().is_empty() {
                continue;
            }
            match parse_expression(&expr) {
                DutyExpression::Free => lines.push(CalcLine {
                    label: label.to_string(),
                    expression: expr.trim().to_string(),
                    amount: Some(0.0),
                    computable: true,
                    note: "Free（零附加税）".to_string(),
                }),
                DutyExpression::Parts(parts) => {
                    let outcomes = compute_parts(&parts, customs_value, req.quantity);
                    let computable = outcomes.iter().all(|o| o.amount.is_some());
                    let amount = if computable {
                        Some(outcomes.iter().filter_map(|o| o.amount).sum())
                    } else {
                        fully_computed = false;
                        warnings.push(format!("{label}表达式需按量计税或缺少数量，未计入合计。"));
                        None
                    };
                    lines.push(CalcLine {
                        label: label.to_string(),
                        expression: expr.trim().to_string(),
                        amount,
                        computable,
                        note: outcomes.iter().map(|o| o.note.as_str()).filter(|n| !n.is_empty()).collect::<Vec<_>>().join("；"),
                    });
                }
                DutyExpression::Unsupported(reason) => {
                    fully_computed = false;
                    warnings.push(format!("{label}无法自动试算：{reason}。"));
                    lines.push(CalcLine {
                        label: label.to_string(),
                        expression: expr.trim().to_string(),
                        amount: None,
                        computable: false,
                        note: reason,
                    });
                }
            }
        }
    }

    // 反倾销 / 反补贴与普通关税分开叠加。VAT 计税基础包含全部关税，
    // 因此任一关税构成项无法试算时，合计与 VAT 都不出示，避免给出
    // 一个看似完整、实则偏小的总成本。
    let all_duty_computable = lines.iter().all(|l| l.computable);
    let duty_total = if all_duty_computable {
        Some(lines.iter().filter_map(|l| l.amount).sum::<f64>())
    } else {
        None
    };

    // VAT 计税基础：完税价值 + 应缴关税（英国口径）
    let vat_total = duty_total.map(|duty| (customs_value + duty) * req.vat_rate / 100.0);
    if !all_duty_computable {
        warnings.push("部分税费构成未能自动试算，合计金额不完整，不能作为成本依据。".to_string());
    }
    let grand_total = match (duty_total, vat_total) {
        (Some(duty), Some(vat)) => Some(duty + vat),
        _ => None,
    };
    let duty_rate_effective = duty_total.map(|duty| {
        if customs_value > 0.0 { duty / customs_value * 100.0 } else { 0.0 }
    });
    let total_rate_effective = grand_total.map(|total| {
        if customs_value > 0.0 { total / customs_value * 100.0 } else { 0.0 }
    });

    Ok(CalcResult {
        code,
        description: tariff.description.clone(),
        destination: req.destination.to_uppercase(),
        currency: req.currency.to_uppercase(),
        customs_value,
        expression: rate_expr.trim().to_string(),
        rate_status,
        lines,
        duty_total,
        vat_rate: req.vat_rate,
        vat_total,
        grand_total,
        duty_rate_effective,
        total_rate_effective,
        fully_computed,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_expression_parses() {
        assert_eq!(
            parse_expression("12.00%"),
            DutyExpression::Parts(vec![DutyPart::Percent(12.0)])
        );
        assert_eq!(
            parse_expression(" 2.5 % "),
            DutyExpression::Parts(vec![DutyPart::Percent(2.5)])
        );
    }

    #[test]
    fn free_is_zero_duty() {
        assert_eq!(parse_expression("Free"), DutyExpression::Free);
        assert_eq!(parse_expression(" free "), DutyExpression::Free);
    }

    #[test]
    fn specific_duty_with_unit_divisor() {
        assert_eq!(
            parse_expression("£15.60 / 100 kg"),
            DutyExpression::Parts(vec![DutyPart::Specific {
                amount: 15.6,
                unit: "kg".into(),
                divisor: 100.0,
            }])
        );
        assert_eq!(
            parse_expression("0.176 GBP / kg"),
            DutyExpression::Parts(vec![DutyPart::Specific {
                amount: 0.176,
                unit: "kg".into(),
                divisor: 1.0,
            }])
        );
        assert_eq!(
            parse_expression("£17.00 per litre"),
            DutyExpression::Parts(vec![DutyPart::Specific {
                amount: 17.0,
                unit: "litre".into(),
                divisor: 1.0,
            }])
        );
    }

    #[test]
    fn compound_expression_parses() {
        assert_eq!(
            parse_expression("2.00% + £15.60 / 100 kg"),
            DutyExpression::Parts(vec![
                DutyPart::Percent(2.0),
                DutyPart::Specific { amount: 15.6, unit: "kg".into(), divisor: 100.0 },
            ])
        );
    }

    #[test]
    fn unsupported_expressions_never_silently_pass() {
        assert!(matches!(parse_expression(""), DutyExpression::Unsupported(_)));
        assert!(matches!(parse_expression("12% MAX 5%"), DutyExpression::Unsupported(_)));
        assert!(matches!(parse_expression("0.5 EUR / kg"), DutyExpression::Unsupported(_)));
        assert!(matches!(parse_expression("见措施明细"), DutyExpression::Unsupported(_)));
    }

    #[test]
    fn compute_percent_against_value() {
        let parts = vec![DutyPart::Percent(12.0)];
        let outcomes = compute_parts(&parts, 1000.0, None);
        assert_eq!(outcomes[0].amount, Some(120.0));
    }

    #[test]
    fn compute_specific_requires_quantity() {
        let parts = vec![DutyPart::Specific { amount: 15.6, unit: "kg".into(), divisor: 100.0 }];
        let missing = compute_parts(&parts, 1000.0, None);
        assert_eq!(missing[0].amount, None);
        let with_qty = compute_parts(&parts, 0.0, Some(500.0));
        assert_eq!(with_qty[0].amount, Some(78.0));
    }

    #[test]
    fn unit_divisor_parses_leading_number() {
        assert_eq!(unit_divisor("100 kg"), (100.0, "kg".to_string()));
        assert_eq!(unit_divisor("1000 items"), (1000.0, "items".to_string()));
        assert_eq!(unit_divisor("kg"), (1.0, "kg".to_string()));
        assert_eq!(unit_divisor("litre"), (1.0, "litre".to_string()));
    }

    #[test]
    fn first_number_supports_decimal() {
        assert_eq!(first_number("£15.60 / 100 kg"), Some(15.6));
        assert_eq!(first_number("no digits"), None);
    }
}
