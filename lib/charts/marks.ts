// A TrendChart's marks (design/components.md TrendChart, "Marks"; design v9 item 13): an 8 px
// square at a failed or empty run and an amber diamond at a flaky one, at most one per run.

export type MarkStatus = 'fail' | 'flaky' | 'empty';

export interface TrendMark {
  index: number;
  status: MarkStatus;
  // The series of the platform that produced it; the first by default.
  series?: number;
}

export interface PlacedMark {
  readonly index: number;
  readonly status: MarkStatus;
  readonly series: number;
  readonly value: number;
}

const PRIORITY: Record<MarkStatus, number> = { fail: 3, flaky: 2, empty: 1 };

const valueAt = (values: readonly (number | null)[] | undefined, index: number) => {
  const value = values?.[index];
  return value === null || value === undefined ? null : value;
};

/**
 * One mark per run, failed or error over flaky over empty, the first given winning a tie. It sits
 * on its own series; where that series has no value, on the first series that has one; where none
 * has, there is no mark. Ordered by run.
 */
export function placeMarks(
  marks: readonly TrendMark[],
  series: readonly (readonly (number | null)[])[],
): PlacedMark[] {
  const chosen = new Map<number, TrendMark>();
  for (const mark of marks) {
    const held = chosen.get(mark.index);
    if (held === undefined || PRIORITY[mark.status] > PRIORITY[held.status]) {
      chosen.set(mark.index, mark);
    }
  }
  return [...chosen.values()]
    .sort((a, b) => a.index - b.index)
    .flatMap((mark): PlacedMark[] => {
      const own = mark.series ?? 0;
      const at =
        valueAt(series[own], mark.index) !== null
          ? own
          : series.findIndex((values) => valueAt(values, mark.index) !== null);
      const value = at === -1 ? null : valueAt(series[at], mark.index);
      return value === null ? [] : [{ index: mark.index, status: mark.status, series: at, value }];
    });
}
