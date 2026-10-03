import { describe, expect, it } from 'vitest';

import {
  barWidth,
  chartHeight,
  chartLayout,
  nearestIndex,
  nextIndex,
  pointLabel,
  showsIntermediateDots,
  startLabelDy,
  tooltipLeft,
  xAt,
  xTickIndices,
  yAt,
} from './layout';

describe('chartLayout', () => {
  it('uses the desktop height and margins from 560 px wide', () => {
    expect(chartLayout(560, 10, 'line')).toEqual({
      width: 560,
      height: 250,
      phone: false,
      left: 56,
      right: 60,
      top: 22,
      bottom: 30,
      count: 10,
      kind: 'line',
    });
  });

  it('uses the phone height and margins below 560 px wide', () => {
    expect(chartLayout(559, 10, 'bar')).toMatchObject({
      height: 200,
      phone: true,
      left: 44,
      right: 44,
      top: 22,
      bottom: 30,
    });
  });

  // Design v5 item 6: the right margin fits the widest end-value label, measured at 13/600.
  it('widens the right margin to 8 + the widest end label + 6, rounded up', () => {
    expect(chartLayout(720, 10, 'line', 40).right).toBe(60);
    expect(chartLayout(720, 10, 'line', 46).right).toBe(60);
    expect(chartLayout(720, 10, 'line', 46.2).right).toBe(61);
    expect(chartLayout(720, 10, 'line', 60).right).toBe(74);
  });

  it('keeps at least 44 px on the right on a phone', () => {
    expect(chartLayout(342, 10, 'line', 20).right).toBe(44);
    expect(chartLayout(342, 10, 'line', 40).right).toBe(54);
  });

  // The y labels end 8 px left of the plot. At 390 Ostomate2's shared coverage chart has a tick at
  // 92.5%, 39.7 px wide in tabular figures, which a 44 px margin cut to "2.5%".
  it('widens the left margin to 8 + the widest y label, rounded up, so none is clipped', () => {
    expect(chartLayout(294, 21, 'line', 0, 30).left).toBe(44);
    expect(chartLayout(294, 21, 'line', 0, 36).left).toBe(44);
    expect(chartLayout(294, 21, 'line', 0, 39.7).left).toBe(48);
    expect(chartLayout(720, 21, 'line', 0, 39.7).left).toBe(56);
    expect(chartLayout(720, 21, 'bar', 0, 52).left).toBe(60);
  });

  it('leaves bars at the minimum right margin: they have no end labels', () => {
    expect(chartLayout(720, 10, 'bar', 80).right).toBe(60);
    expect(chartLayout(342, 10, 'bar', 80).right).toBe(44);
  });

  it('keeps the desktop height before the width is known', () => {
    expect(chartHeight(0)).toBe(250);
    expect(chartHeight(342)).toBe(200);
    expect(chartHeight(760)).toBe(250);
  });
});

describe('positions', () => {
  const line = chartLayout(600, 4, 'line');
  const bar = chartLayout(600, 4, 'bar');

  it('spreads line points from the left margin to the right margin', () => {
    expect([0, 1, 2, 3].map((i) => xAt(line, i))).toEqual([56, 56 + 484 / 3, 56 + 968 / 3, 540]);
  });

  it('centres each bar in its day slot', () => {
    expect([0, 1, 2, 3].map((i) => xAt(bar, i))).toEqual([116.5, 237.5, 358.5, 479.5]);
  });

  it('makes bars 62% of their slot and never thinner than 2 px', () => {
    expect(barWidth(bar)).toBeCloseTo(75.02);
    expect(barWidth(chartLayout(400, 300, 'bar'))).toBe(2);
  });

  it('maps values between the top and bottom margins', () => {
    const scale = { min: 40, max: 90, ticks: [40, 90] };
    expect(yAt(line, scale, 90)).toBe(22);
    expect(yAt(line, scale, 40)).toBe(220);
    expect(yAt(line, scale, 50)).toBeCloseTo(180.4);
  });
});

describe('xTickIndices', () => {
  it('labels 0, a third, two thirds and the last point on desktop', () => {
    expect(xTickIndices(30, false, true)).toEqual([0, 10, 19, 29]);
    expect(xTickIndices(10, false, true)).toEqual([0, 3, 6, 9]);
  });

  it('labels only the first and last point on a phone', () => {
    expect(xTickIndices(30, true, true)).toEqual([0, 29]);
  });

  it('labels only the ends when the points carry no labels of their own', () => {
    expect(xTickIndices(30, false, false)).toEqual([0, 29]);
  });

  it('never labels one point twice', () => {
    expect(xTickIndices(2, false, true)).toEqual([0, 1]);
    expect(xTickIndices(3, false, true)).toEqual([0, 1, 2]);
  });
});

describe('showsIntermediateDots', () => {
  it('draws hollow dots only for 12 points or fewer, and never on a phone', () => {
    expect(showsIntermediateDots(12, false)).toBe(true);
    expect(showsIntermediateDots(13, false)).toBe(false);
    expect(showsIntermediateDots(10, true)).toBe(false);
  });
});

describe('pointer and keyboard', () => {
  const line = chartLayout(600, 4, 'line');

  it('picks the point nearest the pointer', () => {
    expect(nearestIndex(line, 130)).toBe(0);
    expect(nearestIndex(line, 300)).toBe(2);
    expect(nearestIndex(line, -50)).toBe(0);
    expect(nearestIndex(line, 900)).toBe(3);
    expect(nearestIndex(chartLayout(600, 4, 'bar'), 180)).toBe(1);
  });

  it('centres the 180 px tooltip on the point but keeps it inside the chart', () => {
    expect(tooltipLeft(line, 0)).toBe(0);
    expect(tooltipLeft(line, 1)).toBeCloseTo(56 + 484 / 3 - 90);
    expect(tooltipLeft(line, 3)).toBe(420);
  });

  it('moves with the arrow keys, starting from the latest point and stopping at the ends', () => {
    expect(nextIndex(null, 'ArrowLeft', 30)).toBe(28);
    expect(nextIndex(null, 'ArrowRight', 30)).toBe(29);
    expect(nextIndex(5, 'ArrowRight', 30)).toBe(6);
    expect(nextIndex(5, 'ArrowLeft', 30)).toBe(4);
    expect(nextIndex(29, 'ArrowRight', 30)).toBe(29);
    expect(nextIndex(0, 'ArrowLeft', 30)).toBe(0);
  });

  it('closes on Escape and ignores other keys', () => {
    expect(nextIndex(5, 'Escape', 30)).toBeNull();
    expect(nextIndex(5, 'Enter', 30)).toBe(5);
    expect(nextIndex(null, 'Tab', 30)).toBeNull();
  });
});

describe('startLabelDy', () => {
  it('puts the first value label below its point unless the point is near the bottom', () => {
    const line = chartLayout(600, 4, 'line');
    expect(startLabelDy(line, 200)).toBe(18);
    expect(startLabelDy(line, 201)).toBe(-10);
  });

  // Ostomate2's "Line coverage, composeApp" starts at 93.6% over a 93% floor: below its point the
  // label landed on "floor 93%" (Phase 5 design review; decision 2026-10-02).
  it('puts it above its point when below it would overlap the floor label', () => {
    const desktop = chartLayout(720, 21, 'line');
    const desktopScale = { min: 92, max: 96, ticks: [92, 94, 96] };
    expect(
      startLabelDy(desktop, yAt(desktop, desktopScale, 93.6), yAt(desktop, desktopScale, 93)),
    ).toBe(-10);
    const phone = chartLayout(342, 21, 'line');
    const phoneScale = { min: 92, max: 96, ticks: [92, 94, 96] };
    expect(startLabelDy(phone, yAt(phone, phoneScale, 93.6), yAt(phone, phoneScale, 93))).toBe(-10);
  });

  it('keeps it below when the floor label is clear of it', () => {
    const line = chartLayout(600, 4, 'line');
    // Below, its 13 px text sits on a baseline at 118; the floor label's 12 px text sits on a
    // baseline 6 above the floor line, so a floor line at 136 or lower leaves them touching at most.
    expect(startLabelDy(line, 100, 136)).toBe(18);
    expect(startLabelDy(line, 100, 60)).toBe(18);
    expect(startLabelDy(line, 100, 135)).toBe(-10);
  });
});

describe('labels', () => {
  const dates = ['Jul 2', 'Jul 11', 'Jul 20'];

  it('uses the given label for a point', () => {
    expect(pointLabel(1, 3, dates, 'run')).toBe('Jul 11');
  });

  it('counts back from the latest point when there are no labels', () => {
    expect(pointLabel(29, 30, [], 'run')).toBe('Latest');
    expect(pointLabel(28, 30, [], 'run')).toBe('1 run ago');
    expect(pointLabel(0, 30, [], 'run')).toBe('29 runs ago');
    expect(pointLabel(28, 30, [], 'day')).toBe('1 day ago');
    expect(pointLabel(27, 30, [], 'day')).toBe('2 days ago');
  });

  // Design v5 item 2: one counting rule for the axis, the tooltip and the table.
  // The axis, the tooltip and the table all name a point with pointLabel.
  it('counts the oldest of n points as n - 1 back, on the axis as everywhere else', () => {
    expect(pointLabel(0, 30, [], 'day')).toBe('29 days ago');
    expect(pointLabel(10, 30, [], 'run')).toBe('19 runs ago');
    expect(pointLabel(0, 2, [], 'run')).toBe('1 run ago');
    expect(pointLabel(1, 2, [], 'run')).toBe('Latest');
  });

  it('names a point with a blank given label by the counting rule', () => {
    expect(pointLabel(1, 3, ['Jul 2', '', 'Jul 20'], 'run')).toBe('1 run ago');
  });
});
