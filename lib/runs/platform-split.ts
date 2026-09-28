import { formatCount } from '../copy/count';

export interface ReportTotal {
  // "job/module/platform" (spec section 5.3).
  key: string;
  total: number;
}

const platformOf = (key: string): string => key.slice(key.lastIndexOf('/') + 1);

// Design v4 item 18 (TPKit.platformSplit): the per-report block's header side. Totals are summed
// per platform in the order platforms first appear, and always shown with their counts.
export function platformSplit(reports: readonly ReportTotal[]): string {
  const totals = new Map<string, number>();
  for (const { key, total } of reports) {
    const platform = platformOf(key);
    totals.set(platform, (totals.get(platform) ?? 0) + total);
  }
  return [...totals].map(([platform, total]) => `${platform} ${formatCount(total)}`).join(' · ');
}
