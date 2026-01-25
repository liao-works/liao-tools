-- 创建用户自定义工具表
CREATE TABLE IF NOT EXISTS user_tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    executable_path TEXT NOT NULL,
    arguments TEXT,
    working_directory TEXT,
    category TEXT NOT NULL DEFAULT 'custom',
    "order" INTEGER NOT NULL DEFAULT 0,
    hotkey TEXT,
    enabled BOOLEAN NOT NULL DEFAULT 1,
    platform TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_launched_at TEXT,
    launch_count INTEGER NOT NULL DEFAULT 0
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_user_tools_order ON user_tools("order");
CREATE INDEX IF NOT EXISTS idx_user_tools_enabled ON user_tools(enabled);
CREATE INDEX IF NOT EXISTS idx_user_tools_category ON user_tools(category);

-- 创建最近使用的程序表
CREATE TABLE IF NOT EXISTS recent_programs (
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    last_used TEXT NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 1
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_recent_programs_last_used ON recent_programs(last_used);
