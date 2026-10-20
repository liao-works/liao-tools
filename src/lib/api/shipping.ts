import { invoke } from '@tauri-apps/api/core';

export interface RecognizedCarrier {
  carrierCode: string;
  carrierName: string;
  carrierNameEn: string | null;
  confidence: number | null;
  jumpUrl: string | null;
  logo: string | null;
}

export interface RemoteTrackEvent {
  sdate: string | null;
  place: string | null;
  intro: string | null;
}

export interface ShippingLookupResult {
  number: string;
  category: string;
  carriers: RecognizedCarrier[];
  trackEvents: RemoteTrackEvent[];
}

export const shippingApi = {
  /** 在线识别承运商并查询物流巴巴系统内轨迹；失败时抛错，由调用方回退本地识别 */
  async lookup(number: string, category: 'sea' | 'air' | 'express'): Promise<ShippingLookupResult> {
    return invoke<ShippingLookupResult>('shipping_track_lookup', { number, category });
  },
};
