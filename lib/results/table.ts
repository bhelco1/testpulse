import { LAYER_ORDER, type Layer } from '../ingest/layer-rules';
import type { TestStatus } from '../parsers/types';

// One test in a run, as the run page's results table lists it. Pure functions over the rows the
// page has loaded; no I/O.
export interface TableResult {
  suite: string;
  name: string;
  status: TestStatus;
  layer: Layer;
}

// The test's result on one report platform in the same run.
export interface PlatformResult {
  platform: string;
  status: TestStatus;
}

export type StatusFilter = 'all' | TestStatus;
export type LayerFilter = 'all' | Layer;

export interface ResultFilters {
  status: StatusFilter;
  layer: LayerFilter;
}

// Section 11: a failing result is failed or error.
export const isFailing = (status: TestStatus): boolean => status === 'failed' || status === 'error';

const collator = new Intl.Collator('en');

// Failures first, then by suite, then by name (design components.md, ResultsTable).
export function orderResults<T extends TableResult>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(isFailing(b.status)) - Number(isFailing(a.status)) ||
      collator.compare(a.suite, b.suite) ||
      collator.compare(a.name, b.name),
  );
}

export function filterResults<T extends TableResult>(
  rows: readonly T[],
  { status, layer }: ResultFilters,
): T[] {
  return rows.filter(
    (row) =>
      (status === 'all' || row.status === status) && (layer === 'all' || row.layer === layer),
  );
}

// The counts beside each status filter: the whole run, whatever is filtered (data-map, run detail).
export function statusCounts(rows: readonly TableResult[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: rows.length,
    passed: 0,
    failed: 0,
    error: 0,
    skipped: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

// The layer select's options: only layers the run has, in section 8 order.
export function layersPresent(rows: readonly TableResult[]): Layer[] {
  const present = new Set(rows.map((row) => row.layer));
  return LAYER_ORDER.filter((layer) => present.has(layer));
}

export interface MismatchGroup {
  status: TestStatus;
  platforms: string[];
}

// Failing platforms lead, both in the sentence and in the platform list (design v4 item 45).
const MISMATCH_ORDER: readonly TestStatus[] = ['failed', 'error', 'passed', 'skipped'];

// Section 11 cross-platform parity, as the table draws it (design v4 items 45 and 46): any
// difference in status across the run's platforms, including failed on one and skipped on
// another. Groups follow MISMATCH_ORDER; platforms keep data order inside a group.
export function platformMismatch(platforms: readonly PlatformResult[]): MismatchGroup[] | null {
  const groups = MISMATCH_ORDER.map((status) => ({
    status,
    platforms: platforms.filter((p) => p.status === status).map((p) => p.platform),
  })).filter((group) => group.platforms.length > 0);
  return groups.length > 1 ? groups : null;
}

const VERB: Readonly<Record<TestStatus, string>> = {
  failed: 'failed',
  error: 'errored',
  passed: 'passed',
  skipped: 'skipped',
};

// "Failed on ios-sim, passed on jvm in the same run."
export function mismatchSentence(groups: readonly MismatchGroup[]): string {
  const clauses = groups
    .map(({ status, platforms }) => `${VERB[status]} on ${platforms.join(', ')}`)
    .join(', ');
  return `${clauses.charAt(0).toUpperCase()}${clauses.slice(1)} in the same run.`;
}
