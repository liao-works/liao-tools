// 系统工具类型
export interface SystemTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ToolCategory;
  platform: string[];
  enabled: boolean;
  command: string;
  args?: string[];
  hotkey?: string;
}

export type ToolCategory = 'system' | 'utility' | 'development' | 'media' | 'custom';

export interface LaunchToolResult {
  success: boolean;
  tool_id: string;
  message: string;
  error?: string;
}

// 用户自定义工具类型
export interface UserTool {
  id?: number;
  name: string;
  description: string;
  icon?: string;
  executablePath: string;
  arguments?: string;
  workingDirectory?: string;
  category: string;
  order: number;
  hotkey?: string;
  enabled: boolean;
  platform: string;
  createdAt: string;
  updatedAt: string;
  lastLaunchedAt?: string;
  launchCount: number;
}

// 最近使用的程序
export interface RecentProgram {
  path: string;
  name: string;
  lastUsed: string;
  usageCount: number;
}

// 显示工具（系统工具或自定义工具）
export interface DisplayTool {
  type: 'system' | 'custom';
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ToolCategory;
  platform: string[];
  enabled: boolean;
  command?: string;
  executablePath?: string;
  args?: string[];
  arguments?: string;
  hotkey?: string;
  order?: number;
  globalHotkey?: boolean;
}

// 创建用户工具请求
export interface CreateUserToolRequest {
  name: string;
  description: string;
  icon?: string;
  executablePath: string;
  arguments?: string;
  workingDirectory?: string;
  category: string;
  hotkey?: string;
}

// 更新用户工具请求
export interface UpdateUserToolRequest {
  id: number;
  name: string;
  description: string;
  icon?: string;
  executablePath: string;
  arguments?: string;
  workingDirectory?: string;
  category: string;
  hotkey?: string;
  enabled: boolean;
}

// Alta模块类型
export interface AltaQueryResult {
  code: string;
  status: 'forbidden' | 'safe';
  description: string;
  matched_items?: {
    code: string;
    description: string;
    level: number;
  }[];
}

export interface AltaBatchResult {
  total: number;
  forbidden: number;
  safe: number;
  invalid: number;
  output_path: string;
}

export interface AltaDbStats {
  total_items: number;
  last_update?: string;
  db_size: number;
}

export interface UpdateResult {
  success: boolean;
  items_count: number;
  message: string;
}

// Tax模块类型
export interface TaxTariff {
  code: string;
  rate: string;
  url: string;
  north_ireland_rate?: string;
  north_ireland_url?: string;
  northIrelandRate?: string; // 向后兼容
  northIrelandUrl?: string; // 向后兼容
  description?: string;
  other_rate?: string;
  anti_dumping_rate?: string; // 反倾销税率
  countervailing_rate?: string; // 反补贴税率
  last_updated?: string;
  similarity?: number;
}

export interface TaxVersionInfo {
  local: {
    version: string;
    records: number;
    date: string;
  };
  remote: {
    version: string;
    records: number;
    date: string;
  };
  has_update: boolean;
  hasUpdate?: boolean; // 向后兼容
  changelog?: {
    date: string;
    message: string;
  }[];
}

// Excel模块类型
export type ExcelProcessType = 'UPS' | 'DPD';

export interface ExcelProcessResult {
  success: boolean;
  outputPath: string;
  processedRows: number;
  errors: string[];
}

export interface ExcelProgress {
  current: number;
  total: number;
  percentage: number;
  message: string;
}
