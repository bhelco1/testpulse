import { readFileSync } from 'node:fs';

import type { Page, Response } from '@playwright/test';

import { parseJestJson } from '../../../lib/parsers/jest-json.ts';
import { planSeed, SEED_NOW } from '../../../lib/seed/plan.ts';
import { open } from './open.ts';

// Spec section 17, Phase 5: for a private project, failure text, repository links and full SHAs
// are absent from the rendered HTML and from every network response. The values are derived from
// what the seed sends (lib/seed/plan.ts and the committed Jest fixture it posts), not read from
// the database: the e2e container is never given the secret key. Each page spec proves the
// derivation matches the seeded database with positive controls of its own.

export const ROUTESERVE_RUNS = planSeed(new Date(SEED_NOW)).runs.filter(
  (run) => run.slug === 'routeserve',
);

function routeserveFailures() {
  const report = ROUTESERVE_RUNS.flatMap((run) => run.reports).find((candidate) =>
    candidate.results.source.endsWith('-one-failure.json'),
  );
  if (report === undefined || report.results.format !== 'jest')
    throw new Error('no failing routeserve report in the seed plan');
  const parsed = parseJestJson(readFileSync(report.results.source, 'utf8'), {
    pathPrefix: report.results.pathPrefix,
  });
  return parsed.tests.filter((result) => result.failure !== undefined);
}

export const FAILING = routeserveFailures();

export const HIDDEN = [
  ...new Set([
    ...FAILING.flatMap((result) => {
      const { message = '', detail = '' } = result.failure ?? {};
      const lines = `${message}\n${detail}`
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length >= 12);
      return [message, detail, ...lines];
    }),
    ...ROUTESERVE_RUNS.flatMap((run) => [run.commitSha, run.runUrl]),
    'github.com/bhelco1/routeserve',
  ]),
].filter((value) => value.length > 0);

// A value as it could appear in a response: as written, inside a JSON string, or HTML-escaped.
export function formsOf(value: string): string[] {
  const html = value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
  return [...new Set([value, JSON.stringify(value).slice(1, -1), html])];
}

export const leaksIn = (texts: readonly string[], hidden: readonly string[]) =>
  hidden.filter((value) =>
    formsOf(value).some((form) => texts.some((text) => text.includes(form))),
  );

const settle = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

export async function capture(
  page: Page,
  path: string,
  act: (page: Page) => Promise<void> = async () => {},
) {
  const responses: Response[] = [];
  const frames: string[] = [];
  page.on('response', (response) => {
    if (!/font|image/.test(response.headers()['content-type'] ?? '')) responses.push(response);
  });
  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => frames.push(String(frame.payload)));
    socket.on('framesent', (frame) => frames.push(String(frame.payload)));
  });
  await open(page, path);
  await act(page);
  // Link prefetches start after load: wait until a second passes with no new response.
  for (let seen = -1; seen !== responses.length;) {
    seen = responses.length;
    await page.waitForTimeout(1_000);
  }
  // Chromium leaves some of Next's prefetch requests unfinished, so their bodies cannot be read
  // from the page; those are requested again with the same headers, so none goes unchecked.
  const bodies = await Promise.all(
    responses.map(async (response) => {
      const body = await Promise.race([response.text().catch(() => null), settle(3_000)]);
      if (body !== null) return body;
      const again = await page.request.get(response.url(), {
        headers: await response.request().allHeaders(),
      });
      return again.text();
    }),
  );
  const html = await page.content();
  return { html, texts: [html, ...bodies, ...frames], responses: responses.length };
}
