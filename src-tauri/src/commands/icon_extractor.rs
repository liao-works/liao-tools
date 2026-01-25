use crate::commands::error::CommandError;
use log::info;
use std::path::Path;
use std::process::Command;

/// 从可执行文件提取图标并转换为 Base64 编码的 PNG
#[tauri::command]
pub fn extract_icon(executable_path: String) -> Result<Option<String>, CommandError> {
    // 处理路径中的转义字符
    let path = executable_path.replace("\\\\", "\\").replace("\\", "\\\\");
    info!("尝试提取图标: {}", path);

    let path_obj = Path::new(&path);

    if !path_obj.exists() {
        // 如果路径不存在，尝试使用原始路径
        let original_path = Path::new(&executable_path);
        if original_path.exists() {
            info!("使用原始路径提取图标: {}", executable_path);
            return extract_icon_by_path(&executable_path);
        }
        return Err(CommandError::new(
            format!("文件不存在: {}", executable_path),
            "FILE_NOT_FOUND"
        ));
    }

    extract_icon_by_path(&path)
}

/// 实际执行图标提取的函数
fn extract_icon_by_path(executable_path: &str) -> Result<Option<String>, CommandError> {

    // 根据平台调用不同的提取方法
    #[cfg(target_os = "windows")]
    {
        extract_icon_windows(executable_path)
    }

    #[cfg(target_os = "macos")]
    {
        extract_icon_macos(executable_path)
    }

    #[cfg(target_os = "linux")]
    {
        extract_icon_linux(executable_path)
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(None)
    }
}

/// Windows 平台图标提取 - 使用 PowerShell
#[cfg(target_os = "windows")]
fn extract_icon_windows(executable_path: &str) -> Result<Option<String>, CommandError> {
    use std::fs;

    // 创建临时 PNG 文件
    let temp_dir = std::env::temp_dir();
    let temp_png = temp_dir.join(format!(
        "icon_temp_{}.png",
        uuid::Uuid::new_v4().simple()
    ));

    // PowerShell 脚本：提取图标并保存为 PNG
    let ps_script = format!(
        r#"
        try {{
            Add-Type -AssemblyName System.Drawing
            $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('{}')
            if ($icon -ne $null) {{
                $bitmap = $icon.ToBitmap()
                $bitmap.Save('{}', [System.Drawing.Imaging.ImageFormat]::Png)
                $bitmap.Dispose()
                $icon.Dispose()
                Write-Output "SUCCESS"
            }} else {{
                Write-Output "FAILED"
            }}
        }} catch {{
            Write-Output "ERROR: $($_.Exception.Message)"
        }}
        "#,
        executable_path.replace("'", "''"),
        temp_png.display()
    );

    let result = Command::new("powershell")
        .args(["-NoProfile", "-NoLogo", "-Command", &ps_script])
        .output();

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);

            // 检查 PowerShell 是否成功
            if stdout.contains("SUCCESS") && temp_png.exists() {
                // 读取 PNG 文件
                match fs::read(&temp_png) {
                    Ok(png_data) => {
                        // 清理临时文件
                        let _ = fs::remove_file(&temp_png);

                        info!("成功提取图标，大小: {} 字节", png_data.len());

                        // 编码为 Base64
                        use base64::Engine;
                        let base64_string = base64::engine::general_purpose::STANDARD.encode(&png_data);

                        return Ok(Some(format!("data:image/png;base64,{}", base64_string)));
                    }
                    Err(e) => {
                        info!("读取 PNG 文件失败: {}", e);
                        // 清理临时文件
                        let _ = fs::remove_file(&temp_png);
                    }
                }
            } else {
                info!("PowerShell 提取图标失败: {}", stdout.trim());
                // 清理可能残留的临时文件
                let _ = fs::remove_file(&temp_png);
            }
        }
        Err(e) => {
            info!("PowerShell 执行失败: {}", e);
        }
    }

    Ok(None)
}

/// macOS 平台图标提取
#[cfg(target_os = "macos")]
fn extract_icon_macos(executable_path: &str) -> Result<Option<String>, CommandError> {
    use std::fs;

    let path = Path::new(&executable_path);

    // 检查是否是 .app 文件
    if !executable_path.contains(".app") {
        // 非 .app 文件暂时不提取图标
        return Ok(None);
    }

    // 从 .app 文件中查找 .icns 文件
    let resources_path = path.join("Contents/Resources");

    if let Ok(entries) = fs::read_dir(&resources_path) {
        for entry in entries.flatten() {
            let icon_path = entry.path();

            if let Some(ext) = icon_path.extension() {
                if ext == "icns" {
                    // 使用 sips 将 .icns 转换为 PNG
                    let temp_png = std::env::temp_dir().join(format!(
                        "icon_{}.png",
                        uuid::Uuid::new_v4().simple()
                    ));

                    let result = Command::new("sips")
                        .args([
                            "-s", "format", "png",
                            icon_path.to_str().unwrap(),
                            "--out", temp_png.to_str().unwrap()
                        ])
                        .output();

                    if result.is_ok() && temp_png.exists() {
                        if let Ok(png_data) = fs::read(&temp_png) {
                            // 清理临时文件
                            let _ = fs::remove_file(&temp_png);

                            use base64::Engine;
                            let base64_string = base64::engine::general_purpose::STANDARD.encode(&png_data);

                            return Ok(Some(format!("data:image/png;base64,{}", base64_string)));
                        }
                    }

                    // 如果 sips 失败，尝试下一个
                    continue;
                }
            }
        }
    }

    // 如果找不到 .icns，返回 None
    Ok(None)
}

/// Linux 平台图标提取
#[cfg(target_os = "linux")]
fn extract_icon_linux(executable_path: &str) -> Result<Option<String>, CommandError> {
    // Linux 图标提取比较复杂，暂时返回 None
    // TODO: 可以实现从 .desktop 文件中找到图标并返回路径
    Ok(None)
}
