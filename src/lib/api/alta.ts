import { invoke } from '@tauri-apps/api/core';
import { withUsage } from '@/lib/api/usage';

/// 类型定义
export interface AltaQueryResult {
  code: string;
  status: 'forbidden' | 'safe';
  description: string;
  matched_items?: MatchedItem[];
}

export interface MatchedItem {
  code: string;
  description: string;
  level: number;
}

export interface UpdateResult {
  success: boolean;
  items_count: number;
  message: string;
}

export interface AltaCheckUpdateResult {
  has_update: boolean;
  remote_count: number;
  local_count: number;
}

export interface DatabaseInfo {
  total_items: number;
  last_update?: string;
  db_size: number;
}

export interface ExcelStats {
  total: number;
  forbidden: number;
  safe: number;
  invalid: number;
  output_path: string;
}

export interface CommandError {
  message: string;
  code: string;
}

/// Alta API 服务
export const altaApi = {
  /**
   * 单个HS编码查询
   * @param hsCode HS编码
   * @param matchLength 匹配位数（4/6/8/undefined为完全匹配）
   */
  async querySingle(
    hsCode: string,
    matchLength?: number
  ): Promise<AltaQueryResult> {
    try {
      return await withUsage({ tool: 'alta', action: 'query', items: 1 },
        () => invoke<AltaQueryResult>('query_hs_code', {
        hsCode,
        matchLength,
      }));
    } catch (error) {
      console.error('查询失败:', error);
      throw error;
    }
  },

  /**
   * 更新Alta数据库
   */
  async updateDatabase(): Promise<UpdateResult> {
    try {
      return await invoke<UpdateResult>('update_alta_database');
    } catch (error) {
      console.error('更新数据库失败:', error);
      throw error;
    }
  },

  /**
   * 检查远程禁运清单是否有更新（只比对，不写库）
   */
  async checkForUpdate(): Promise<AltaCheckUpdateResult> {
    return invoke<AltaCheckUpdateResult>('check_alta_update');
  },

  /**
   * 批量处理Excel文件
   * @param inputPath 输入文件路径
   * @param matchLength 匹配位数
   */
  async batchProcess(
    inputPath: string,
    matchLength?: number
  ): Promise<ExcelStats> {
    try {
      return await withUsage(
        { tool: 'alta', action: 'process' },
        () => invoke<ExcelStats>('batch_process_excel', {
        inputPath,
        matchLength,
      }),
        (stats) => stats.total,
      );
    } catch (error) {
      console.error('批量处理失败:', error);
      throw error;
    }
  },

  /**
   * 获取数据库信息
   */
  async getDatabaseInfo(): Promise<DatabaseInfo> {
    try {
      return await invoke<DatabaseInfo>('get_database_info');
    } catch (error) {
      console.error('获取数据库信息失败:', error);
      throw error;
    }
  },

  /**
   * 下载Excel模板
   */
  async downloadTemplate(outputPath: string): Promise<void> {
    try {
      await invoke('download_template', { outputPath });
    } catch (error) {
      console.error('下载模板失败:', error);
      throw error;
    }
  },

  /**
   * 测试数据库连接
   */
  async testDatabaseConnection(): Promise<boolean> {
    try {
      return await invoke<boolean>('test_database_connection');
    } catch (error) {
      console.error('测试数据库连接失败:', error);
      return false;
    }
  },

  /**
   * 测试Alta网站连接
   */
  async testAltaConnection(): Promise<boolean> {
    try {
      return await invoke<boolean>('test_alta_connection');
    } catch (error) {
      console.error('测试Alta连接失败:', error);
      return false;
    }
  },
};
