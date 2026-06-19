import { invoke } from '@tauri-apps/api/core';
import type { UpdateSessionSummary, UpdateChangeDetail } from '@/types';

export const updateHistoryApi = {
  /** 查询更新历史列表（module 可选，限定 50 条） */
  async listSessions(module?: 'tax' | 'alta'): Promise<UpdateSessionSummary[]> {
    return invoke<UpdateSessionSummary[]>('get_update_sessions', {
      module,
      limit: 50,
    });
  },

  /** 查询某次更新的明细 */
  async getDetails(sessionId: string): Promise<UpdateChangeDetail[]> {
    return invoke<UpdateChangeDetail[]>('get_update_details', { sessionId });
  },

  /** 清理历史（before 为 ISO 时间则清理更早，否则清空全部） */
  async clear(before?: string): Promise<number> {
    return invoke<number>('clear_update_history', { before });
  },
};
