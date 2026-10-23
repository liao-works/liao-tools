use tauri::AppHandle;

use crate::models::exchange::{CnParity, ExchangeRates};

/// 最新汇率（基准 CNY），多源降级 + 同日本地缓存
#[tauri::command]
pub async fn exchange_latest(app_handle: AppHandle) -> Result<ExchangeRates, String> {
    super::get_latest_rates(&app_handle).await
}

/// 人民币中间价（中国外汇交易中心），同日本地缓存
#[tauri::command]
pub async fn exchange_cn_parity(app_handle: AppHandle) -> Result<CnParity, String> {
    super::get_cn_parity(&app_handle).await
}
