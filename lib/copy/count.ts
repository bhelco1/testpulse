const grouped = new Intl.NumberFormat('en-US');

export const formatCount = (count: number): string => grouped.format(count);

// Design v4 item 50 (TPKit.qty): every count noun is singular at exactly 1 ("1 test", "1 flow").
// Participles such as "1 failed" are not nouns and do not go through this.
export const qty = (count: number, unit: string): string =>
  `${formatCount(count)} ${unit}${count === 1 ? '' : 's'}`;
