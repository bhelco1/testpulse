import { describe, expect, it } from 'vitest';

import { at } from './records.test-support.ts';
import { projectsPassing, type ProjectsPassingInput } from './projects-passing.ts';

// Design v6 item 1 and components.md, StatTile "Projects passing"; spec section 11. n is the
// projects with at least one default-branch CI run, p those whose latest such run passed. A
// project is red when that run failed (decision 2026-09-28, section 19), for as long as
// timeToGreen's stillRed says; a latest run that is empty is neither passed nor red.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const project = (
  slug: string,
  latestStatus: ProjectsPassingInput['latestStatus'],
  redForMs: number | null = null,
): ProjectsPassingInput => ({
  slug,
  name: slug.toUpperCase(),
  latestStatus,
  stillRed:
    redForMs === null
      ? null
      : { failedRunId: `f-${slug}`, failedAt: at('2026-10-05T00:00:00Z'), elapsedMs: redForMs },
});

describe('projectsPassing', () => {
  it('is 0 of 0 with no projects, or none with a run', () => {
    const none = { passing: 0, withRun: 0, red: [], lastRunEmpty: [] };
    expect(projectsPassing([])).toEqual(none);
    expect(projectsPassing([project('a', null), project('b', null)])).toEqual(none);
  });

  it('counts projects whose latest default-branch run passed, of those with a run', () => {
    // a and b passed; c has never run, so it is not in n. 2 of 2.
    expect(
      projectsPassing([project('a', 'passed'), project('b', 'passed'), project('c', null)]),
    ).toEqual({ passing: 2, withRun: 2, red: [], lastRunEmpty: [] });
  });

  it('lists red projects longest red first, with how long each has been red', () => {
    // a red 4 min, b passed, c red 2 d 3 h: 1 of 3; c before a.
    const result = projectsPassing([
      project('a', 'failed', 4 * MINUTE),
      project('b', 'passed'),
      project('c', 'failed', 51 * HOUR),
    ]);
    expect(result).toEqual({
      passing: 1,
      withRun: 3,
      red: [
        { slug: 'c', name: 'C', elapsedMs: 51 * HOUR },
        { slug: 'a', name: 'A', elapsedMs: 4 * MINUTE },
      ],
      lastRunEmpty: [],
    });
  });

  it('keeps dashboard order between projects red for the same time', () => {
    const result = projectsPassing([project('b', 'failed', HOUR), project('a', 'failed', HOUR)]);
    expect(result.red.map((red) => red.slug)).toEqual(['b', 'a']);
  });

  it('counts a project whose latest run was empty as not passing and not red', () => {
    // a empty, b passed: 1 of 2, nobody red.
    expect(projectsPassing([project('a', 'empty'), project('b', 'passed')])).toEqual({
      passing: 1,
      withRun: 2,
      red: [],
      lastRunEmpty: [{ slug: 'a', name: 'A' }],
    });
  });
});
