import type { TaxTariff, TaxVersionInfo } from '@/types';
import { delay, randomInt } from './utils';

// Mock税率数据
const mockTariffs: TaxTariff[] = [
  {
    code: '0101210000',
    rate: '0%',
    url: 'https://www.trade-tariff.service.gov.uk/commodities/0101210000',
    northIrelandRate: '0%',
    northIrelandUrl: 'https://www.trade-tariff.service.gov.uk/xi/commodities/0101210000',
    description: 'Pure-bred breeding horses',
  },
  {
    code: '0201100000',
    rate: '12.8% + £2.30/kg',
    url: 'https://www.trade-tariff.service.gov.uk/commodities/0201100000',
    northIrelandRate: '10.9% + €1.90/kg',
    northIrelandUrl: 'https://www.trade-tariff.service.gov.uk/xi/commodities/0201100000',
    description: 'Carcasses and half-carcasses of bovine animals, fresh or chilled',
  },
  {
    code: '0301110000',
    rate: '0%',
    url: 'https://www.trade-tariff.service.gov.uk/commodities/0301110000',
    northIrelandRate: '0%',
    northIrelandUrl: 'https://www.trade-tariff.service.gov.uk/xi/commodities/0301110000',
    description: 'Ornamental fish, freshwater',
  },
  {
    code: '0401200000',
    rate: '£0.19/kg',
    url: 'https://www.trade-tariff.service.gov.uk/commodities/0401200000',
    northIrelandRate: '€0.16/kg',
    northIrelandUrl: 'https://www.trade-tariff.service.gov.uk/xi/commodities/0401200000',
    description: 'Milk and cream, not concentrated, not containing sugar',
  },
  {
    code: '0501000000',
    rate: '0%',
    url: 'https://www.trade-tariff.service.gov.uk/commodities/0501000000',
    northIrelandRate: '0%',
    northIrelandUrl: 'https://www.trade-tariff.service.gov.uk/xi/commodities/0501000000',
    description: 'Human hair, unworked',
  },
];

// Mock版本信息
export const mockVersionInfo: TaxVersionInfo = {
  local: {
    version: 'v1.0.0',
    records: 5000,
    date: '2024-01-10',
  },
  remote: {
    version: 'v1.0.1',
    records: 5100,
    date: '2024-01-15',
  },
  has_update: true,
  changelog: [
    { date: '2024-01-15', message: '新增100条税率数据' },
    { date: '2024-01-14', message: '修复北爱尔兰URL错误' },
    { date: '2024-01-13', message: '更新部分商品描述' },
  ],
};

/**
 * 模拟精确查询
 */
export const mockExactSearch = async (code: string): Promise<TaxTariff | null> => {
  await delay(500);

  const found = mockTariffs.find(t => t.code === code);
  return found || null;
};

/**
 * 模拟模糊查询
 */
export const mockFuzzySearch = async (code: string): Promise<TaxTariff[]> => {
  await delay(700);

  // 查找包含输入code的所有记录
  const results = mockTariffs
    .filter(t => t.code.includes(code) || t.description?.toLowerCase().includes(code.toLowerCase()))
    .map(t => ({
      ...t,
      similarity: Math.random() * 0.3 + 0.7, // 0.7-1.0之间的相似度
    }))
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  return results;
};

/**
 * 模拟批量查询
 */
export const mockBatchQuery = async (
  _file: File,
  onProgress?: (current: number, total: number) => void
): Promise<{ results: TaxTariff[]; errors: string[] }> => {
  const total = 50;

  // 模拟进度
  for (let i = 0; i <= total; i++) {
    if (onProgress) {
      onProgress(i, total);
    }
    await delay(50);
  }

  return {
    results: mockTariffs,
    errors: ['第5行：编码格式不正确', '第12行：编码不存在'],
  };
};

/**
 * 模拟检查更新
 */
export const mockCheckUpdate = async (): Promise<TaxVersionInfo> => {
  await delay(1000);
  return mockVersionInfo;
};

/**
 * 模拟下载更新
 */
export const mockDownloadUpdate = async (
  onProgress?: (downloaded: number, total: number, percentage: number) => void
): Promise<boolean> => {
  const total = 10485760; // 10MB
  const steps = 100;

  for (let i = 0; i <= steps; i++) {
    const downloaded = (total * i) / steps;
    const percentage = (i / steps) * 100;

    if (onProgress) {
      onProgress(downloaded, total, percentage);
    }

    await delay(30);
  }

  return true;
};

/**
 * 模拟自动更新单条记录
 */
export const mockAutoUpdate = async (
  code: string,
  _ukUrl: string,
  _niUrl?: string
): Promise<{
  success: boolean;
  updated: boolean;
  oldData: TaxTariff;
  newData: TaxTariff;
  message: string;
}> => {
  await delay(2000);

  const oldData = mockTariffs.find(t => t.code === code) || mockTariffs[0];
  const newData = {
    ...oldData,
    rate: `${randomInt(0, 20)}%`,
    northIrelandRate: `${randomInt(0, 18)}%`,
  };

  const updated = oldData.rate !== newData.rate;

  return {
    success: true,
    updated,
    oldData,
    newData,
    message: updated ? '税率已更新' : '税率无变化',
  };
};
