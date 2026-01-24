/// 使用系统默认程序打开文件
#[tauri::command]
pub async fn open_file_with_default_app(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let result = Command::new("open")
            .arg(&file_path)
            .spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("执行 open 命令失败: {}", e)),
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let quoted_path = format!("\"{}\"", file_path);
        let result = Command::new("cmd")
            .args(["/c", "start", "", &quoted_path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("执行 start 命令失败: {}", e)),
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        use std::process::Stdio;
        
        let result = Command::new("xdg-open")
            .arg(&file_path)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn();
        
        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("执行 xdg-open 命令失败: {}", e)),
        }
    }
}
