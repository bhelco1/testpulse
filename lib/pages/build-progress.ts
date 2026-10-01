import { z } from 'zod';

import progress from '../../docs/build-progress.json';
import { dateLabel, type TimeLabel } from '../copy/time';

// How It's Tested's "Build progress" (design/pages/How Its Tested.dc.html; components.md, How
// it's tested page), read from docs/build-progress.json, which changes in the same PR as a phase
// closes. Its "As of" is the file's own date, never the clock (decision 2026-09-30). The file is
// bundled at build time and checked here, so a malformed one fails the build's tests, not a page.

export const BuildProgressSchema = z.object({
  asOf: z.iso.date(),
  phases: z
    .array(
      z.object({
        phase: z.int().min(0),
        title: z.string().min(1),
        status: z.enum(['done', 'in_progress', 'planned']),
      }),
    )
    .min(1),
});

export type BuildProgress = z.output<typeof BuildProgressSchema>;
export type PhaseStatus = BuildProgress['phases'][number]['status'];

export const BUILD_PROGRESS: BuildProgress = BuildProgressSchema.parse(progress);

export interface BuildProgressView {
  readonly asOf: TimeLabel;
  readonly phases: readonly {
    readonly n: string;
    readonly label: string;
    readonly status: PhaseStatus;
  }[];
}

export const buildProgressView = (now: Date): BuildProgressView => ({
  asOf: dateLabel(new Date(`${BUILD_PROGRESS.asOf}T00:00:00.000Z`), now),
  phases: BUILD_PROGRESS.phases.map(({ phase, title, status }) => ({
    n: `Phase ${phase}`,
    label: title,
    status,
  })),
});
