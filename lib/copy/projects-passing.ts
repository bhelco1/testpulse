import type { ProjectsPassing } from '../stats/projects-passing';
import { formatElapsed } from './elapsed';

// The Projects passing tile's words (design v6 items 1 and 2, v7 items 11 to 13; components.md,
// StatTile). The numbers come from lib/stats/projects-passing.ts, red projects already longest
// red first.

const LABEL = 'Projects passing';

export interface ProjectsPassingTile {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
  /** The StatTile `fail` variant: the sub-line (web) or the label (kiosk) in --fail. */
  readonly fail: boolean;
}

const value = ({ passing, withRun }: ProjectsPassing): string => `${passing} of ${withRun}`;

const lastRunEmpty = (state: ProjectsPassing): string =>
  state.lastRunEmpty.map((project) => `${project.name} last run empty`).join(' · ');

export function projectsPassingTile(state: ProjectsPassing): ProjectsPassingTile {
  if (state.withRun === 0) return { label: LABEL, value: '0', sub: 'No runs yet', fail: false };
  const [first, ...rest] = state.red;
  if (first !== undefined && rest.length === 0) {
    return {
      label: LABEL,
      value: value(state),
      sub: `${first.name} red for ${formatElapsed(first.elapsedMs)}`,
      fail: true,
    };
  }
  if (first !== undefined) {
    const listed = state.red.map((red) => `${red.name} ${formatElapsed(red.elapsedMs)}`);
    return { label: LABEL, value: value(state), sub: `Red: ${listed.join(' · ')}`, fail: true };
  }
  if (state.lastRunEmpty.length > 0) {
    return { label: LABEL, value: value(state), sub: lastRunEmpty(state), fail: false };
  }
  return { label: LABEL, value: value(state), sub: 'Latest default-branch runs', fail: false };
}

export function projectsPassingKioskTile(state: ProjectsPassing): ProjectsPassingTile {
  if (state.withRun === 0) return { label: LABEL, value: '0', sub: 'No runs yet', fail: false };
  const [first, ...rest] = state.red;
  if (first === undefined) {
    return state.lastRunEmpty.length > 0
      ? { label: LABEL, value: value(state), sub: lastRunEmpty(state), fail: false }
      : { label: LABEL, value: value(state), fail: false };
  }
  return {
    label:
      rest.length === 0
        ? `${first.name} red for ${formatElapsed(first.elapsedMs)}`
        : `${state.red.length} projects red`,
    value: value(state),
    fail: true,
  };
}
