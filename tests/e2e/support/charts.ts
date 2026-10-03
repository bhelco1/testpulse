import { expect, type Page } from '@playwright/test';

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
