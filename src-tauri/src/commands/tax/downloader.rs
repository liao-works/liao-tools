use crate::commands::tax::database::TaxDatabase;
use crate::commands::update_history::database::HistoryDatabase;
use crate::commands::update_history::diff::diff_tariffs;
use crate::models::tax::{RemoteMetadata, TaxVersionInfo, VersionDetail};
use anyhow::{Context, Result};
use std::path::PathBuf;
use tauri::Manager;

const METADATA_URL: &str =
    "https://github.com/liao-works/cursor-tax-tools/releases/download/latest-data/metadata.json";
const DB_URL: &str =
    "https://github.com/liao-works/cursor-tax-tools/releases/download/latest-data/tariffs.db";

/// 数据下载器
pub struct TaxDataDownloader;

impl TaxDataDownloader {
    /// 检查更新
    pub async fn check_update(app_handle: &tauri::AppHandle) -> Result<TaxVersionInfo> {
        // 获取本地版本信息
        let local_version = Self::get_local_version(app_handle).await?;
        
        // 获取远程版本信息
        let remote_metadata = Self::fetch_remote_metadata().await?;
        let remote_version = VersionDetail {
            version: remote_metadata.version.clone(),
            records: remote_metadata.record_count,
            date: remote_metadata.timestamp.split('T').next().unwrap_or("unknown").to_string(),
        };
        
        // 判断是否有更新
        let has_update = remote_version.version != local_version.version;
        
        Ok(TaxVersionInfo {
            local: local_version,
            remote: remote_version,
            has_update,
            changelog: remote_metadata.changelog.unwrap_or_default(),
            data_changes: remote_metadata.data_changes,
        })
    }
    
    /// 下载并安装数据库
    pub async fn download_and_install<F>(
        app_handle: &tauri::AppHandle,
        mut progress_callback: F,
    ) -> Result<bool>
    where
        F: FnMut(u64, u64),
    {
        // 下载数据库文件
        let temp_db_path = Self::download_database(&mut progress_callback).await?;

        // 提前获取远程元数据（用于 diff 的 version_to 与写 metadata 文件，避免重复 fetch）
        let remote_metadata = Self::fetch_remote_metadata().await?;

        // 获取目标路径
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .context("Failed to get app data directory")?;

        std::fs::create_dir_all(&app_data_dir)
            .context("Failed to create app data directory")?;

        let target_db_path = app_data_dir.join("tariffs.db");

        // 备份旧数据库（如果存在）
        if target_db_path.exists() {
            let backup_path = app_data_dir.join("tariffs.db.backup");
            std::fs::copy(&target_db_path, &backup_path)
                .context("Failed to backup old database")?;
        }

        // 旁路：对比新旧库写入变更历史（必须在 rename 之前，否则旧库被覆盖）
        // 失败仅告警，不阻断主流程
        let local_version = Self::get_local_version(app_handle)
            .await
            .unwrap_or_else(|_| VersionDetail {
                version: "unknown".into(),
                records: 0,
                date: "unknown".into(),
            });
        if let Err(e) = Self::record_full_update_diff(
            app_handle,
            &target_db_path,
            &temp_db_path,
            &local_version.version,
            &remote_metadata.version,
        ) {
            log::warn!("写入 tax 全量变更历史失败: {}", e);
        }

        // 移动新数据库到目标位置
        std::fs::rename(&temp_db_path, &target_db_path)
            .context("Failed to install new database")?;

        // 写入元数据文件（复用已获取的 remote_metadata，不再二次 fetch）
        let metadata_path = app_data_dir.join("tariffs.db.metadata.json");
        let metadata_json = serde_json::to_string_pretty(&remote_metadata)
            .context("Failed to serialize metadata")?;
        std::fs::write(&metadata_path, metadata_json)
            .context("Failed to write metadata file")?;

        Ok(true)
    }

    /// 对比旧库与下载的新库，写入 tax 全量变更历史
    fn record_full_update_diff(
        app_handle: &tauri::AppHandle,
        old_db_path: &std::path::Path,
        new_db_path: &std::path::Path,
        version_from: &str,
        version_to: &str,
    ) -> Result<()> {
        // 旧库可能不存在（首次下载），此时全部为 added
        let old_tariffs = if old_db_path.exists() {
            TaxDatabase::read_all_from_path(old_db_path).unwrap_or_default()
        } else {
            Vec::new()
        };
        let new_tariffs = TaxDatabase::read_all_from_path(new_db_path)?;

        let session_id = uuid::Uuid::new_v4().to_string();
        let records = diff_tariffs(
            &old_tariffs,
            &new_tariffs,
            &session_id,
            Some(version_from),
            Some(version_to),
        );

        let history_db = HistoryDatabase::new(app_handle)?;
        history_db.insert_changes(&records)?;
        Ok(())
    }
    
    /// 获取本地版本信息
    async fn get_local_version(app_handle: &tauri::AppHandle) -> Result<VersionDetail> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .context("Failed to get app data directory")?;
        
        let metadata_path = app_data_dir.join("tariffs.db.metadata.json");
        
        if metadata_path.exists() {
            // 读取本地元数据
            let metadata_json = std::fs::read_to_string(&metadata_path)
                .context("Failed to read local metadata")?;
            let metadata: RemoteMetadata = serde_json::from_str(&metadata_json)
                .context("Failed to parse local metadata")?;
            
            Ok(VersionDetail {
                version: metadata.version,
                records: metadata.record_count,
                date: metadata.timestamp.split('T').next().unwrap_or("unknown").to_string(),
            })
        } else {
            // 如果没有元数据文件，尝试从数据库读取记录数
            match TaxDatabase::new(app_handle) {
                Ok(db) => {
                    let records = db.get_record_count().unwrap_or(0);
                    Ok(VersionDetail {
                        version: "unknown".to_string(),
                        records,
                        date: "unknown".to_string(),
                    })
                }
                Err(_) => Ok(VersionDetail {
                    version: "none".to_string(),
                    records: 0,
                    date: "none".to_string(),
                }),
            }
        }
    }
    
    /// 获取远程元数据
    async fn fetch_remote_metadata() -> Result<RemoteMetadata> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Failed to create HTTP client")?;
        
        let response = client
            .get(METADATA_URL)
            .send()
            .await
            .context("Failed to fetch remote metadata")?;
        
        let metadata = response
            .json::<RemoteMetadata>()
            .await
            .context("Failed to parse remote metadata")?;
        
        Ok(metadata)
    }
    
    /// 下载数据库文件
    async fn download_database<F>(progress_callback: &mut F) -> Result<PathBuf>
    where
        F: FnMut(u64, u64),
    {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5分钟超时
            .build()
            .context("Failed to create HTTP client")?;
        
        let response = client
            .get(DB_URL)
            .send()
            .await
            .context("Failed to start download")?;
        
        let total_size = response.content_length().unwrap_or(0);
        
        // 创建临时文件
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join("tariffs_download.db");
        let mut file = std::fs::File::create(&temp_path)
            .context("Failed to create temporary file")?;
        
        // 下载文件并报告进度
        let mut downloaded: u64 = 0;
        
        use futures_util::StreamExt;
        use std::io::Write;
        
        let mut stream = response.bytes_stream();
        
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Failed to read chunk")?;
            file.write_all(&chunk)
                .context("Failed to write to temporary file")?;
            
            downloaded += chunk.len() as u64;
            progress_callback(downloaded, total_size);
        }
        
        Ok(temp_path)
    }
}
