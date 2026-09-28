// pct: a percentage. int: a count. sec: one test's duration. dur: a whole run's duration.
export type TrendFormat = 'pct' | 'int' | 'sec' | 'dur';

const grouped = new Intl.NumberFormat('en-US');

// Exact is for values read as figures (value labels, tooltip, table); axis ticks drop trailing
// zeros. Both follow the design's tp-charts.js.
export function formatTrendValue(value: number, format: TrendFormat, exact = false): string {
  switch (format) {
    case 'pct':
      return `${exact ? value.toFixed(1) : String(Math.round(value * 10) / 10)}%`;
    case 'sec':
      return `${exact ? value.toFixed(2) : String(Number(value.toFixed(2)))} s`;
    case 'dur':
      return `${Math.round(value)} s`;
    case 'int':
      return grouped.format(Math.round(value));
  }
}
