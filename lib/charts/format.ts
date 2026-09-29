// pct: a percentage. int: a count. sec: one test's duration. dur: a whole run's duration.
export type TrendFormat = 'pct' | 'int' | 'sec' | 'dur';

const grouped = new Intl.NumberFormat('en-US');

// A percentage rounds down to its tenth, so 99.96% of tests passing never reads "100%" (decision
// 2026-09-29). The small allowance keeps binary error from dropping a tenth: 0.57 * 100 is
// 56.99999999999999, which is still 57%.
const tenthsDown = (value: number) => Math.floor(value * 10 + 1e-9) / 10;

// Exact is for values read as figures (value labels, tooltip, table); axis ticks drop trailing
// zeros. Both follow the design's tp-charts.js.
export function formatTrendValue(value: number, format: TrendFormat, exact = false): string {
  switch (format) {
    case 'pct': {
      const down = tenthsDown(value);
      return `${exact ? down.toFixed(1) : String(down)}%`;
    }
    case 'sec':
      return `${exact ? value.toFixed(2) : String(Number(value.toFixed(2)))} s`;
    case 'dur':
      return `${Math.round(value)} s`;
    case 'int':
      return grouped.format(Math.round(value));
  }
}
