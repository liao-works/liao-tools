use crate::commands::tax::database::TaxDatabase;
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
        
        // 移动新数据库到目标位置
        std::fs::rename(&temp_db_path, &target_db_path)
            .context("Failed to install new database")?;
        
        // 下载元数据
        let metadata = Self::fetch_remote_metadata().await?;
        let metadata_path = app_data_dir.join("tariffs.db.metadata.json");
        let metadata_json = serde_json::to_string_pretty(&metadata)
            .context("Failed to serialize metadata")?;
        std::fs::write(&metadata_path, metadata_json)
            .context("Failed to write metadata file")?;
        
        Ok(true)
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
