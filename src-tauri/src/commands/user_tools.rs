use crate::commands::error::CommandError;
use crate::models::system_tools::LaunchToolResult;
use crate::models::user_tools::{CreateUserToolRequest, RecentProgram, UpdateUserToolRequest, UserTool};
use log::{error, info};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;
use std::process::Command;

/// 显示工具（用于前端，包含类型标识）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayTool {
    pub tool_type: String,  // "system" 或 "custom"
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub category: String,
    pub platform: Vec<String>,
    pub enabled: bool,
    pub command: Option<String>,
    pub executable_path: Option<String>,
    pub args: Option<Vec<String>>,
    pub arguments: Option<String>,
    pub hotkey: Option<String>,
    pub order: Option<i32>,
}

/// 数据库路径
fn get_db_path() -> Result<PathBuf, CommandError> {
    // 获取应用数据目录
    let data_dir = dirs::data_local_dir()
        .ok_or_else(|| CommandError::new("无法获取数据目录", "NO_DATA_DIR"))?;

    let app_dir = data_dir.join("liao-tools");
    Ok(app_dir.join("user_tools.db"))
}

/// 初始化数据库连接
fn get_connection() -> Result<Connection, CommandError> {
    let db_path = get_db_path()?;

    // 确保目录存在
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| CommandError::new(format!("无法创建目录: {}", e), "IO_ERROR"))?;
    }

    let conn = Connection::open(db_path)
        .map_err(|e| CommandError::new(format!("无法打开数据库: {}", e), "DB_ERROR"))?;

    // 启用外键约束
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| CommandError::new(format!("数据库配置失败: {}", e), "DB_ERROR"))?;

    // 创建表
    init_database(&conn)?;

    Ok(conn)
}

/// 初始化数据库表
fn init_database(conn: &Connection) -> Result<(), CommandError> {
    // 读取迁移文件
    let migration_sql = include_str!("../../migrations/002_create_user_tools.sql");

    conn.execute_batch(migration_sql)
        .map_err(|e| CommandError::new(format!("数据库迁移失败: {}", e), "DB_ERROR"))?;

    Ok(())
}

/// 获取当前平台标识
fn get_platform() -> &'static str {
    #[cfg(target_os = "windows")]
    return "windows";

    #[cfg(target_os = "macos")]
    return "macos";

    #[cfg(target_os = "linux")]
    return "linux";

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return "unknown";
}

/// 获取所有工具（系统工具 + 自定义工具）
#[tauri::command]
pub fn get_all_tools() -> Result<Vec<DisplayTool>, CommandError> {
    info!("获取所有工具 - 开始");

    // 先获取系统工具
    let system_tools = super::system_tools::get_system_tools();
    info!("获取到 {} 个系统工具", system_tools.len());

    // 转换系统工具为 DisplayTool
    let system_display_tools: Vec<DisplayTool> = system_tools
        .into_iter()
        .map(|tool| {
            info!("处理系统工具: {}", tool.name);
            DisplayTool {
                tool_type: "system".to_string(),
                id: tool.id.clone(),
                name: tool.name,
                description: tool.description,
                icon: tool.icon,
                category: tool.category,
                platform: tool.platform,
                enabled: tool.enabled,
                command: Some(tool.command),
                executable_path: None,
                args: tool.args,
                arguments: None,
                hotkey: tool.hotkey,
                order: None,
            }
        })
        .collect();

    // 尝试获取自定义工具
    let user_tools = match get_connection() {
        Ok(conn) => {
            info!("数据库连接成功，查询自定义工具");
            info!("当前平台: {}", get_platform());

            // 先查询总数
            let count: i64 = match conn.query_row(
                "SELECT COUNT(*) FROM user_tools WHERE platform = ?1",
                &[get_platform()],
                |row| row.get(0)
            ) {
                Ok(c) => c,
                Err(e) => {
                    info!("查询总数失败: {}", e);
                    0
                }
            };
            info!("数据库中自定义工具总数: {}", count);

            let mut stmt = match conn.prepare(
                "SELECT id, name, description, icon, executable_path, arguments,
                        working_directory, category, \"order\", hotkey, enabled, platform
                 FROM user_tools
                 WHERE platform = ?1 AND enabled = 1
                 ORDER BY \"order\" ASC",
            ) {
                Ok(s) => s,
                Err(e) => {
                    info!("准备查询失败: {}", e);
                    return Ok(system_display_tools);
                }
            };

            let rows = match stmt.query_map([get_platform()], |row| {
                let id: i64 = row.get(0)?;
                info!("解析工具 ID: {}, 名称: {}", id, row.get::<_, String>(1).unwrap_or_default());
                let enabled_raw: i32 = row.get(10)?;
                Ok(DisplayTool {
                    tool_type: "custom".to_string(),
                    id: format!("custom_{}", id),
                    name: row.get(1)?,
                    description: row.get(2)?,
                    icon: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    category: row.get(7)?,
                    platform: vec![row.get(11)?],
                    enabled: enabled_raw == 1,
                    command: None,
                    executable_path: Some(row.get(4)?),
                    args: None,
                    arguments: row.get::<_, Option<String>>(5)?,
                    hotkey: row.get::<_, Option<String>>(9)?,
                    order: Some(row.get(8)?),
                })
            }) {
                Ok(r) => r,
                Err(e) => {
                    info!("查询自定义工具失败: {}", e);
                    return Ok(system_display_tools);
                }
            };

            match rows.collect::<Result<Vec<_>, _>>() {
                Ok(tools) => {
                    info!("获取到 {} 个自定义工具", tools.len());
                    tools
                }
                Err(e) => {
                    info!("解析自定义工具失败: {}", e);
                    vec![]
                }
            }
        }
        Err(e) => {
            info!("数据库连接失败: {}，返回仅系统工具", e);
            vec![]
        }
    };

    // 合并：先添加系统工具，再添加自定义工具
    let mut all_tools = Vec::new();
    all_tools.extend(system_display_tools);
    all_tools.extend(user_tools);

    info!("总共返回 {} 个工具", all_tools.len());
    Ok(all_tools)
}

/// 添加自定义工具
#[tauri::command]
pub fn add_user_tool(req: CreateUserToolRequest) -> Result<UserTool, CommandError> {
    info!("===== 开始添加自定义工具 =====");
    info!("工具名称: {}", req.name);
    info!("平台: {}", get_platform());

    let conn = get_connection()?;

    // 获取下一个 order 值
    let max_order: i32 = conn
        .query_row("SELECT COALESCE(MAX(\"order\"), 0) FROM user_tools", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);

    info!("当前最大 order 值: {}", max_order);

    let now = chrono::Utc::now().to_rfc3339();

    info!("开始插入数据库...");

    match conn.execute(
        "INSERT INTO user_tools (name, description, icon, executable_path, arguments,
                                  working_directory, category, \"order\", hotkey, enabled,
                                  platform, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            req.name,
            req.description,
            req.icon,
            req.executable_path,
            req.arguments,
            req.working_directory,
            req.category,
            max_order + 1,
            req.hotkey,
            true,
            get_platform(),
            now,
            now,
        ],
    ) {
        Ok(rows_affected) => {
            info!("数据库插入成功，影响行数: {}", rows_affected);
        }
        Err(e) => {
            error!("数据库插入失败: {}", e);
            return Err(CommandError::new(format!("插入失败: {}", e), "DB_ERROR"));
        }
    }

    // 获取插入的 ID
    let id = conn.last_insert_rowid();
    info!("新插入的 ID: {}", id);

    // 立即验证数据是否真的插入了
    match conn.query_row(
        "SELECT COUNT(*) FROM user_tools WHERE id = ?1",
        params![id],
        |row| row.get::<usize, i64>(0)
    ) {
        Ok(count) => {
            info!("验证：ID={} 的记录数: {}", id, count);
        }
        Err(e) => {
            error!("验证查询失败: {}", e);
        }
    }

    // 获取插入的工具
    let tool = get_tool_by_id(&conn, id)?;

    info!("===== 工具添加完成 =====");
    info!("返回工具: {} (id={:?})", tool.name, tool.id);
    Ok(tool)
}

/// 更新自定义工具
#[tauri::command]
pub fn update_user_tool(req: UpdateUserToolRequest) -> Result<UserTool, CommandError> {
    info!("更新自定义工具: id={}", req.id);

    let conn = get_connection()?;

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE user_tools
         SET name = ?1, description = ?2, icon = ?3, executable_path = ?4,
             arguments = ?5, working_directory = ?6, category = ?7,
             hotkey = ?8, enabled = ?9, updated_at = ?10
         WHERE id = ?11",
        params![
            req.name,
            req.description,
            req.icon,
            req.executable_path,
            req.arguments,
            req.working_directory,
            req.category,
            req.hotkey,
            req.enabled,
            now,
            req.id,
        ],
    )
    .map_err(|e| CommandError::new(format!("更新失败: {}", e), "DB_ERROR"))?;

    let tool = get_tool_by_id(&conn, req.id)?;

    info!("工具更新成功: id={}", req.id);
    Ok(tool)
}

/// 删除自定义工具
#[tauri::command]
pub fn delete_user_tool(id: i64) -> Result<(), CommandError> {
    info!("删除自定义工具: id={}", id);

    let conn = get_connection()?;

    conn.execute("DELETE FROM user_tools WHERE id = ?1", params![id])
        .map_err(|e| CommandError::new(format!("删除失败: {}", e), "DB_ERROR"))?;

    info!("工具删除成功: id={}", id);
    Ok(())
}

/// 批量更新工具排序
#[tauri::command]
pub fn reorder_tools(tool_ids: Vec<String>) -> Result<(), CommandError> {
    info!("批量更新工具排序: {} 个工具", tool_ids.len());

    let conn = get_connection()?;

    for (index, tool_id) in tool_ids.iter().enumerate() {
        // 解析工具 ID（格式可能是 "custom_123" 或 "calculator"）
        let id = if let Some(custom_id) = tool_id.strip_prefix("custom_") {
            custom_id.parse::<i64>().unwrap_or(0)
        } else {
            continue; // 跳过系统工具
        };

        conn.execute(
            "UPDATE user_tools SET \"order\" = ?1 WHERE id = ?2",
            params![index as i32, id],
        )
        .map_err(|e| CommandError::new(format!("更新排序失败: {}", e), "DB_ERROR"))?;
    }

    info!("工具排序更新成功");
    Ok(())
}

/// 启动自定义工具
#[tauri::command]
pub fn launch_custom_tool(id: i64) -> Result<LaunchToolResult, CommandError> {
    info!("启动自定义工具: id={}", id);

    let conn = get_connection()?;
    let tool = get_tool_by_id(&conn, id)?;

    // 更新启动统计
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE user_tools
         SET launch_count = launch_count + 1, last_launched_at = ?1
         WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| CommandError::new(format!("更新统计失败: {}", e), "DB_ERROR"))?;

    // 启动程序
    let result = launch_program(&tool.executable_path, &tool.arguments, &tool.working_directory);

    match result {
        Ok(_) => {
            // 记录到最近使用
            record_program_launch_internal(&conn, &tool.executable_path, &tool.name)?;

            info!("工具启动成功: {}", tool.name);
            Ok(LaunchToolResult {
                success: true,
                tool_id: id.to_string(),
                message: format!("{} 启动成功", tool.name),
                error: None,
            })
        }
        Err(e) => {
            error!("工具启动失败: {} - {}", tool.name, e);
            Err(e)
        }
    }
}

/// 启动程序
fn launch_program(
    path: &str,
    args: &Option<String>,
    working_dir: &Option<String>,
) -> Result<(), CommandError> {
    info!("启动程序 - 原始路径: {}", path);
    info!("启动程序 - 路径字节: {:?}", path.as_bytes());

    // 规范化路径（处理反斜杠问题）
    let normalized_path = path.replace('\\', "/");
    info!("启动程序 - 规范化路径: {}", normalized_path);

    // 尝试多种方式验证路径
    let path_obj = Path::new(path);
    let normalized_path_obj = Path::new(&normalized_path);

    info!("原始路径 exists(): {}", path_obj.exists());
    info!("规范化路径 exists(): {}", normalized_path_obj.exists());

    // 尝试 canonicalize 获取真实路径
    if let Ok(canonical) = path_obj.canonicalize() {
        info!("原始路径规范化后: {:?}", canonical);
        info!("规范化路径存在: {}", canonical.exists());
    }

    // 尝试原始路径和规范化路径
    let path_to_use = if path_obj.exists() {
        info!("使用原始路径");
        path
    } else if normalized_path_obj.exists() {
        info!("使用规范化路径");
        &normalized_path
    } else {
        // 即使 exists() 返回 false，也尝试直接启动
        // 因为某些情况下 exists() 可能不准确
        info!("路径验证失败，但仍尝试启动程序");
        path
    };

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        info!("尝试使用路径启动: {}", path_to_use);

        let mut cmd = Command::new(path_to_use);
        if let Some(arguments) = args {
            info!("命令参数: {}", arguments);
            // 简单的参数分割
            for arg in arguments.split_whitespace() {
                cmd.arg(arg);
            }
        }
        if let Some(dir) = working_dir {
            info!("工作目录: {}", dir);
            cmd.current_dir(dir);
        }

        match cmd.creation_flags(CREATE_NO_WINDOW).spawn() {
            Ok(_) => {
                info!("程序启动成功");
            }
            Err(e) => {
                error!("直接启动失败: {}, 错误类型: {:?}", e, e.kind());
                // 尝试使用 explorer 启动
                info!("尝试使用 explorer 启动");
                let explorer_result = Command::new("explorer")
                    .arg(path_to_use)
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();

                if let Err(explorer_err) = explorer_result {
                    error!("Explorer 启动也失败: {}", explorer_err);
                    return Err(CommandError::new(format!("启动失败: {}", e), "LAUNCH_ERROR"));
                } else {
                    info!("使用 explorer 启动成功");
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        cmd.arg(path_to_use);
        if let Some(arguments) = args {
            for arg in arguments.split_whitespace() {
                cmd.arg(arg);
            }
        }
        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        cmd.spawn()
            .map_err(|e| CommandError::new(format!("启动失败: {}", e), "LAUNCH_ERROR"))?;
    }

    #[cfg(target_os = "linux")]
    {
        let mut cmd = Command::new(path_to_use);
        if let Some(arguments) = args {
            for arg in arguments.split_whitespace() {
                cmd.arg(arg);
            }
        }
        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        cmd.spawn()
            .map_err(|e| CommandError::new(format!("启动失败: {}", e), "LAUNCH_ERROR"))?;
    }

    Ok(())
}

/// 根据ID获取工具
fn get_tool_by_id(conn: &Connection, id: i64) -> Result<UserTool, CommandError> {
    conn.query_row(
        "SELECT id, name, description, icon, executable_path, arguments,
                working_directory, category, \"order\", hotkey, enabled, platform,
                created_at, updated_at, last_launched_at, launch_count
         FROM user_tools WHERE id = ?1",
        params![id],
        |row| {
            Ok(UserTool {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
                executable_path: row.get(4)?,
                arguments: row.get(5)?,
                working_directory: row.get(6)?,
                category: row.get(7)?,
                order: row.get(8)?,
                hotkey: row.get(9)?,
                enabled: row.get(10)?,
                platform: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
                last_launched_at: row.get(14)?,
                launch_count: row.get(15)?,
            })
        },
    )
    .map_err(|e| CommandError::new(format!("查询失败: {}", e), "DB_ERROR"))
}

/// 记录程序启动（内部函数）
fn record_program_launch_internal(
    conn: &Connection,
    path: &str,
    name: &str,
) -> Result<(), CommandError> {
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO recent_programs (path, name, last_used, usage_count)
         VALUES (?1, ?2, ?3, 1)
         ON CONFLICT(path) DO UPDATE SET
            last_used = ?3,
            usage_count = usage_count + 1",
        params![path, name, now],
    )
    .map_err(|e| CommandError::new(format!("记录失败: {}", e), "DB_ERROR"))?;

    Ok(())
}

/// 获取最近使用的程序
#[tauri::command]
pub fn get_recent_programs(limit: Option<i32>) -> Result<Vec<RecentProgram>, CommandError> {
    info!("获取最近使用的程序");

    let conn = get_connection()?;
    let limit = limit.unwrap_or(10);

    let mut stmt = conn
        .prepare(
            "SELECT path, name, last_used, usage_count
             FROM recent_programs
             ORDER BY last_used DESC
             LIMIT ?1",
        )
        .map_err(|e| CommandError::new(format!("准备查询失败: {}", e), "DB_ERROR"))?;

    let programs = stmt
        .query(params![limit])
        .map_err(|e| CommandError::new(format!("查询失败: {}", e), "DB_ERROR"))?
        .mapped(|row| {
            Ok(RecentProgram {
                path: row.get(0)?,
                name: row.get(1)?,
                last_used: row.get(2)?,
                usage_count: row.get(3)?,
            })
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::new(format!("数据转换失败: {}", e), "DB_ERROR"))?;

    Ok(programs)
}

/// 记录程序启动
#[tauri::command]
pub fn record_program_launch(path: String, name: String) -> Result<(), CommandError> {
    info!("记录程序启动: {} - {}", path, name);

    let conn = get_connection()?;
    record_program_launch_internal(&conn, &path, &name)?;

    Ok(())
}

