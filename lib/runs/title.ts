import type { ReportEvent } from '../ingest/meta';

// Design v4 item 28 (TPKit.runTitle). Commit messages and PR numbers are not stored, so a run is
// titled from runs.event and runs.branch alone. Ingest accepts only the four events below; the
// fallback keeps a title for any event a later schema adds.
const TITLES: Readonly<Record<ReportEvent, (branch: string) => string>> = {
  push: (branch) => `Push to ${branch}`,
  pull_request: (branch) => `Pull request from ${branch}`,
  schedule: () => 'Scheduled run',
  workflow_dispatch: () => 'Manual run',
};

const isKnown = (event: string): event is ReportEvent => Object.hasOwn(TITLES, event);

export function runTitle(event: string, branch: string): string {
  return isKnown(event) ? TITLES[event](branch) : `Run on ${branch}`;
}
