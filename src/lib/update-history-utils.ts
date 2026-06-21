import type { UpdateChangeDetail } from '@/types';

/**
 * 对字段值做语义归一化，用于判断"字面不同但实质相同"。
 *
 * 税率类字段：去掉 % 和空格，parseFloat 去尾零后转回字符串（"5.0%" → "5" → "5"）。
 * 文本类字段：trim + 压缩内部空白 + lowercase。
 *
 * 注意：不改后端 diff 逻辑。后端按字节比较正确（"5.0%" != "5%" 在字节级为真），
 * 此处仅在显示层过滤"用户看起来没变"的行。
 */
export function normalizeFieldValue(value: string | null, field: string | null): string {
  if (value === null) return '';

  let normalized = value.trim();

  // 税率类字段：去掉 % 和空格，parseFloat 去尾零
  if (field === 'rate' || field === 'north_ireland_rate' || field === 'other_rate') {
    const cleaned = normalized.replace(/%/g, '').trim();
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      normalized = String(num);
    }
    // parseFloat 失败（如 "N/A"）则保留原 trimmed 值
  }

  // 统一空白：多空格/换行/制表符 → 单空格，再 lowercase
  normalized = normalized.replace(/\s+/g, ' ').toLowerCase();

  return normalized;
}

/**
 * 判断 modified 行是否"实质未变"。
 *
 * 仅对 change_type === 'modified' 且 field 非空的记录做判断。
 * added / removed 永远不过滤（它们本身就是有意义的变动）。
 */
export function isEffectivelyUnchanged(detail: UpdateChangeDetail): boolean {
  if (detail.change_type !== 'modified') return false;
  if (!detail.field) return false;

  return (
    normalizeFieldValue(detail.old_value, detail.field) ===
    normalizeFieldValue(detail.new_value, detail.field)
  );
}

/**
 * 对 modified 明细数组过滤掉实质未变行，保留 added/removed。
 */
export function filterUnchanged(details: UpdateChangeDetail[]): UpdateChangeDetail[] {
  return details.filter((d) => !isEffectivelyUnchanged(d));
}
