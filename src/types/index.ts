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
  workingDirectory?: string;
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
export interface AltaMatchedItem {
  code: string;
  description: string;
  level: number;
  raw_text?: string | null;
  has_exceptions?: boolean | null;
}

export interface AltaQueryResult {
  code: string;
  status: 'forbidden' | 'safe';
  description: string;
  matched_items?: AltaMatchedItem[];
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
  countervailing_rate?: string; // 英国 GB 反补贴税率
  ni_anti_dumping_rate?: string | null; // 北爱 XI 反倾销
  ni_countervailing_rate?: string | null; // 北爱 XI 反补贴
  trade_remedy_details?: string | null; // GB/XI 企业代码、税率、条件及生效日期原始措施摘要
  rate_options?: string | null; // GB/XI 全部普通、条件及特殊用途税率选项
  last_updated?: string;
  uk_source_version?: string | null;
  ni_source_version?: string | null;
  uk_verified_at?: string | null;
  ni_verified_at?: string | null;
  uk_rate_status?: string | null;
  ni_rate_status?: string | null;
  similarity?: number;
}

/** 服务端数据变动摘要（更新前预览） */
export interface DataChanges {
  version: string | null;
  previous_version: string | null;
  summary: { added: number; removed: number; modified: number };
  changes: Array<{
    code: string;
    change_type: 'added' | 'removed' | 'modified';
    description: string;
    field: string | null;
    old_value: string | null;
    new_value: string | null;
  }>;
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
  data_changes?: DataChanges | null;
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

// 更新历史类型
/** 更新历史中一次更新的摘要 */
export interface UpdateSessionSummary {
  session_id: string;
  module: 'tax' | 'alta';
  update_type: 'full' | 'single';
  version_to: string | null;
  timestamp: string;
  change_count: number;
}

/** 单条变更明细 */
export interface UpdateChangeDetail {
  id: number;
  session_id: string;
  module: 'tax' | 'alta';
  update_type: 'full' | 'single';
  version_from: string | null;
  version_to: string | null;
  timestamp: string;
  code: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  change_type: 'added' | 'removed' | 'modified';
}

// Amazon 收益计算器类型（revcalpublic）
/** 商品信息（对应页面 Étape 1 结果行的尺寸与价格等字段） */
export interface RevCalProduct {
  asin: string;
  title: string;
  brand: string | null;
  image_url: string | null;
  product_link: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimension_unit: string | null;
  weight: number | null;
  weight_unit: string | null;
  price: number | null;
  currency: string | null;
  fee_category: string | null;
  sales_rank: number | null;
  sales_rank_context: string | null;
  reviews_count: number | null;
  rating: string | null;
  offer_count: number | null;
  /** 官方合并格式尺寸串（Rust 侧生成） */
  dimensions_official: string;
}

/** 单个查询码的结果 */
export interface RevCalQueryResult {
  code: string;
  products: RevCalProduct[];
  error: string | null;
}

/** 批量查询汇总 */
export interface RevCalBatchResult {
  total: number;
  success: number;
  failed: number;
  results: RevCalQueryResult[];
}

/** 批量查询进度事件 */
export interface RevCalBatchProgress {
  current: number;
  total: number;
  code: string;
  status: string;
}
