/** Display actual stored tariff data; never manufacture a verification state. */
export function displayedRate(value?: string | null): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '—';
}

/** A blank rate is simply missing; it is not an unverified duty rate. */
export function displayedRateStatus(
  rate: string | null | undefined,
  status?: string | null
): string | null {
  if (displayedRate(rate) === '—') return null;
  if (status === 'conditional') return '适用条件限制';
  if (status === 'stale') return '历史数据';
  return null;
}

export function rateNeedsAttention(
  rate: string | null | undefined,
  status?: string | null
): boolean {
  return displayedRateStatus(rate, status) !== null;
}
