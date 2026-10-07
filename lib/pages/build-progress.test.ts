import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BUILD_PROGRESS, BuildProgressSchema, buildProgressView } from './build-progress.ts';

// How It's Tested's "Build progress" reads docs/build-progress.json, a data file updated in the
// same PR as a phase's close, and is dated by that file, not the clock (decision 2026-09-30).
// These checks keep the file true to docs/spec.md section 17 and CLAUDE.md's "Current phase".

const spec = readFileSync('docs/spec.md', 'utf8');
const claude = readFileSync('CLAUDE.md', 'utf8');

describe('docs/build-progress.json', () => {
  it('names every phase of section 17, in order', () => {
    const headings = [...spec.matchAll(/^### Phase (\d): (.+)$/gm)].map(([, n, title]) => [
      Number(n),
      String(title).toLowerCase(),
    ]);
    expect(BUILD_PROGRESS.phases.map(({ phase, title }) => [phase, title.toLowerCase()])).toEqual(
      headings,
    );
  });

  it('marks done exactly the phases section 17 records as complete', () => {
    const complete = [...spec.matchAll(/^Phase (\d) complete \d{4}-\d{2}-\d{2}\.$/gm)].map(
      ([, n]) => Number(n),
    );
    expect(
      BUILD_PROGRESS.phases.filter(({ status }) => status === 'done').map(({ phase }) => phase),
    ).toEqual(complete);
  });

  it('marks in progress the phase CLAUDE.md names as current, and the rest planned', () => {
    const current = Number(/## Current phase\s+Phase (\d):/.exec(claude)?.[1]);
    const statuses = BUILD_PROGRESS.phases.map(({ phase, status }) => [phase, status]);
    expect(statuses.filter(([, status]) => status === 'in_progress')).toEqual([
      [current, 'in_progress'],
    ]);
    expect(
      statuses.filter(([phase]) => Number(phase) > current).every(([, s]) => s === 'planned'),
    ).toBe(true);
  });

  it('refuses a file with an unknown status or a malformed date', () => {
    expect(() =>
      BuildProgressSchema.parse({
        asOf: '1 Oct',
        phases: [{ phase: 0, title: 'x', status: 'done' }],
      }),
    ).toThrow();
    expect(() =>
      BuildProgressSchema.parse({
        asOf: '2026-10-01',
        phases: [{ phase: 0, title: 'x', status: 'finished' }],
      }),
    ).toThrow();
  });
});

describe('buildProgressView', () => {
  it('dates the list by the file, and gives each phase its label and status', () => {
    const view = buildProgressView(new Date('2026-10-05T12:00:00.000Z'));
    expect(view.asOf).toEqual({
      text: '2 Oct',
      datetime: '2026-10-02T00:00:00.000Z',
      title: '2 Oct 2026, 00:00 UTC',
    });
    expect(view.phases.map(({ n, label, status }) => `${n} ${label} ${status}`)).toEqual([
      'Phase 0 Foundations done',
      'Phase 1 Schema, parsers, ingestion done',
      'Phase 2 Ostomate2 reporting live done',
      'Phase 3 RouteServe reporting live done',
      'Phase 4 Backfill done',
      'Phase 5 Public site done',
      'Phase 6 Alerts, tracked links, admin in_progress',
      'Phase 7 Launch planned',
    ]);
  });
});
