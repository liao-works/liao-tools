use serde::{Deserialize, Serialize};

/// 用户自定义工具
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserTool {
    pub id: Option<i64>,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,               // Base64 编码的图标数据
    pub executable_path: String,            // 程序路径
    pub arguments: Option<String>,          // 命令参数
    pub working_directory: Option<String>,  // 工作目录
    pub category: String,                   // 分类
    pub order: i32,                         // 排序序号
    pub hotkey: Option<String>,             // 自定义快捷键
    pub enabled: bool,                      // 是否启用
    pub platform: String,                   // 平台标识
    pub created_at: String,                 // 创建时间
    pub updated_at: String,                 // 更新时间
    pub last_launched_at: Option<String>,   // 最后启动时间
    pub launch_count: i32,                  // 启动次数
}

/// 最近使用的程序
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProgram {
    pub path: String,
    pub name: String,
    pub last_used: String,
    pub usage_count: i32,
}

/// 创建用户工具请求
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserToolRequest {
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub executable_path: String,
    pub arguments: Option<String>,
    pub working_directory: Option<String>,
    pub category: String,
    pub hotkey: Option<String>,
}

/// 更新用户工具请求
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserToolRequest {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub executable_path: String,
    pub arguments: Option<String>,
    pub working_directory: Option<String>,
    pub category: String,
    pub hotkey: Option<String>,
    pub enabled: bool,
}
