import { expect, test } from '@playwright/test';

import { expectChartsDrawn } from '../support/charts.ts';

// Negative controls for the wait every chart screenshot takes first. The charts are injected with
// setContent in the markup TrendChart draws, so nothing is added to the app.

const page_ = (charts: string) =>
  '<!doctype html><html lang="en"><head><title>control</title></head><body><main>' +
  charts +
  '</main></body></html>';

const chart = (title: string, body: string) =>
  `<figure data-part="trend-chart"><figcaption><h3>${title}</h3></figcaption><div>${body}</div></figure>`;

const LINE = '<path class="recharts-line-curve" d="M0,10L100,20"></path>';
const LABELS = '<text data-part="x-label">Latest</text><text data-part="y-label">90%</text>';
const plot = (inside: string) => `<div data-part="plot" role="img"><svg>${inside}</svg></div>`;

test('passes once every chart has drawn its line and both axes', async ({ page }) => {
  await page.setContent(
    page_(
      chart('Pass rate', plot(LINE + LABELS)) + chart('No runs', '<div data-part="empty"></div>'),
    ),
  );

  await expectChartsDrawn(page);
});

test('fails on a chart that shows neither a placeholder nor a plot, and names it', async ({
  page,
}) => {
  // RouteServe's apps/mobile coverage in run 44632760225: title and caption, an empty plot area.
  await page.setContent(
    page_(chart('Pass rate', plot(LINE + LABELS)) + chart('Line coverage, apps/mobile', '')),
  );

  await expect(expectChartsDrawn(page)).rejects.toThrow(/Line coverage, apps\/mobile: no plot/);
});

test('fails on a plot with no line or bars', async ({ page }) => {
  await page.setContent(page_(chart('Pass rate', plot(LABELS))));

  await expect(expectChartsDrawn(page)).rejects.toThrow(/Pass rate: no line or bars/);
});

test('fails on a plot with no axis labels', async ({ page }) => {
  await page.setContent(page_(chart('Pass rate', plot(LINE))));

  await expect(expectChartsDrawn(page)).rejects.toThrow(/no x labels[\s\S]*no y labels/);
});

test('fails while a chart holds its placeholder', async ({ page }) => {
  await page.setContent(page_(chart('Pass rate', '<div data-part="placeholder"></div>')));

  await expect(expectChartsDrawn(page)).rejects.toThrow(/placeholder/);
});

test('fails on a page with no charts at all', async ({ page }) => {
  await page.setContent(page_('<p>No charts here.</p>'));

  await expect(expectChartsDrawn(page)).rejects.toThrow(/charts on the page/);
});
