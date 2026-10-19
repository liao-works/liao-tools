//! 体积 / 计费重试算：CBM、体积重（分泡系数）、计费重与常用柜型装柜估算。
//!
//! 纯本地计算。柜型容量与载重是行业常用参考值（约数），实际以船公司
//! 与运输路线限重为准，界面需标注。

pub mod commands;
pub mod excel;

use crate::models::cbm::{
    CbmContainerEstimate, CbmPackage, CbmPackageResult, CbmRequest, CbmResult,
};

/// 常用柜型参考（内尺寸 m、容积 m³、参考载重 kg）——行业常见约数
pub const CONTAINER_TYPES: [(&str, f64, f64, f64, f64, f64); 4] = [
    ("20GP", 5.898, 2.352, 2.385, 33.1, 21700.0),
    ("40GP", 12.032, 2.352, 2.385, 67.5, 26700.0),
    ("40HQ", 12.032, 2.352, 2.697, 76.3, 26500.0),
    ("45HQ", 13.556, 2.352, 2.697, 86.0, 27700.0),
];

/// 长度单位 → cm 换算系数
pub fn length_factor(unit: &str) -> Option<f64> {
    match unit.trim().to_lowercase().as_str() {
        "mm" => Some(0.1),
        "cm" => Some(1.0),
        "m" => Some(100.0),
        "in" | "inch" => Some(2.54),
        "ft" | "feet" => Some(30.48),
        _ => None,
    }
}

/// 重量单位 → kg 换算系数
pub fn weight_factor(unit: &str) -> Option<f64> {
    match unit.trim().to_lowercase().as_str() {
        "g" => Some(0.001),
        "kg" => Some(1.0),
        "lb" | "lbs" => Some(0.45359237),
        _ => None,
    }
}

/// 单行试算；尺寸非法时返回 Err 说明
pub fn calc_package(pkg: &CbmPackage, divisor: f64) -> Result<CbmPackageResult, String> {
    let lf = length_factor(&pkg.length_unit)
        .ok_or_else(|| format!("不支持的尺寸单位“{}”", pkg.length_unit))?;
    let wf = weight_factor(&pkg.weight_unit)
        .ok_or_else(|| format!("不支持的重量单位“{}”", pkg.weight_unit))?;
    if !pkg.length.is_finite() || !pkg.width.is_finite() || !pkg.height.is_finite()
        || pkg.length <= 0.0 || pkg.width <= 0.0 || pkg.height <= 0.0
    {
        return Err("长、宽、高必须大于 0".to_string());
    }
    if !pkg.quantity.is_finite() || pkg.quantity <= 0.0 {
        return Err("件数必须大于 0".to_string());
    }
    if !pkg.weight.is_finite() || pkg.weight < 0.0 {
        return Err("实重不能为负数".to_string());
    }
    if !divisor.is_finite() || divisor <= 0.0 {
        return Err("体积重系数必须大于 0".to_string());
    }

    let length_cm = pkg.length * lf;
    let width_cm = pkg.width * lf;
    let height_cm = pkg.height * lf;
    let piece_volume_cm3 = length_cm * width_cm * height_cm;
    let quantity = pkg.quantity;

    let total_volume_cbm = piece_volume_cm3 * quantity / 1_000_000.0;
    let total_actual_weight_kg = pkg.weight * wf * quantity;
    let volumetric_weight_kg = piece_volume_cm3 * quantity / divisor;
    let (chargeable_weight_kg, charge_basis) = if total_actual_weight_kg >= volumetric_weight_kg {
        (total_actual_weight_kg, "实重")
    } else {
        (volumetric_weight_kg, "体积重")
    };

    Ok(CbmPackageResult {
        name: pkg.name.trim().to_string(),
        line: 0,
        length_cm,
        width_cm,
        height_cm,
        quantity,
        total_volume_cbm,
        total_actual_weight_kg,
        volumetric_weight_kg,
        chargeable_weight_kg,
        charge_basis: charge_basis.to_string(),
    })
}

fn ceil_div(value: f64, capacity: f64) -> u32 {
    if value <= 0.0 || capacity <= 0.0 {
        0
    } else {
        (value / capacity).ceil() as u32
    }
}

/// 按总体积与总实重给出各柜型装柜估算（供单码与批量共用）
pub fn estimate_containers(total_volume_cbm: f64, total_actual_weight_kg: f64) -> Vec<CbmContainerEstimate> {
    CONTAINER_TYPES
        .iter()
        .map(|(name, l, w, h, capacity, payload)| {
            let by_volume = ceil_div(total_volume_cbm, *capacity);
            let by_weight = ceil_div(total_actual_weight_kg, *payload);
            CbmContainerEstimate {
                name: name.to_string(),
                internal: format!("{l:.2} × {w:.2} × {h:.2} m"),
                capacity_cbm: *capacity,
                payload_kg: *payload,
                containers_by_volume: by_volume,
                containers_by_weight: by_weight,
                containers_needed: by_volume.max(by_weight),
            }
        })
        .collect()
}

/// 试算主入口：逐行计算 + 合计 + 柜型估算
pub fn calculate(request: &CbmRequest) -> Result<CbmResult, String> {
    if request.packages.is_empty() {
        return Err("请至少填写一行包裹数据".to_string());
    }
    let mut packages = Vec::new();
    let mut errors = Vec::new();
    for (index, pkg) in request.packages.iter().enumerate() {
        match calc_package(pkg, request.divisor) {
            Ok(mut result) => {
                result.line = index + 1;
                packages.push(result);
            }
            Err(err) => errors.push(format!("第{}行：{}", index + 1, err)),
        }
    }
    if packages.is_empty() {
        return Err(format!("没有可计算的有效数据。{}", errors.join("；")));
    }

    let total_volume_cbm = packages.iter().map(|p| p.total_volume_cbm).sum();
    let total_actual_weight_kg = packages.iter().map(|p| p.total_actual_weight_kg).sum();
    let total_volumetric_weight_kg = packages.iter().map(|p| p.volumetric_weight_kg).sum();
    let chargeable_weight_kg = packages.iter().map(|p| p.chargeable_weight_kg).sum();
    let charge_basis = if total_actual_weight_kg >= total_volumetric_weight_kg {
        "实重"
    } else {
        "体积重"
    };

    let containers = estimate_containers(total_volume_cbm, total_actual_weight_kg);

    Ok(CbmResult {
        packages,
        total_volume_cbm,
        total_actual_weight_kg,
        total_volumetric_weight_kg,
        chargeable_weight_kg,
        charge_basis: charge_basis.to_string(),
        divisor: request.divisor,
        containers,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pkg(length: f64, width: f64, height: f64, weight: f64, quantity: f64) -> CbmPackage {
        CbmPackage {
            name: String::new(),
            length,
            width,
            height,
            length_unit: "cm".to_string(),
            weight,
            weight_unit: "kg".to_string(),
            quantity,
        }
    }

    #[test]
    fn unit_factors_cover_common_units() {
        assert_eq!(length_factor("cm"), Some(1.0));
        assert_eq!(length_factor("M"), Some(100.0));
        assert_eq!(length_factor("in"), Some(2.54));
        assert_eq!(length_factor("ft"), Some(30.48));
        assert_eq!(length_factor("yard"), None);
        assert_eq!(weight_factor("kg"), Some(1.0));
        assert!((weight_factor("lb").unwrap() - 0.45359237).abs() < 1e-9);
        assert_eq!(weight_factor("oz"), None);
    }

    #[test]
    fn air_divisor_volumetric_weight() {
        // 120×80×100 cm × 3 件，空运 1:6000
        let result = calc_package(&pkg(120.0, 80.0, 100.0, 150.0, 3.0), 6000.0).unwrap();
        assert!((result.total_volume_cbm - 2.88).abs() < 1e-9);
        assert!((result.total_actual_weight_kg - 450.0).abs() < 1e-9);
        // 960000 cm³/件 × 3 / 6000 = 480 kg
        assert!((result.volumetric_weight_kg - 480.0).abs() < 1e-9);
        assert!((result.chargeable_weight_kg - 480.0).abs() < 1e-9);
        assert_eq!(result.charge_basis, "体积重");
    }

    #[test]
    fn express_divisor_actual_wins() {
        // 50×40×40 cm × 2 件，快递 1:5000：体积重 32 kg < 实重 90 kg
        let result = calc_package(&pkg(50.0, 40.0, 40.0, 45.0, 2.0), 5000.0).unwrap();
        assert!((result.volumetric_weight_kg - 32.0).abs() < 1e-9);
        assert!((result.chargeable_weight_kg - 90.0).abs() < 1e-9);
        assert_eq!(result.charge_basis, "实重");
    }

    #[test]
    fn sea_divisor_uses_1000() {
        // 1 CBM 海运拼箱（1:1000）→ 体积重 1000 kg
        let result = calc_package(&pkg(100.0, 100.0, 100.0, 800.0, 1.0), 1000.0).unwrap();
        assert!((result.volumetric_weight_kg - 1000.0).abs() < 1e-9);
        assert_eq!(result.charge_basis, "体积重");
    }

    #[test]
    fn unit_conversion_mm_and_lb() {
        // 1000mm = 100cm；2 lb ≈ 0.907 kg
        let mut p = pkg(1000.0, 1000.0, 1000.0, 2.0, 1.0);
        p.length_unit = "mm".to_string();
        p.weight_unit = "lb".to_string();
        let result = calc_package(&p, 6000.0).unwrap();
        assert!((result.length_cm - 100.0).abs() < 1e-9);
        assert!((result.total_actual_weight_kg - 0.90718474).abs() < 1e-6);
    }

    #[test]
    fn invalid_rows_are_rejected_not_zeroed() {
        assert!(calc_package(&pkg(0.0, 10.0, 10.0, 1.0, 1.0), 6000.0).is_err());
        assert!(calc_package(&pkg(-1.0, 10.0, 10.0, 1.0, 1.0), 6000.0).is_err());
        assert!(calc_package(&pkg(10.0, 10.0, 10.0, -1.0, 1.0), 6000.0).is_err());
        assert!(calc_package(&pkg(10.0, 10.0, 10.0, 1.0, 0.0), 6000.0).is_err());
        let mut bad_unit = pkg(10.0, 10.0, 10.0, 1.0, 1.0);
        bad_unit.length_unit = "尺".to_string();
        assert!(calc_package(&bad_unit, 6000.0).is_err());
    }

    #[test]
    fn container_estimate_ceil_by_volume_and_weight() {
        // 100×70×100 cm × 100 件 = 70 CBM / 20000 kg：40GP 按体积 2 柜（67.5），按重 1 柜 → 需 2
        let request = CbmRequest {
            packages: vec![pkg(100.0, 70.0, 100.0, 200.0, 100.0)],
            divisor: 6000.0,
        };
        let result = calculate(&request).unwrap();
        let gp40 = result.containers.iter().find(|c| c.name == "40GP").unwrap();
        assert_eq!(gp40.containers_by_volume, 2);
        assert_eq!(gp40.containers_by_weight, 1);
        assert_eq!(gp40.containers_needed, 2);
    }

    #[test]
    fn calculate_reports_row_errors_with_valid_rows() {
        let request = CbmRequest {
            packages: vec![pkg(10.0, 10.0, 10.0, 1.0, 1.0), pkg(0.0, 0.0, 0.0, 0.0, 1.0)],
            divisor: 6000.0,
        };
        let result = calculate(&request).unwrap();
        assert_eq!(result.packages.len(), 1);
        assert_eq!(result.errors.len(), 1);
    }

    #[test]
    fn calculate_rejects_all_invalid() {
        let request = CbmRequest {
            packages: vec![pkg(0.0, 0.0, 0.0, 0.0, 1.0)],
            divisor: 6000.0,
        };
        assert!(calculate(&request).is_err());
        assert!(calculate(&CbmRequest { packages: vec![], divisor: 6000.0 }).is_err());
    }
}
