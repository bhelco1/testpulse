import { expect, type Page } from '@playwright/test';

/**
 * Every trend chart has drawn its plot. Until a chart has measured its width it holds the space
 * with an empty placeholder, so a screenshot taken in that moment shows a blank chart (RouteServe's
 * Run duration did, in run 39660952145). No placeholder is not enough on its own: each chart must
 * show a state of its own, or a plot with its series and both axes' labels, so a blank chart fails
 * here by name rather than as a pixel diff.
 */
export async function expectChartsDrawn(page: Page) {
  await expect(page.locator('[data-part="placeholder"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(undrawnCharts)).toEqual([]);
  expect(
    await page.locator('[data-part="trend-chart"]').count(),
    'charts on the page',
  ).toBeGreaterThan(0);
}

/** Each trend chart that has not drawn, by title, with what it shows instead. In the page. */
function undrawnCharts(): string[] {
  const settled = ['empty', 'one-point', 'error'];
  const problems: string[] = [];
  for (const chart of document.querySelectorAll('[data-part="trend-chart"]')) {
    const title = chart.querySelector('h3')?.textContent ?? '(untitled)';
    if (settled.some((part) => chart.querySelector(`[data-part="${part}"]`))) continue;
    const plot = chart.querySelector('[data-part="plot"] svg');
    if (!plot) {
      const shown = [...chart.querySelectorAll('[data-part]')].map((e) =>
        e.getAttribute('data-part'),
      );
      problems.push(`${title}: no plot (shows ${shown.join(', ') || 'nothing'})`);
      continue;
    }
    const line = [...plot.querySelectorAll('path.recharts-line-curve')].some(
      (path) => (path.getAttribute('d') ?? '') !== '',
    );
    const bars = plot.querySelectorAll('.recharts-bar-rectangle').length > 0;
    if (!line && !bars) problems.push(`${title}: no line or bars`);
    if (!plot.querySelector('[data-part="x-label"]')) problems.push(`${title}: no x labels`);
    if (!plot.querySelector('[data-part="y-label"]')) problems.push(`${title}: no y labels`);
  }
  return problems;
}

/**
 * Every drawn chart's y axis reads cleanly: no label runs past the chart's left edge, where the
 * SVG clips it ("92.5%" read "2.5%" at 390), and no two labels on one axis read the same (a
 * 352 ms test read "0.35 s, 0.35 s, 0.34 s, 0.34 s"). Waits for the charts to draw first.
 */
export async function expectReadableYAxes(page: Page) {
  await expect(page.locator('[data-part="y-label"]').first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const problems: string[] = [];
        const charts = new Set(
          [...document.querySelectorAll('[data-part="y-label"]')].map((label) =>
            label.closest('svg'),
          ),
        );
        for (const chart of charts) {
          if (!chart) continue;
          const labels = [...chart.querySelectorAll('[data-part="y-label"]')];
          const texts = labels.map((label) => label.textContent);
          if (new Set(texts).size !== texts.length) problems.push(`repeated: ${texts.join(', ')}`);
          const edge = chart.getBoundingClientRect().left;
          for (const label of labels) {
            const over = edge - label.getBoundingClientRect().left;
            if (over > 0) problems.push(`clipped by ${over.toFixed(1)} px: ${label.textContent}`);
          }
        }
        return problems;
      }),
    )
    .toEqual([]);
}

/**
 * No chart's first or last value label overlaps its floor label: Ostomate2's composeApp coverage
 * drew "93.6%" on top of "floor 93%". Waits for the charts to draw first.
 */
export async function expectValueLabelsClearOfFloor(page: Page) {
  await expect(page.locator('[data-part="floor-label"]').first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const problems: string[] = [];
        for (const floor of document.querySelectorAll('[data-part="floor-label"]')) {
          const chart = floor.closest('svg');
          if (!chart) continue;
          const f = floor.getBoundingClientRect();
          for (const label of chart.querySelectorAll('[data-part="value-label"]')) {
            const v = label.getBoundingClientRect();
            const apart =
              v.right <= f.left || f.right <= v.left || v.bottom <= f.top || f.bottom <= v.top;
            if (!apart) problems.push(`"${label.textContent}" overlaps "${floor.textContent}"`);
          }
        }
        return problems;
      }),
    )
    .toEqual([]);
}
