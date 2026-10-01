import { describe, expect, it } from 'vitest';

import { placeMarks } from './marks';

// components.md TrendChart, "Marks" (design v9 item 13): at most one mark per run, failed or error
// over flaky over empty; it sits on the series of the platform that produced it, else on the
// first series with a value there, and with no value on any series there is no mark.
describe('placeMarks', () => {
  const jvm = [0.41, 0.4, null, 0.42];
  const ios = [0.63, null, 0.6, 0.62];

  it('puts a mark on its own series by default the first', () => {
    expect(placeMarks([{ index: 0, status: 'fail' }], [jvm, ios])).toEqual([
      { index: 0, status: 'fail', series: 0, value: 0.41 },
    ]);
    expect(placeMarks([{ index: 3, status: 'flaky', series: 1 }], [jvm, ios])).toEqual([
      { index: 3, status: 'flaky', series: 1, value: 0.62 },
    ]);
  });

  it('moves a mark to the first series with a value when its own has none there', () => {
    // A failure on ios-sim where jvm did not run (v9 item 13) is marked on ios-sim.
    expect(placeMarks([{ index: 2, status: 'fail', series: 0 }], [jvm, ios])).toEqual([
      { index: 2, status: 'fail', series: 1, value: 0.6 },
    ]);
    expect(placeMarks([{ index: 1, status: 'fail', series: 1 }], [jvm, ios])).toEqual([
      { index: 1, status: 'fail', series: 0, value: 0.4 },
    ]);
  });

  it('draws no mark where no series has a value', () => {
    expect(
      placeMarks(
        [{ index: 1, status: 'fail' }],
        [
          [0.4, null],
          [0.6, null],
        ],
      ),
    ).toEqual([]);
    expect(placeMarks([{ index: 9, status: 'fail' }], [jvm])).toEqual([]);
  });

  it('keeps one mark per run: failed over flaky over empty, whatever the order given', () => {
    const marks = placeMarks(
      [
        { index: 3, status: 'empty' },
        { index: 3, status: 'flaky', series: 1 },
        { index: 0, status: 'flaky' },
        { index: 0, status: 'fail', series: 1 },
        { index: 1, status: 'empty' },
        { index: 1, status: 'flaky' },
      ],
      [jvm, ios],
    );
    expect(marks).toEqual([
      { index: 0, status: 'fail', series: 1, value: 0.63 },
      { index: 1, status: 'flaky', series: 0, value: 0.4 },
      { index: 3, status: 'flaky', series: 1, value: 0.62 },
    ]);
  });

  it('of two marks of one priority keeps the first, the platform first in data order', () => {
    expect(
      placeMarks(
        [
          { index: 0, status: 'fail', series: 0 },
          { index: 0, status: 'fail', series: 1 },
        ],
        [jvm, ios],
      ),
    ).toEqual([{ index: 0, status: 'fail', series: 0, value: 0.41 }]);
  });

  it('places nothing without marks or series', () => {
    expect(placeMarks([], [jvm])).toEqual([]);
    expect(placeMarks([{ index: 0, status: 'fail' }], [])).toEqual([]);
  });
});
