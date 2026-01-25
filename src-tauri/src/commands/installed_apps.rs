use crate::commands::error::CommandError;
use log::info;
use serde::{Deserialize, Serialize};

/// 已安装的应用程序信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
    pub name: String,
    pub display_name: String,
    pub path: String,
    pub icon_base64: Option<String>,  // Base64 编码的 PNG 图标
    pub publisher: Option<String>,
    pub version: Option<String>,
}

/// 扫描已安装的应用程序
#[tauri::command]
pub fn get_installed_apps() -> Result<Vec<InstalledApp>, CommandError> {
    info!("开始扫描已安装的应用程序");

    #[cfg(target_os = "windows")]
    {
        get_windows_apps()
    }

    #[cfg(target_os = "macos")]
    {
        get_macos_apps()
    }

    #[cfg(target_os = "linux")]
    {
        get_linux_apps()
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(vec![])
    }
}

/// Windows 平台：使用 winreg 直接读取注册表
#[cfg(target_os = "windows")]
fn get_windows_apps() -> Result<Vec<InstalledApp>, CommandError> {
    use winreg::enums::{HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    let mut apps = Vec::new();

    // 方案1: 扫描开始菜单快捷方式（最可靠）
    info!("扫描开始菜单快捷方式...");
    if let Ok(start_menu_apps) = scan_start_menu_shortcuts() {
        info!("从开始菜单找到 {} 个程序", start_menu_apps.len());
        apps.extend(start_menu_apps);
    }

    // 方案2: 扫描注册表（补充）
    info!("扫描注册表...");
    let uninstall_paths = vec![
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    for (hkey, path) in uninstall_paths {
        let hklm = RegKey::predef(hkey);
        if let Ok(uninstall_key) = hklm.open_subkey_with_flags(path, KEY_READ) {
            // 枚举所有子键
            for subkey_result in uninstall_key.enum_keys() {
                if let Ok(subkey_name) = subkey_result {
                    if let Ok(program_key) = uninstall_key.open_subkey_with_flags(&subkey_name, KEY_READ) {
                        // 读取 DisplayName
                        if let Ok(display_name) = program_key.get_value::<String, _>("DisplayName") {
                            // 过滤掉更新和系统更新
                            if display_name.contains("KB")
                                || display_name.contains("Update")
                                || display_name.contains("Service Pack")
                                || display_name.contains("Security Update")
                            {
                                continue;
                            }

                            // 读取其他属性
                            let display_icon: Result<String, _> = program_key.get_value("DisplayIcon");
                            let publisher: Result<String, _> = program_key.get_value("Publisher");
                            let version: Result<String, _> = program_key.get_value("DisplayVersion");
                            let install_location: Result<String, _> = program_key.get_value("InstallLocation");
                            let uninstall_string: Result<String, _> = program_key.get_value("UninstallString");

                            // 构建路径的优先级：
                            // 1. InstallLocation 目录中查找
                            // 2. DisplayIcon
                            // 3. UninstallString 中提取
                            let path = if let Ok(location) = &install_location {
                                if !location.is_empty() {
                                    let exe_path = find_executable_in_dir(location);
                                    if !exe_path.is_empty() {
                                        exe_path
                                    } else {
                                        info!("在安装目录中未找到可执行文件: {}", location);
                                        // 尝试从 DisplayIcon 获取
                                        if let Ok(icon) = &display_icon {
                                            clean_path(icon)
                                        } else {
                                            String::new()
                                        }
                                    }
                                } else {
                                    String::new()
                                }
                            } else if let Ok(icon) = &display_icon {
                                clean_path(icon)
                            } else if let Ok(uninstall) = &uninstall_string {
                                // 从 UninstallString 提取路径
                                extract_path_from_uninstall_string(uninstall)
                            } else {
                                String::new()
                            };

                            if !path.is_empty() {
                                info!("应用 {} 的路径: {}", display_name, path);
                            } else {
                                info!("应用 {} 无法确定路径", display_name);
                            }

                            apps.push(InstalledApp {
                                name: display_name.clone(),
                                display_name,
                                path,
                                icon_base64: None,  // 图标按需提取
                                publisher: publisher.ok(),
                                version: version.ok(),
                            });
                        }
                    }
                }
            }
        }
    }

    // 去重并排序
    let mut unique_apps = std::collections::HashMap::new();
    for app in apps {
        if !app.display_name.is_empty() {
            unique_apps.entry(app.display_name.clone()).or_insert(app);
        }
    }

    let mut result: Vec<InstalledApp> = unique_apps.into_values().collect();
    result.sort_by(|a, b| a.display_name.cmp(&b.display_name));

    info!("在 Windows 上找到 {} 个应用程序", result.len());
    Ok(result)
}

/// 从卸载字符串中提取路径
#[cfg(target_os = "windows")]
fn extract_path_from_uninstall_string(uninstall_string: &str) -> String {
    let uninstall_string = uninstall_string.trim();

    // 卸载字符串通常是：`"C:\Program Files\MyApp\uninstall.exe" /param1 /param2`
    // 或者：`C:\Program Files\MyApp\uninstall.exe /param1`

    // 如果以引号开始，提取引号内的路径
    if uninstall_string.starts_with('"') {
        if let Some(end_quote) = uninstall_string[1..].find('"') {
            let quoted_path = &uninstall_string[1..end_quote + 1];
            // 如果是 uninstall.exe，尝试替换为实际程序名
            if quoted_path.to_lowercase().contains("uninst") || quoted_path.to_lowercase().contains("uninstall") {
                // 提取目录并返回空（稍后让其他逻辑处理）
                return String::new();
            }
            return quoted_path.to_string();
        }
    }

    // 不带引号，按空格分割，取第一部分
    let first_part = uninstall_string.split_whitespace().next().unwrap_or("");

    // 检查是否是 .exe 文件
    if first_part.to_lowercase().ends_with(".exe") {
        // 如果是 uninstall.exe，返回空
        if first_part.to_lowercase().contains("uninst") {
            return String::new();
        }
        return first_part.to_string();
    }

    String::new()
}

/// 清理路径（移除命令行参数、逗号后的图标索引等）
#[cfg(target_os = "windows")]
fn clean_path(path: &str) -> String {
    let path = path.trim();

    // 如果路径被引号包围，先提取引号内的内容
    let extracted = if path.starts_with('"') {
        // 找到第一个引号后的内容
        if let Some(end_quote) = path[1..].find('"') {
            &path[1..end_quote + 1]
        } else {
            path
        }
    } else {
        path
    };

    // 移除逗号后的图标索引（例如：myapp.exe,0）
    let without_comma = extracted.split(',').next().unwrap_or(extracted);

    // 如果提取的路径以 .exe 结尾，直接返回
    if without_comma.to_lowercase().ends_with(".exe") {
        return without_comma.to_string();
    }

    // 否则，返回原始路径（可能只是程序名）
    without_comma.to_string()
}

/// 扫描开始菜单快捷方式（最可靠的路径来源）
#[cfg(target_os = "windows")]
fn scan_start_menu_shortcuts() -> Result<Vec<InstalledApp>, CommandError> {
    use std::fs;

    let mut apps = Vec::new();

    // 获取开始菜单路径
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let programdata = std::env::var("PROGRAMDATA").unwrap_or_default();

    let start_menu_paths = vec![
        format!("{}/Microsoft/Windows/Start Menu/Programs", appdata),
        format!("{}/Microsoft/Windows/Start Menu/Programs", programdata),
    ];

    for start_menu in &start_menu_paths {
        let start_menu_path = std::path::Path::new(start_menu);
        if start_menu_path.exists() {
            info!("扫描开始菜单: {}", start_menu);
            if let Ok(entries) = fs::read_dir(start_menu_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    // 递归扫描子目录
                    scan_directory_for_apps(&path, &mut apps, 2);
                }
            }
        }
    }

    Ok(apps)
}

/// 递归扫描目录查找应用程序
#[cfg(target_os = "windows")]
fn scan_directory_for_apps(dir: &std::path::Path, apps: &mut Vec<InstalledApp>, max_depth: usize) {
    use std::fs;

    if max_depth == 0 {
        return;
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_dir() {
                // 继续递归
                scan_directory_for_apps(&path, apps, max_depth - 1);
            } else if path.extension().and_then(|s| s.to_str()) == Some("lnk") {
                // 找到快捷方式，尝试解析
                if let Ok(target_path) = resolve_shortcut(&path) {
                    if target_path.to_lowercase().ends_with(".exe") {
                        let app_name = path.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unknown")
                            .to_string();

                        apps.push(InstalledApp {
                            name: app_name.clone(),
                            display_name: app_name,
                            path: target_path.to_string(),
                            icon_base64: None,
                            publisher: None,
                            version: None,
                        });
                        info!("从快捷方式找到程序: {} -> {}", path.display(), target_path);
                    }
                }
            }
        }
    }
}

/// 解析 .lnk 快捷方式文件
#[cfg(target_os = "windows")]
fn resolve_shortcut(lnk_path: &std::path::Path) -> Result<String, CommandError> {
    use std::process::Command;

    // 使用 PowerShell 读取快捷方式目标
    let ps_script = format!(
        "(New-Object -ComObject WScript.Shell).CreateShortCut('{}').TargetPath",
        lnk_path.display().to_string().replace('\'', "''")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NoLogo", "-Command", &ps_script])
        .output();

    match output {
        Ok(result) if result.status.success() => {
            let target_path = String::from_utf8_lossy(&result.stdout).trim().to_string();
            if !target_path.is_empty() {
                Ok(target_path)
            } else {
                Err(CommandError::new("无法读取快捷方式目标", "SHORTCUT_ERROR"))
            }
        }
        _ => Err(CommandError::new("PowerShell 执行失败", "SHORTCUT_ERROR")),
    }
}

/// 在目录中查找主执行文件
#[cfg(target_os = "windows")]
fn find_executable_in_dir(dir: &str) -> String {
    use std::fs;

    let dir_path = std::path::Path::new(dir);

    // 提取目录名
    let dir_name = dir_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    if let Ok(entries) = fs::read_dir(dir) {
        // 先收集所有条目，避免借用问题
        let entries_vec: Vec<std::path::PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .collect();

        // 首先查找与目录同名的 .exe 文件
        for path in &entries_vec {
            if path.extension().and_then(|s| s.to_str()) == Some("exe") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    if stem.eq_ignore_ascii_case(&dir_name) {
                        return path.to_string_lossy().to_string();
                    }
                }
            }
        }

        // 如果没找到，返回第一个 .exe 文件
        for path in &entries_vec {
            if path.extension().and_then(|s| s.to_str()) == Some("exe") {
                return path.to_string_lossy().to_string();
            }
        }
    }

    String::new()
}

/// macOS 平台：使用 system_profiler 获取应用列表
#[cfg(target_os = "macos")]
fn get_macos_apps() -> Result<Vec<InstalledApp>, CommandError> {
    let mut apps = Vec::new();
    use std::process::Command;

    // 使用 system_profiler 命令获取应用程序列表
    let output = Command::new("system_profiler")
        .args(["SPApplicationsDataType", "-json"])
        .output();

    match output {
        Ok(result) => {
            if result.status.success() {
                let json_str = String::from_utf8_lossy(&result.stdout);

                // 解析 JSON
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json_str) {
                    if let Some(app_data) = value.get("SPApplicationsDataType") {
                        if let Some(arr) = app_data.as_array() {
                            for item in arr {
                                if let Some(app_list) = item.get("_items").and_then(|v| v.as_array()) {
                                    for app in app_list {
                                        if let Some(name) = app.get("name").and_then(|v| v.as_str()) {
                                            let path = app.get("path")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("/Applications");

                                            let version = app.get("version")
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.to_string());

                                            let info = app.get("info")
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.to_string());

                                            apps.push(InstalledApp {
                                                name: name.to_string(),
                                                display_name: name.to_string(),
                                                path: path.to_string(),
                                                icon_base64: None,
                                                publisher: info,
                                                version,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            info!("system_profiler 查询失败: {}", e);
        }
    }

    apps.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    info!("在 macOS 上找到 {} 个应用程序", apps.len());
    Ok(apps)
}

/// Linux 平台：解析 .desktop 文件
#[cfg(target_os = "linux")]
fn get_linux_apps() -> Result<Vec<InstalledApp>, CommandError> {
    let mut apps = Vec::new();
    use std::fs;

    // 扫描多个 .desktop 目录
    let desktop_dirs = vec![
        "/usr/share/applications",
        "/usr/local/share/applications",
        "/var/lib/flatpak/exports/share/applications",
    ];

    // 添加用户目录
    if let Ok(home) = std::env::var("HOME") {
        desktop_dirs.push(&format!("{}/.local/share/applications", home));
    }

    for dir in &desktop_dirs {
        let dir_path = std::path::Path::new(dir);
        if dir_path.exists() {
            if let Ok(entries) = fs::read_dir(dir_path) {
                for entry in entries.flatten() {
                    let path = entry.path();

                    if path.extension().and_then(|s| s.to_str()) == Some("desktop") {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Some(app) = parse_desktop_file(&content) {
                                apps.push(app);
                            }
                        }
                    }
                }
            }
        }
    }

    // 去重并排序
    let mut unique_apps = std::collections::HashMap::new();
    for app in apps {
        unique_apps.entry(app.display_name.clone()).or_insert(app);
    }

    let mut result: Vec<InstalledApp> = unique_apps.into_values().collect();
    result.sort_by(|a, b| a.display_name.cmp(&b.display_name));

    info!("在 Linux 上找到 {} 个应用程序", result.len());
    Ok(result)
}

/// 解析 .desktop 文件
#[cfg(target_os = "linux")]
fn parse_desktop_file(content: &str) -> Option<InstalledApp> {
    let mut name = None;
    let mut exec = None;
    let mut comment = None;
    let mut in_desktop_entry = false;

    for line in content.lines() {
        let line = line.trim();

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if line == "[Desktop Entry]" {
            in_desktop_entry = true;
            continue;
        } else if line.starts_with('[') {
            in_desktop_entry = false;
            continue;
        }

        if !in_desktop_entry {
            continue;
        }

        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim();

            match key {
                "Name" => name = Some(value.to_string()),
                "Exec" => exec = Some(value.to_string()),
                "Comment" => comment = Some(value.to_string()),
                _ => {}
            }
        }
    }

    if let (Some(app_name), Some(app_exec)) = (name, exec) {
        // 移除 Exec 字段中的占位符
        let clean_exec = app_exec
            .replace("%f", "")
            .replace("%u", "")
            .replace("%F", "")
            .replace("%U", "")
            .replace("%d", "")
            .replace("%D", "")
            .replace("%n", "")
            .replace("%N", "")
            .replace("%k", "")
            .replace("%v", "")
            .replace("%c", "")
            .trim()
            .to_string();

        Some(InstalledApp {
            name: app_name.clone(),
            display_name: app_name,
            path: clean_exec,
            icon_base64: None,
            publisher: comment,
            version: None,
        })
    } else {
        None
    }
}
