// pct: a percentage. int: a count. sec: one test's duration. dur: a whole run's duration.
export type TrendFormat = 'pct' | 'int' | 'sec' | 'dur';
// ms: the axis and values of a sec chart whose every value is under 10 ms, in milliseconds
// (design v8 item 48); TrendChart switches to it, callers never pass it.
export type ValueFormat = TrendFormat | 'ms';

const grouped = new Intl.NumberFormat('en-US');

// A percentage rounds down to its tenth, so 99.96% of tests passing never reads "100%" (decision
// 2026-09-29). The small allowance keeps binary error from dropping a tenth: 0.57 * 100 is
// 56.99999999999999, which is still 57%.
const tenthsDown = (value: number) => Math.floor(value * 10 + 1e-9) / 10;

// Exact is for values read as figures (value labels, tooltip, table); axis ticks drop trailing
// zeros. Both follow the design's tp-charts.js.
export function formatTrendValue(value: number, format: ValueFormat, exact = false): string {
  switch (format) {
    case 'pct': {
      const down = tenthsDown(value);
      return `${exact ? down.toFixed(1) : String(down)}%`;
    }
    // Durations are stored in whole ms: under 10 ms reads in whole ms, and a stored 0 means
    // under 1 ms (design v8 item 48, v9 item 8). A tick at 0 still reads "0 s".
    case 'sec':
      if (value < 0.01 && (exact || value > 0)) {
        return value < 0.0005 ? '<1 ms' : `${Math.round(value * 1000)} ms`;
      }
      return `${exact ? value.toFixed(2) : String(Number(value.toFixed(2)))} s`;
    case 'ms':
      return `${exact && value < 0.5 ? '<1' : Math.round(value)} ms`;
    case 'dur':
      return `${Math.round(value)} s`;
    case 'int':
      return grouped.format(Math.round(value));
  }
}
