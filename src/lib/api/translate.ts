import { Channel, invoke } from '@tauri-apps/api/core';
import { withUsage } from '@/lib/api/usage';
import type {
  HistoryEntry,
  ProviderStatus,
  SaveProviderInput,
  TranslateEvent,
  TranslateRequest,
} from '@/types/translate';

export const translateApi = {
  async getStatus(): Promise<ProviderStatus> {
    return invoke<ProviderStatus>('translate_get_provider_status');
  },

  async saveProvider(input: SaveProviderInput): Promise<ProviderStatus> {
    return invoke<ProviderStatus>('translate_save_provider', { input });
  },

  /** 流式翻译：onEvent 依次收到 delta/done/error */
  async run(request: TranslateRequest, onEvent: (event: TranslateEvent) => void): Promise<void> {
    const channel = new Channel<TranslateEvent>();
    channel.onmessage = onEvent;
    await withUsage(
      { tool: 'translate', action: 'query', items: 1 },
      () => invoke('translate_run', { request, onEvent: channel }),
    );
  },

  async abort(): Promise<void> {
    return invoke('translate_abort');
  },

  async listHistory(limit = 100, offset = 0): Promise<HistoryEntry[]> {
    return invoke<HistoryEntry[]>('translate_list_history', { limit, offset });
  },

  async deleteHistory(id: number): Promise<void> {
    return invoke('translate_delete_history', { id });
  },

  async clearHistory(): Promise<number> {
    return invoke('translate_clear_history');
  },
};
