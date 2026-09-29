import { describe, expect, it } from 'vitest';

import type { ProjectsPassing } from '../stats/projects-passing';
import { projectsPassingKioskTile, projectsPassingTile } from './projects-passing';

// Design v6 items 1 and 2, v7 items 11 to 13; components.md, StatTile "Projects passing" and the
// kiosk variant.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const state = (overrides: Partial<ProjectsPassing> = {}): ProjectsPassing => ({
  passing: 2,
  withRun: 2,
  red: [],
  lastRunEmpty: [],
  ...overrides,
});

const ostomate2Red = { slug: 'ostomate2', name: 'Ostomate2', elapsedMs: 4 * MINUTE };
const routeserveRed = { slug: 'routeserve', name: 'RouteServe', elapsedMs: 51 * HOUR };

describe('projectsPassingTile', () => {
  it('all passed: "{p} of {n}" over "Latest default-branch runs"', () => {
    expect(projectsPassingTile(state())).toEqual({
      label: 'Projects passing',
      value: '2 of 2',
      sub: 'Latest default-branch runs',
      fail: false,
    });
  });

  it('one red: a fail sub-line "{project} red for {duration}"', () => {
    expect(projectsPassingTile(state({ passing: 1, red: [ostomate2Red] }))).toEqual({
      label: 'Projects passing',
      value: '1 of 2',
      sub: 'Ostomate2 red for 4m',
      fail: true,
    });
  });

  it('several red: "Red: {project} {duration} · …" in the order given, longest first', () => {
    expect(projectsPassingTile(state({ passing: 0, red: [routeserveRed, ostomate2Red] }))).toEqual({
      label: 'Projects passing',
      value: '0 of 2',
      sub: 'Red: RouteServe 2d 3h · Ostomate2 4m',
      fail: true,
    });
  });

  it('latest run empty and none red: a plain "{project} last run empty"', () => {
    const empty = { slug: 'ostomate2', name: 'Ostomate2' };
    expect(projectsPassingTile(state({ passing: 1, lastRunEmpty: [empty] }))).toEqual({
      label: 'Projects passing',
      value: '1 of 2',
      sub: 'Ostomate2 last run empty',
      fail: false,
    });
  });

  // Design v7 item 11 confirms and draws it.
  it('several empty and none red: each project’s line, joined as the red list is', () => {
    const tile = projectsPassingTile(
      state({
        passing: 0,
        lastRunEmpty: [
          { slug: 'ostomate2', name: 'Ostomate2' },
          { slug: 'routeserve', name: 'RouteServe' },
        ],
      }),
    );
    expect(tile).toMatchObject({
      sub: 'Ostomate2 last run empty · RouteServe last run empty',
      fail: false,
    });
  });

  it('a red project wins over an empty one, and only red projects are listed', () => {
    const tile = projectsPassingTile(
      state({
        passing: 0,
        red: [ostomate2Red],
        lastRunEmpty: [{ slug: 'routeserve', name: 'RouteServe' }],
      }),
    );
    expect(tile).toMatchObject({ sub: 'Ostomate2 red for 4m', fail: true });
  });

  it('no project has a run yet: value "0", sub "No runs yet"', () => {
    expect(projectsPassingTile(state({ passing: 0, withRun: 0 }))).toEqual({
      label: 'Projects passing',
      value: '0',
      sub: 'No runs yet',
      fail: false,
    });
  });
});

describe('projectsPassingKioskTile', () => {
  it('reads "Projects passing" with "{p} of {n}" while nothing is red', () => {
    expect(projectsPassingKioskTile(state())).toEqual({
      label: 'Projects passing',
      value: '2 of 2',
      fail: false,
    });
  });

  it('one red: the label becomes "{project} red for {duration}"', () => {
    expect(projectsPassingKioskTile(state({ passing: 1, red: [ostomate2Red] }))).toEqual({
      label: 'Ostomate2 red for 4m',
      value: '1 of 2',
      fail: true,
    });
  });

  it('several red: the label becomes "{k} projects red"', () => {
    expect(
      projectsPassingKioskTile(state({ passing: 0, red: [routeserveRed, ostomate2Red] })),
    ).toEqual({ label: '2 projects red', value: '0 of 2', fail: true });
  });

  // Design v7 item 12: the label stays, and a plain sub-line names the empty runs.
  it('a latest run empty and none red: "{project} last run empty" under the label', () => {
    expect(
      projectsPassingKioskTile(
        state({ passing: 1, lastRunEmpty: [{ slug: 'ostomate2', name: 'Ostomate2' }] }),
      ),
    ).toEqual({
      label: 'Projects passing',
      value: '1 of 2',
      sub: 'Ostomate2 last run empty',
      fail: false,
    });
    expect(
      projectsPassingKioskTile(
        state({
          passing: 0,
          lastRunEmpty: [
            { slug: 'ostomate2', name: 'Ostomate2' },
            { slug: 'routeserve', name: 'RouteServe' },
          ],
        }),
      ),
    ).toMatchObject({ sub: 'Ostomate2 last run empty · RouteServe last run empty', fail: false });
  });

  it('a red project wins over an empty one, with no sub-line', () => {
    expect(
      projectsPassingKioskTile(
        state({
          passing: 0,
          red: [ostomate2Red],
          lastRunEmpty: [{ slug: 'routeserve', name: 'RouteServe' }],
        }),
      ),
    ).toEqual({ label: 'Ostomate2 red for 4m', value: '0 of 2', fail: true });
  });

  it('no project has a run yet: value "0", sub "No runs yet"', () => {
    expect(projectsPassingKioskTile(state({ passing: 0, withRun: 0 }))).toEqual({
      label: 'Projects passing',
      value: '0',
      sub: 'No runs yet',
      fail: false,
    });
  });
});
