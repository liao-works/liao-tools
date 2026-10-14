/**
 * Shared HS Code input validation. The UI rejects letters and punctuation
 * rather than silently changing a product code (backend semantics may differ).
 */
export type HsCodeValidation =
  | { ok: true; code: string }
  | { ok: false; message: string };

export function normalizeHsCode(raw: string): string {
  return raw.trim().replace(/[\s-]/g, '');
}

function validateDigits(raw: string): HsCodeValidation {
  const code = normalizeHsCode(raw);
  if (!/^\d+$/.test(code)) {
    return { ok: false, message: '商品编码只能包含数字、空格和连字符。' };
  }
  return { ok: true, code };
}

export function validateTaxHsCode(raw: string, fuzzy: boolean): HsCodeValidation {
  const result = validateDigits(raw);
  if (!result.ok) return result;
  const count = result.code.length;
  if (fuzzy ? count < 4 || count > 10 : count !== 10) {
    return {
      ok: false,
      message: fuzzy ? '模糊查询需要 4–10 位数字编码。' : '精确查询需要完整的 10 位数字商品编码。',
    };
  }
  return result;
}

export function validateAltaHsCode(raw: string, matchLength?: number): HsCodeValidation {
  const result = validateDigits(raw);
  if (!result.ok) return result;
  const count = result.code.length;
  const required = matchLength ?? 4;
  if (count < required || count > 10) {
    return {
      ok: false,
      message: matchLength != null
        ? `请输入至少 ${matchLength} 位、最多 10 位的数字编码。`
        : '请输入 4–10 位数字编码。',
    };
  }
  return result;
}
