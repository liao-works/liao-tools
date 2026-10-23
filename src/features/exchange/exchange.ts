/** 汇率换算纯函数与常用币种元数据（rates 约定以 CNY 为基准：1 CNY = rates[CODE] 单位 CODE） */

export interface CurrencyMeta {
  code: string;
  name: string;
  /** 部分小面值币种按官方惯例以 100 为单位展示（日元、韩元等） */
  unit?: 100;
}

/** 常用币种（顺序即汇率表展示顺序），来源覆盖 er-api / 欧央行 / 中间价的并集 */
export const COMMON_CURRENCIES: CurrencyMeta[] = [
  { code: 'USD', name: '美元' },
  { code: 'EUR', name: '欧元' },
  { code: 'JPY', name: '日元', unit: 100 },
  { code: 'HKD', name: '港币' },
  { code: 'GBP', name: '英镑' },
  { code: 'AUD', name: '澳大利亚元' },
  { code: 'CAD', name: '加拿大元' },
  { code: 'SGD', name: '新加坡元' },
  { code: 'CHF', name: '瑞士法郎' },
  { code: 'NZD', name: '新西兰元' },
  { code: 'KRW', name: '韩元', unit: 100 },
  { code: 'THB', name: '泰铢' },
  { code: 'MYR', name: '马来西亚林吉特' },
  { code: 'VND', name: '越南盾', unit: 100 },
  { code: 'PHP', name: '菲律宾比索' },
  { code: 'IDR', name: '印尼盾', unit: 100 },
  { code: 'INR', name: '印度卢比' },
  { code: 'RUB', name: '俄罗斯卢布' },
  { code: 'AED', name: '阿联酋迪拉姆' },
  { code: 'SAR', name: '沙特里亚尔' },
  { code: 'BRL', name: '巴西雷亚尔' },
  { code: 'MXN', name: '墨西哥比索' },
  { code: 'TWD', name: '新台币' },
  { code: 'TRY', name: '土耳其里拉' },
  { code: 'ZAR', name: '南非兰特' },
  { code: 'PLN', name: '波兰兹罗提' },
  { code: 'SEK', name: '瑞典克朗' },
  { code: 'DKK', name: '丹麦克朗' },
  { code: 'NOK', name: '挪威克朗' },
  { code: 'HUF', name: '匈牙利福林' },
];

export const BASE_CURRENCY: CurrencyMeta = { code: 'CNY', name: '人民币' };

/** 换算器可选币种：人民币 + 常用币种 */
export const SELECTABLE_CURRENCIES: CurrencyMeta[] = [BASE_CURRENCY, ...COMMON_CURRENCIES];

export function currencyMeta(code: string): CurrencyMeta {
  const upper = code.toUpperCase();
  return (
    SELECTABLE_CURRENCIES.find((item) => item.code === upper) ?? { code: upper, name: upper }
  );
}

/** 展示计价单位：日元/韩元等按 100，其余按 1 */
export function displayUnit(code: string): number {
  return currencyMeta(code).unit ?? 1;
}

/** 1 单位 from 币兑 to 币；任一币种缺失时返回 null */
export function rateOf(from: string, to: string, rates: Record<string, number>): number | null {
  const base = rates[from.toUpperCase()];
  const target = rates[to.toUpperCase()];
  if (!base || !target || !Number.isFinite(base) || !Number.isFinite(target)) return null;
  return target / base;
}

/** 金额换算；无法换算时返回 null */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number | null {
  if (!Number.isFinite(amount)) return null;
  const rate = rateOf(from, to, rates);
  return rate == null ? null : amount * rate;
}

/** 汇率展示格式：大数值 2 位小数，常规 4 位，极小面值保留 6 位有效数字 */
export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(2);
  if (abs >= 0.01) return value.toFixed(4);
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

/** 本地时区的今天（YYYY-MM-DD），用于判断汇率数据是否过期 */
export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
