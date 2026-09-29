import type { StatsRun } from './input.ts';
import type { StillRed } from './time-to-green.ts';

// Design v6 item 1 and components.md, StatTile "Projects passing"; spec section 11. Read as
// follows, and pinned by the tests:
// - n is the projects with a latest default-branch CI run; p is those whose latest run passed.
// - Red is timeToGreen's stillRed: the latest run failed, timed from the first failed run since
//   the last passed one (decision 2026-09-28, section 19), so the tile and the project page
//   always agree. Longest red first; equal times keep the order the projects were given in.
// - A latest run that is empty is not passing and not red; it is listed on its own.

export interface ProjectsPassingInput {
  readonly slug: string;
  readonly name: string;
  readonly latestStatus: StatsRun['status'] | null;
  readonly stillRed: StillRed | null;
}

export interface RedProject {
  readonly slug: string;
  readonly name: string;
  readonly elapsedMs: number;
}

export interface ProjectsPassing {
  readonly passing: number;
  readonly withRun: number;
  readonly red: readonly RedProject[];
  readonly lastRunEmpty: readonly { readonly slug: string; readonly name: string }[];
}

export function projectsPassing(projects: readonly ProjectsPassingInput[]): ProjectsPassing {
  const withRun = projects.filter((project) => project.latestStatus !== null);
  return {
    passing: withRun.filter((project) => project.latestStatus === 'passed').length,
    withRun: withRun.length,
    red: withRun
      .flatMap(({ slug, name, stillRed }) =>
        stillRed === null ? [] : [{ slug, name, elapsedMs: stillRed.elapsedMs }],
      )
      .sort((a, b) => b.elapsedMs - a.elapsedMs),
    lastRunEmpty: withRun
      .filter((project) => project.latestStatus === 'empty')
      .map(({ slug, name }) => ({ slug, name })),
  };
}
