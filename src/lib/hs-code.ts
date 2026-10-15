/** HS 编码只处理用户输入格式，不猜测/补齐业务编码。 */
export function parseHsCode(
  raw: string,
  minLength: number,
  maxLength = 10,
): { code: string; error: string | null } {
  const code = raw.trim().replace(/[\s-]/g, '');
  if (!code) return { code, error: '请输入 HS 编码' };
  if (!/^[0-9]+$/.test(code)) return { code, error: 'HS 编码只能包含数字、空格或连字符' };
  if (code.length < minLength || code.length > maxLength) {
    const range = minLength === maxLength ? String(minLength) : minLength + '–' + maxLength;
    return { code, error: '请输入 ' + range + ' 位 HS 编码，不会自动补齐' };
  }
  return { code, error: null };
}

export function queryErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return '操作失败，请重试';
}

export function isDatabaseEmptyError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    if ((error as { code?: unknown }).code === 'DATABASE_EMPTY') return true;
  }
  return typeof error === 'string' && error.includes('DATABASE_EMPTY');
}
