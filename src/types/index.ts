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
  northIrelandRate: string;
  northIrelandUrl: string;
  description?: string;
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
  hasUpdate: boolean;
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
