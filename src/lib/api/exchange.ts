import { invoke } from '@tauri-apps/api/core';
import { withUsage } from './usage';

export interface ExchangeRates {
  base: string;
  /** 数据日期（数据源报价日） */
  date: string;
  /** 1 单位 base 币兑各币种，默认基准 CNY */
  rates: Record<string, number>;
  /** er-api / frankfurter / currency-api */
  source: string;
  fetchedAt: number;
}

export interface CnParityItem {
  /** 官方写法：USD/CNY、100JPY/CNY */
  pair: string;
  value: number;
}

export interface CnParity {
  date: string;
  items: CnParityItem[];
}

export const exchangeApi = {
  async latest(): Promise<ExchangeRates> {
    return withUsage({ tool: 'exchange', action: 'query' }, () =>
      invoke<ExchangeRates>('exchange_latest'),
    );
  },
  async cnParity(): Promise<CnParity> {
    return withUsage({ tool: 'exchange', action: 'query' }, () =>
      invoke<CnParity>('exchange_cn_parity'),
    );
  },
};
