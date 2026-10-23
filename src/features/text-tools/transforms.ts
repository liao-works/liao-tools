/** 文本处理转换函数集合，行为迁移自外部「文本处理工具」（tkinter 单文件版）。 */

/** 优化格式：把换行替换为指定分隔符（分隔符为空时合并为一行） */
export function optimizeFormat(text: string, delimiter: string): string {
  return text.trim().replace(/\n/g, delimiter);
}

/** 分割元素：`key<TAB>value` 行整理为 `key: value`（key 去除 *；无 Tab 或字段为空的行跳过） */
export function splitElements(text: string): string {
  const result: string[] = [];
  for (const line of text.trim().split('\n')) {
    const tabAt = line.indexOf('\t');
    if (tabAt < 0) continue;
    const key = line.slice(0, tabAt).trim().replace(/\*/g, '');
    const value = line.slice(tabAt + 1).trim();
    if (!key || !value) continue;
    result.push(`${key}: ${value}`);
  }
  return result.join('\n');
}

/** Tab 竖排：含 Tab 的行按 Tab 拆分、滤掉空字段后竖排（其余行原样保留） */
export function verticalizeTabbed(text: string): string {
  return text.trim().split('\n').map((line) => {
    if (!line.includes('\t')) return line;
    return line.split('\t').map((part) => part.trim()).filter(Boolean).join('\n');
  }).join('\n');
}

/** 规整小数：`0.50` → `0.5`、`2.0` → `2`（JS 数字转字符串自带去尾零，等价于原程序的 rstrip 处理） */
function normalizeNumber(part: string): string {
  if (!part.includes('.')) return part;
  const value = Number.parseFloat(part);
  if (Number.isNaN(value)) return part;
  return String(value);
}

function formatDimensions(text: string, withCbm: boolean): string {
  return text.trim().split('\n').map((line) => {
    const parts = line.split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    const merged = parts.map(normalizeNumber).join('*');
    return withCbm ? `${merged}CBM` : merged;
  }).join('\n');
}

/** 尺寸合并 CBM：每行按空白拆字段、规整小数后用 * 连接，行尾加 CBM（如 `0.5 0.3 0.2` → `0.5*0.3*0.2CBM`） */
export function mergeDimensionsCbm(text: string): string {
  return formatDimensions(text, true);
}

/** 数字规整：同尺寸合并，但不追加 CBM 后缀 */
export function normalizeNumbers(text: string): string {
  return formatDimensions(text, false);
}

/** 标题格式：每段连续字母首字母大写、其余小写（与 Python str.title() 一致，撇号后也大写） */
export function toTitleCase(text: string): string {
  return text.trim().replace(/\p{L}+/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export function toUpperCase(text: string): string {
  return text.trim().toUpperCase();
}

export function toLowerCase(text: string): string {
  return text.trim().toLowerCase();
}

export interface NumberStats {
  count: number;
  sum: number;
  average: number | null;
}

/** 从文本提取数字并统计（正则与原程序一致：\d+(?:\.\d+)?） */
export function extractNumberStats(text: string): NumberStats {
  const matches = text.match(/\d+(?:\.\d+)?/g) ?? [];
  if (!matches.length) return { count: 0, sum: 0, average: null };
  const numbers = matches.map(Number);
  const sum = numbers.reduce((total, n) => total + n, 0);
  return { count: numbers.length, sum, average: sum / numbers.length };
}

/** 输出文本行数 */
export function countLines(text: string): number {
  return text ? text.split('\n').length : 0;
}
