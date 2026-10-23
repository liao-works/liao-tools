import { describe, expect, it } from 'vitest';
import {
  convert, currencyMeta, displayUnit, formatRate, localToday, rateOf,
} from './exchange';

// 与后端约定一致：rates 以 CNY 为基准（1 CNY = 0.1495 USD ≈ 1/6.689）
const RATES = { CNY: 1, USD: 0.149517, EUR: 0.1337, JPY: 23.53, KRW: 198.47 };

describe('rateOf', () => {
  it('1 美元兑人民币 = 1/rates.USD', () => {
    expect(rateOf('USD', 'CNY', RATES)).toBeCloseTo(1 / 0.149517, 12);
  });

  it('人民币兑美元直接取 rates.USD', () => {
    expect(rateOf('CNY', 'USD', RATES)).toBeCloseTo(0.149517, 12);
  });

  it('非基准币种之间按基准交叉换算', () => {
    expect(rateOf('USD', 'EUR', RATES)).toBeCloseTo(0.1337 / 0.149517, 12);
  });

  it('大小写不敏感', () => {
    expect(rateOf('usd', 'cny', RATES)).toBeCloseTo(1 / 0.149517, 12);
  });

  it('币种缺失返回 null', () => {
    expect(rateOf('USD', 'XXX', RATES)).toBeNull();
    expect(rateOf('GBP', 'CNY', RATES)).toBeNull();
  });
});

describe('convert', () => {
  it('默认方向：美元金额换算成人民币', () => {
    expect(convert(100, 'USD', 'CNY', RATES)).toBeCloseTo(100 / 0.149517, 6);
  });

  it('人民币换日元', () => {
    expect(convert(1, 'CNY', 'JPY', RATES)).toBeCloseTo(23.53, 12);
  });

  it('非法金额返回 null', () => {
    expect(convert(Number.NaN, 'USD', 'CNY', RATES)).toBeNull();
  });
});

describe('displayUnit', () => {
  it('日元、韩元按 100 计价', () => {
    expect(displayUnit('JPY')).toBe(100);
    expect(displayUnit('KRW')).toBe(100);
    expect(displayUnit('VND')).toBe(100);
  });

  it('常规币种按 1 计价', () => {
    expect(displayUnit('USD')).toBe(1);
    expect(displayUnit('CNY')).toBe(1);
    expect(displayUnit('XYZ')).toBe(1);
  });
});

describe('currencyMeta', () => {
  it('常用币种返回中文名', () => {
    expect(currencyMeta('USD')).toEqual({ code: 'USD', name: '美元' });
    expect(currencyMeta('JPY')).toEqual({ code: 'JPY', name: '日元', unit: 100 });
  });

  it('未知币种回退为代码本身', () => {
    expect(currencyMeta('XYZ')).toEqual({ code: 'XYZ', name: 'XYZ' });
  });
});

describe('formatRate', () => {
  it('大数值 2 位小数', () => {
    expect(formatRate(427.934567)).toBe('427.93');
  });

  it('常规汇率 4 位小数', () => {
    expect(formatRate(6.718041)).toBe('6.7180');
    expect(formatRate(0.149517)).toBe('0.1495');
  });

  it('0.01 到 1 之间的汇率 4 位小数', () => {
    expect(formatRate(0.042476)).toBe('0.0425');
    expect(formatRate(0.0424)).toBe('0.0424');
  });

  it('小于 0.01 的极小汇率保留 6 位有效数字', () => {
    expect(formatRate(0.000281)).toBe('0.000281');
    expect(formatRate(0.0045)).toBe('0.0045');
  });

  it('非法值显示占位符', () => {
    expect(formatRate(Number.NaN)).toBe('-');
  });
});

describe('localToday', () => {
  it('输出 YYYY-MM-DD 格式', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
