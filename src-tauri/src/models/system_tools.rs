use serde::{Deserialize, Serialize};

/// 系统工具数据模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemTool {
    /// 工具唯一标识
    pub id: String,
    /// 工具显示名称
    pub name: String,
    /// 工具描述
    pub description: String,
    /// Lucide 图标名称
    pub icon: String,
    /// 工具分类
    pub category: String,
    /// 支持的平台列表
    pub platform: Vec<String>,
    /// 是否启用
    pub enabled: bool,
    /// 启动命令
    pub command: String,
    /// 命令参数
    pub args: Option<Vec<String>>,
    /// 快捷键提示
    pub hotkey: Option<String>,
}

/// 工具启动结果
#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchToolResult {
    /// 是否成功
    pub success: bool,
    /// 工具ID
    pub tool_id: String,
    /// 结果消息
    pub message: String,
    /// 错误信息
    pub error: Option<String>,
}
