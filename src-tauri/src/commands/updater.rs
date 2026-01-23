use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::io::{self, Write, BufWriter};
use crate::commands::error::CommandError;
use tauri::Emitter;

// GitHub 仓库配置
const GITHUB_REPO: &str = "liao-works/liao-tools";
const GITHUB_API_URL: &str = "https://api.github.com/repos/liao-works/liao-tools/releases/latest";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_CHECK_INTERVAL_HOURS: u64 = 24;

// 可选的 GitHub Token（用于访问私有仓库）
fn get_github_token() -> Option<String> {
    std::env::var("GITHUB_TOKEN").ok()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub download_url: String,
    pub release_notes: String,
    pub published_at: String,
    pub platform_specific_url: Option<String>,
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSettings {
    pub auto_check: bool,
    pub last_check_time: u64,
    #[serde(default = "default_check_interval")]
    pub check_interval_hours: u64,
}

#[derive(Debug, Serialize)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

#[derive(Debug, Serialize)]
pub struct PlatformInfo {
    pub platform: String,
    pub arch: String,
    pub os_family: String,
}

fn default_check_interval() -> u64 {
    DEFAULT_CHECK_INTERVAL_HOURS
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self {
            auto_check: true,
            last_check_time: 0,
            check_interval_hours: DEFAULT_CHECK_INTERVAL_HOURS,
        }
    }
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

/// 获取当前平台信息
pub fn get_platform_info_impl() -> PlatformInfo {
    let platform = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let os_family = if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else if cfg!(target_os = "linux") {
        "linux".to_string()
    } else {
        "unknown".to_string()
    };

    PlatformInfo {
        platform,
        arch,
        os_family,
    }
}

/// 获取平台特定的下载 URL
fn get_platform_download_url(assets: &[GitHubAsset]) -> Result<Option<String>, CommandError> {
    let platform_info = get_platform_info_impl();
    
    // 根据平台和架构选择合适的安装包
    let target_patterns = match platform_info.os_family.as_str() {
        "windows" => {
            if platform_info.arch.contains("x86_64") || platform_info.arch.contains("amd64") {
                vec!["x64_setup.exe", "x64.msi", "setup.exe", ".exe"]
            } else {
                vec![".exe", ".msi"]
            }
        }
        "macos" => {
            if platform_info.arch.contains("aarch64") || platform_info.arch.contains("arm64") {
                vec!["aarch64.dmg", "arm64.dmg", "universal.dmg", ".dmg"]
            } else {
                vec!["x86_64.dmg", ".dmg", ".app.tar.gz"]
            }
        }
        "linux" => {
            if platform_info.arch.contains("x86_64") || platform_info.arch.contains("amd64") {
                vec!["amd64.AppImage", "x86_64.AppImage", ".AppImage", ".deb", ".rpm"]
            } else {
                vec![".AppImage", ".deb", ".rpm"]
            }
        }
        _ => return Ok(None),
    };

    // 按优先级查找匹配的文件
    for pattern in target_patterns {
        for asset in assets {
            if asset.name.contains(pattern) {
                println!("找到平台特定文件: {}", asset.name);
                return Ok(Some(asset.browser_download_url.clone()));
            }
        }
    }

    Ok(None)
}

/// 获取文件大小
fn get_file_size(assets: &[GitHubAsset], url: &str) -> Option<u64> {
    assets
        .iter()
        .find(|asset| asset.browser_download_url == url)
        .map(|asset| asset.size)
}

/// 获取临时下载目录
fn get_download_dir() -> Result<PathBuf, CommandError> {
    let temp_dir = std::env::temp_dir();
    let download_dir = temp_dir.join("liao-tools-update");
    
    if !download_dir.exists() {
        fs::create_dir_all(&download_dir)
            .map_err(|e| CommandError::new(
                format!("创建下载目录失败: {}", e),
                "IO_ERROR"
            ))?;
    }
    
    Ok(download_dir)
}

/// 下载更新
#[tauri::command]
pub async fn download_update(url: String, version: String, app: tauri::AppHandle) -> Result<String, CommandError> {
    println!("开始下载更新: {}", url);
    println!("版本: {}", version);
    
    let client = reqwest::Client::builder()
        .user_agent("liao-tools")
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| CommandError::new(format!("创建 HTTP 客户端失败: {}", e), "NETWORK_ERROR"))?;

    // 发送请求
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| CommandError::new(format!("下载请求失败: {}", e), "NETWORK_ERROR"))?;

    if !response.status().is_success() {
        return Err(CommandError::new(
            format!("下载失败，HTTP 状态: {}", response.status()),
            "DOWNLOAD_ERROR"
        ));
    }

    let total_size = response
        .content_length()
        .ok_or_else(|| CommandError::new("无法获取文件大小", "DOWNLOAD_ERROR"))?;

    println!("文件大小: {} 字节", total_size);

    // 确定文件扩展名
    let extension = if url.contains(".dmg") {
        ".dmg"
    } else if url.contains(".exe") {
        ".exe"
    } else if url.contains(".AppImage") {
        ".AppImage"
    } else if url.contains(".deb") {
        ".deb"
    } else if url.contains(".msi") {
        ".msi"
    } else if url.contains(".tar.gz") {
        ".tar.gz"
    } else {
        ""
    };

    // 构建文件名
    let filename = format!("liao-tools_{}{}", version, extension);
    let download_dir = get_download_dir()?;
    let file_path = download_dir.join(&filename);

    // 删除旧文件
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| CommandError::new(
                format!("删除旧文件失败: {}", e),
                "IO_ERROR"
            ))?;
    }

    // 创建文件并写入
    let file = File::create(&file_path)
        .map_err(|e| CommandError::new(
            format!("创建文件失败: {}", e),
            "IO_ERROR"
        ))?;

    let mut writer = BufWriter::new(file);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;
    
    while let Some(chunk) = stream.next().await {
        let chunk = chunk
            .map_err(|e| CommandError::new(
                format!("下载流错误: {}", e),
                "DOWNLOAD_ERROR"
            ))?;

        writer.write_all(&chunk)
            .map_err(|e| CommandError::new(
                format!("写入文件失败: {}", e),
                "IO_ERROR"
            ))?;

        downloaded += chunk.len() as u64;

        // 发送进度
        let percentage = (downloaded as f64 / total_size as f64) * 100.0;
        let progress = DownloadProgress {
            downloaded,
            total: total_size,
            percentage,
        };

        app.emit("download-progress", &progress)
            .map_err(|e| CommandError::new(
                format!("发送进度失败: {}", e),
                "EMIT_ERROR"
            ))?;

        println!("下载进度: {:.1}% ({}/{})", percentage, downloaded, total_size);
    }

    writer.flush()
        .map_err(|e| CommandError::new(
            format!("刷新缓冲区失败: {}", e),
            "IO_ERROR"
        ))?;

    println!("下载完成: {}", file_path.display());

    Ok(file_path.to_string_lossy().to_string())
}

/// 安装更新
#[tauri::command]
pub async fn install_update(file_path: String, silent: bool) -> Result<String, CommandError> {
    println!("开始安装更新: {}", file_path);
    println!("静默模式: {}", silent);

    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(CommandError::new(
            format!("文件不存在: {}", file_path),
            "FILE_NOT_FOUND"
        ));
    }

    let platform_info = get_platform_info_impl();
    let result = match platform_info.os_family.as_str() {
        "macos" => {
            if file_path.ends_with(".dmg") {
                install_macos_dmg(path, silent)
            } else if file_path.ends_with(".tar.gz") {
                install_macos_tarball(path, silent)
            } else {
                Err(CommandError::new(
                    "不支持的 macOS 安装包格式",
                    "UNSUPPORTED_FORMAT"
                ))
            }
        }
        "windows" => {
            if file_path.ends_with(".exe") {
                install_windows_exe(path, silent)
            } else if file_path.ends_with(".msi") {
                install_windows_msi(path, silent)
            } else {
                Err(CommandError::new(
                    "不支持的 Windows 安装包格式",
                    "UNSUPPORTED_FORMAT"
                ))
            }
        }
        "linux" => {
            if file_path.ends_with(".AppImage") {
                install_linux_appimage(path, silent)
            } else if file_path.ends_with(".deb") {
                install_linux_deb(path, silent)
            } else {
                Err(CommandError::new(
                    "不支持的 Linux 安装包格式",
                    "UNSUPPORTED_FORMAT"
                ))
            }
        }
        _ => Err(CommandError::new(
            "不支持的操作系统",
            "UNSUPPORTED_OS"
        )),
    };

    result.map(|_| {
        "安装程序已启动，请按照提示完成安装".to_string()
    })
}

/// 安装 macOS DMG
fn install_macos_dmg(path: &Path, _silent: bool) -> Result<(), CommandError> {
    println!("正在打开 DMG 文件: {}", path.display());
    
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map_err(|e| CommandError::new(
            format!("打开 DMG 失败: {}", e),
            "INSTALL_ERROR"
        ))?;

    Ok(())
}

/// 安装 macOS tarball
fn install_macos_tarball(path: &Path, silent: bool) -> Result<(), CommandError> {
    println!("正在解压 tarball: {}", path.display());
    
    let download_dir = get_download_dir()?;
    let extract_dir = download_dir.join("app");
    
    // 清理旧目录
    if extract_dir.exists() {
        fs::remove_dir_all(&extract_dir)
            .map_err(|e| CommandError::new(
                format!("删除旧目录失败: {}", e),
                "IO_ERROR"
            ))?;
    }

    // 解压
    let output = std::process::Command::new("tar")
        .args(["-xzf", &path.to_string_lossy(), "-C", &extract_dir.to_string_lossy()])
        .output()
        .map_err(|e| CommandError::new(
            format!("解压失败: {}", e),
            "INSTALL_ERROR"
        ))?;

    if !output.status.success() {
        return Err(CommandError::new(
            format!("解压失败: {}", String::from_utf8_lossy(&output.stderr)),
            "INSTALL_ERROR"
        ));
    }

    // 查找 .app 文件
    let app_file = find_app_bundle(&extract_dir).ok_or_else(|| {
        CommandError::new("未找到 .app 文件", "INSTALL_ERROR")
    })?;

    if silent {
        // 静默安装：复制到 Applications 并替换
        let apps_dir = Path::new("/Applications");
        let dest = apps_dir.join(app_file.file_name().unwrap());
        
        // 删除旧版本
        if dest.exists() {
            fs::remove_dir_all(&dest)
                .map_err(|e| CommandError::new(
                    format!("删除旧版本失败: {}", e),
                    "IO_ERROR"
                ))?;
        }

        // 复制新版本
        fs_extra::dir::copy(&app_file, &dest, &fs_extra::dir::CopyOptions::new())
            .map_err(|e| CommandError::new(
                format!("复制到 Applications 失败: {}", e),
                "IO_ERROR"
            ))?;

        println!("已安装到: {}", dest.display());
    } else {
        // 交互式安装：打开 Finder
        std::process::Command::new("open")
            .arg(&extract_dir)
            .spawn()
            .map_err(|e| CommandError::new(
                format!("打开 Finder 失败: {}", e),
                "INSTALL_ERROR"
            ))?;
    }

    Ok(())
}

/// 查找 .app 包
fn find_app_bundle(dir: &Path) -> Option<PathBuf> {
    for entry in fs::read_dir(dir).ok()? {
        let entry = entry.ok()?;
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "app") {
            return Some(path);
        }
    }
    None
}

/// 安装 Windows EXE
fn install_windows_exe(path: &Path, silent: bool) -> Result<(), CommandError> {
    println!("正在启动 Windows 安装程序: {}", path.display());
    
    let mut cmd = std::process::Command::new("cmd");
    cmd.args(["/c", "start"]);
    
    if silent {
        cmd.args(["/wait", "/B"]);
    }

    cmd.arg(path.as_os_str());
    
    if silent {
        // NSIS 静默安装参数
        if let Some(filename) = path.file_name() {
            let filename_str = filename.to_string_lossy();
            if filename_str.contains("_setup.exe") || filename_str.contains("setup.exe") {
                cmd.arg("/S");  // 静默安装
            }
        }
    }

    cmd.spawn()
        .map_err(|e| CommandError::new(
            format!("启动安装程序失败: {}", e),
            "INSTALL_ERROR"
        ))?;

    Ok(())
}

/// 安装 Windows MSI
fn install_windows_msi(path: &Path, silent: bool) -> Result<(), CommandError> {
    println!("正在启动 MSI 安装程序: {}", path.display());
    
    let mut cmd = std::process::Command::new("msiexec");
    
    if silent {
        cmd.args(["/i", &path.to_string_lossy(), "/qn", "/norestart"]);
    } else {
        cmd.args(["/i", &path.to_string_lossy()]);
    }

    cmd.spawn()
        .map_err(|e| CommandError::new(
            format!("启动 MSI 安装失败: {}", e),
            "INSTALL_ERROR"
        ))?;

    Ok(())
}

/// 安装 Linux AppImage
fn install_linux_appimage(path: &Path, _silent: bool) -> Result<(), CommandError> {
    println!("正在设置 AppImage: {}", path.display());
    
    // 设置可执行权限
    std::process::Command::new("chmod")
        .args(["+x", &path.to_string_lossy()])
        .status()
        .map_err(|e| CommandError::new(
            format!("设置可执行权限失败: {}", e),
            "INSTALL_ERROR"
        ))?;

    // 直接运行
    std::process::Command::new(path.as_os_str())
        .spawn()
        .map_err(|e| CommandError::new(
            format!("运行 AppImage 失败: {}", e),
            "INSTALL_ERROR"
        ))?;

    Ok(())
}

/// 安装 Linux DEB
fn install_linux_deb(path: &Path, _silent: bool) -> Result<(), CommandError> {
    println!("正在安装 DEB 包: {}", path.display());
    
    let output = std::process::Command::new("sudo")
        .args(["apt-get", "install", "-y", &path.to_string_lossy()])
        .output()
        .map_err(|e| CommandError::new(
            format!("安装 DEB 失败: {}", e),
            "INSTALL_ERROR"
        ))?;

    if !output.status.success() {
        return Err(CommandError::new(
            format!("安装失败: {}", String::from_utf8_lossy(&output.stderr)),
            "INSTALL_ERROR"
        ));
    }

    Ok(())
}

/// 从 GitHub 检查更新
#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, CommandError> {
    let client = reqwest::Client::builder()
        .user_agent("liao-tools")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| CommandError::new(format!("创建 HTTP 客户端失败: {}", e), "NETWORK_ERROR"))?;

    println!("正在从 GitHub 检查新版本...");
    println!("仓库: {}", GITHUB_REPO);
    println!("API 地址: {}", GITHUB_API_URL);

    // 构建请求，如果有 Token 则添加认证头
    let mut request = client.get(GITHUB_API_URL);
    if let Some(token) = get_github_token() {
        println!("使用 GitHub Token 进行认证");
        request = request.header("Authorization", format!("Bearer {}", token));
    }

    let response = request
        .send()
        .await
        .map_err(|e| CommandError::new(format!("获取版本信息失败: {}", e), "NETWORK_ERROR"))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_else(|_| "无法读取错误信息".to_string());

        if status.as_u16() == 404 {
            return Err(CommandError::new(
                format!("仓库 {} 未找到 Release，请确保已发布至少一个版本", GITHUB_REPO),
                "NOT_FOUND"
            ));
        } else if status.as_u16() == 403 || status.as_u16() == 401 {
            return Err(CommandError::new(
                format!("访问私有仓库失败，请设置 GITHUB_TOKEN 环境变量。错误: {}", error_body),
                "AUTH_ERROR"
            ));
        } else {
            return Err(CommandError::new(
                format!("GitHub API 返回错误状态: {} - {}", status, error_body),
                "API_ERROR"
            ));
        }
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| CommandError::new(format!("解析版本信息失败: {}", e), "PARSE_ERROR"))?;

    // 获取平台特定的下载 URL
    let platform_specific_url = get_platform_download_url(&release.assets)?;
    
    // 获取文件大小
    let file_size = platform_specific_url.as_ref()
        .and_then(|url| get_file_size(&release.assets, url));

    // 移除版本号前的 'v' 前缀
    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let current_version = CURRENT_VERSION.to_string();

    let has_update = compare_versions(&latest_version, &current_version);

    if has_update {
        println!("发现新版本: {} (当前版本: {})", latest_version, current_version);
    } else {
        println!("已是最新版本: {}", current_version);
    }

    Ok(UpdateInfo {
        current_version,
        latest_version,
        has_update,
        download_url: release.html_url,
        release_notes: release.body.unwrap_or("暂无更新说明".to_string()),
        published_at: release.published_at,
        platform_specific_url,
        file_size,
    })
}

/// 获取平台信息
#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    get_platform_info_impl()
}

/// 比较两个语义化版本 (例如 "1.2.3" vs "1.2.2")
fn compare_versions(latest: &str, current: &str) -> bool {
    let parse_version = |v: &str| -> Vec<u32> {
        v.split('.')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect()
    };

    let latest_parts = parse_version(latest);
    let current_parts = parse_version(current);

    for i in 0..latest_parts.len().max(current_parts.len()) {
        let latest_part = latest_parts.get(i).unwrap_or(&0);
        let current_part = current_parts.get(i).unwrap_or(&0);

        if latest_part > current_part {
            return true;
        } else if latest_part < current_part {
            return false;
        }
    }

    false
}

/// 检查是否应该自动检查更新
pub fn should_check_for_updates(settings: &UpdateSettings) -> bool {
    if !settings.auto_check {
        return false;
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let elapsed_hours = (now - settings.last_check_time) / 3600;
    let interval = if settings.check_interval_hours > 0 {
        settings.check_interval_hours
    } else {
        DEFAULT_CHECK_INTERVAL_HOURS
    };
    elapsed_hours >= interval
}

/// 从配置文件加载更新设置
#[tauri::command]
pub fn load_update_settings() -> Result<UpdateSettings, CommandError> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| CommandError::new("无法获取数据目录", "DIR_ERROR"))?
        .join("liao-tools");

    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| CommandError::new(format!("创建数据目录失败: {}", e), "IO_ERROR"))?;
    }

    let settings_path = data_dir.join("update_settings.json");

    if !settings_path.exists() {
        return Ok(UpdateSettings::default());
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| CommandError::new(format!("读取设置文件失败: {}", e), "IO_ERROR"))?;

    serde_json::from_str(&content)
        .map_err(|e| CommandError::new(format!("解析设置失败: {}", e), "PARSE_ERROR"))
}

/// 保存更新设置到配置文件
#[tauri::command]
pub fn save_update_settings(settings: UpdateSettings) -> Result<(), CommandError> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| CommandError::new("无法获取数据目录", "DIR_ERROR"))?
        .join("liao-tools");

    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| CommandError::new(format!("创建数据目录失败: {}", e), "IO_ERROR"))?;
    }

    let settings_path = data_dir.join("update_settings.json");

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| CommandError::new(format!("序列化设置失败: {}", e), "SERIALIZE_ERROR"))?;

    std::fs::write(&settings_path, content)
        .map_err(|e| CommandError::new(format!("写入设置文件失败: {}", e), "IO_ERROR"))
}

/// 更新最后检查时间
#[tauri::command]
pub fn update_last_check_time() -> Result<(), CommandError> {
    let mut settings = load_update_settings()?;
    settings.last_check_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    save_update_settings(settings)
}

/// 获取当前版本
#[tauri::command]
pub fn get_current_version() -> String {
    CURRENT_VERSION.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_versions() {
        assert!(compare_versions("1.2.3", "1.2.2"));
        assert!(compare_versions("1.3.0", "1.2.9"));
        assert!(compare_versions("2.0.0", "1.9.9"));
        assert!(!compare_versions("1.2.2", "1.2.3"));
        assert!(!compare_versions("1.2.3", "1.2.3"));
    }

    #[test]
    fn test_should_check_for_updates() {
        let mut settings = UpdateSettings::default();
        assert!(should_check_for_updates(&settings));

        settings.last_check_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert!(!should_check_for_updates(&settings));

        settings.auto_check = false;
        assert!(!should_check_for_updates(&settings));
    }
}
