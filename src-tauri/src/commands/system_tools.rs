use crate::commands::error::CommandError;
use crate::models::system_tools::{LaunchToolResult, SystemTool};
use log::{error, info};
use std::process::Command;

/// Windows 工具配置
#[cfg(target_os = "windows")]
fn get_windows_tools() -> Vec<SystemTool> {
    vec![
        SystemTool {
            id: "calculator".to_string(),
            name: "计算器".to_string(),
            description: "执行基本和科学计算".to_string(),
            icon: "calculator".to_string(),
            category: "utility".to_string(),
            platform: vec!["windows".to_string()],
            enabled: true,
            command: "calc.exe".to_string(),
            args: None,
            hotkey: Some("Ctrl+Alt+C".to_string()),
        },
        SystemTool {
            id: "notepad".to_string(),
            name: "记事本".to_string(),
            description: "文本编辑器".to_string(),
            icon: "notepad".to_string(),
            category: "utility".to_string(),
            platform: vec!["windows".to_string()],
            enabled: true,
            command: "notepad.exe".to_string(),
            args: None,
            hotkey: Some("Ctrl+Alt+N".to_string()),
        },
        SystemTool {
            id: "paint".to_string(),
            name: "画图".to_string(),
            description: "图像编辑和绘制".to_string(),
            icon: "paintbrush".to_string(),
            category: "media".to_string(),
            platform: vec!["windows".to_string()],
            enabled: true,
            command: "mspaint.exe".to_string(),
            args: None,
            hotkey: None,
        },
        SystemTool {
            id: "taskmgr".to_string(),
            name: "任务管理器".to_string(),
            description: "监控和管理系统进程".to_string(),
            icon: "activity".to_string(),
            category: "system".to_string(),
            platform: vec!["windows".to_string()],
            enabled: true,
            command: "taskmgr.exe".to_string(),
            args: None,
            hotkey: Some("Ctrl+Shift+Esc".to_string()),
        },
        SystemTool {
            id: "settings".to_string(),
            name: "系统设置".to_string(),
            description: "Windows 设置".to_string(),
            icon: "settings".to_string(),
            category: "system".to_string(),
            platform: vec!["windows".to_string()],
            enabled: true,
            command: "cmd".to_string(),
            args: Some(vec!["/c".to_string(), "start".to_string(), "ms-settings:".to_string()]),
            hotkey: Some("Win+I".to_string()),
        },
        SystemTool {
            id: "explorer".to_string(),
            name: "文件资源管理器".to_string(),
            description: "浏览文件和文件夹".to_string(),
            icon: "folder".to_string(),
            category: "system".to_string(),
            platform: vec!["windows".to_string()],
            enabled: true,
            command: "explorer.exe".to_string(),
            args: None,
            hotkey: Some("Win+E".to_string()),
        },
    ]
}

/// macOS 工具配置
#[cfg(target_os = "macos")]
fn get_macos_tools() -> Vec<SystemTool> {
    vec![
        SystemTool {
            id: "calculator".to_string(),
            name: "计算器".to_string(),
            description: "执行基本和科学计算".to_string(),
            icon: "calculator".to_string(),
            category: "utility".to_string(),
            platform: vec!["macos".to_string()],
            enabled: true,
            command: "open".to_string(),
            args: Some(vec!["-a".to_string(), "Calculator".to_string()]),
            hotkey: None,
        },
        SystemTool {
            id: "notes".to_string(),
            name: "备忘录".to_string(),
            description: "记录笔记和想法".to_string(),
            icon: "notepad".to_string(),
            category: "utility".to_string(),
            platform: vec!["macos".to_string()],
            enabled: true,
            command: "open".to_string(),
            args: Some(vec!["-a".to_string(), "Notes".to_string()]),
            hotkey: None,
        },
        SystemTool {
            id: "system-preferences".to_string(),
            name: "系统偏好设置".to_string(),
            description: "macOS 设置".to_string(),
            icon: "settings".to_string(),
            category: "system".to_string(),
            platform: vec!["macos".to_string()],
            enabled: true,
            command: "open".to_string(),
            args: Some(vec!["System Preferences".to_string()]),
            hotkey: None,
        },
        SystemTool {
            id: "activity-monitor".to_string(),
            name: "活动监视器".to_string(),
            description: "监控系统资源使用".to_string(),
            icon: "activity".to_string(),
            category: "system".to_string(),
            platform: vec!["macos".to_string()],
            enabled: true,
            command: "open".to_string(),
            args: Some(vec!["-a".to_string(), "Activity Monitor".to_string()]),
            hotkey: None,
        },
        SystemTool {
            id: "finder".to_string(),
            name: "访达".to_string(),
            description: "浏览文件和文件夹".to_string(),
            icon: "folder".to_string(),
            category: "system".to_string(),
            platform: vec!["macos".to_string()],
            enabled: true,
            command: "open".to_string(),
            args: Some(vec!["-a".to_string(), "Finder".to_string()]),
            hotkey: None,
        },
    ]
}

/// Linux 工具配置
#[cfg(target_os = "linux")]
fn get_linux_tools() -> Vec<SystemTool> {
    vec![
        SystemTool {
            id: "calculator".to_string(),
            name: "计算器".to_string(),
            description: "执行基本计算".to_string(),
            icon: "calculator".to_string(),
            category: "utility".to_string(),
            platform: vec!["linux".to_string()],
            enabled: true,
            command: "gnome-calculator".to_string(),
            args: None,
            hotkey: None,
        },
        SystemTool {
            id: "settings".to_string(),
            name: "系统设置".to_string(),
            description: "系统配置".to_string(),
            icon: "settings".to_string(),
            category: "system".to_string(),
            platform: vec!["linux".to_string()],
            enabled: true,
            command: "gnome-control-center".to_string(),
            args: None,
            hotkey: None,
        },
        SystemTool {
            id: "file-manager".to_string(),
            name: "文件管理器".to_string(),
            description: "浏览文件".to_string(),
            icon: "folder".to_string(),
            category: "system".to_string(),
            platform: vec!["linux".to_string()],
            enabled: true,
            command: "nautilus".to_string(),
            args: None,
            hotkey: None,
        },
    ]
}

/// 获取当前平台的工具列表
#[tauri::command]
pub fn get_system_tools() -> Vec<SystemTool> {
    #[cfg(target_os = "windows")]
    return get_windows_tools();

    #[cfg(target_os = "macos")]
    return get_macos_tools();

    #[cfg(target_os = "linux")]
    return get_linux_tools();
}

/// 启动系统工具
#[tauri::command]
pub fn launch_system_tool(tool_id: String) -> Result<LaunchToolResult, CommandError> {
    info!("启动系统工具: {}", tool_id);

    // 获取工具列表
    let tools = get_system_tools();

    // 查找指定的工具
    let tool = tools
        .iter()
        .find(|t| t.id == tool_id)
        .ok_or_else(|| {
            error!("工具未找到: {}", tool_id);
            CommandError::new(format!("工具 {} 未找到", tool_id), "NOT_FOUND")
        })?;

    // 检查工具是否启用
    if !tool.enabled {
        error!("工具未启用: {}", tool.name);
        return Err(CommandError::new(
            format!("工具 {} 未启用", tool.name),
            "DISABLED",
        ));
    }

    // 执行启动命令
    let result = if let Some(args) = &tool.args {
        Command::new(&tool.command).args(args).spawn()
    } else {
        Command::new(&tool.command).spawn()
    };

    match result {
        Ok(_) => {
            info!("工具启动成功: {}", tool.name);
            Ok(LaunchToolResult {
                success: true,
                tool_id: tool.id.clone(),
                message: format!("{} 启动成功", tool.name),
                error: None,
            })
        }
        Err(e) => {
            error!("工具启动失败: {} - {}", tool.name, e);
            Err(CommandError::new(
                format!("启动 {} 失败: {}", tool.name, e),
                "LAUNCH_ERROR",
            ))
        }
    }
}

/// 检查工具是否可用
#[tauri::command]
pub fn check_tool_available(tool_id: String) -> bool {
    let tools = get_system_tools();

    if let Some(_tool) = tools.iter().find(|t| t.id == tool_id) {
        // 简单实现：如果工具在列表中且启用，就认为可用
        // 更精确的实现可以检查命令是否存在于系统路径中
        true
    } else {
        false
    }
}
