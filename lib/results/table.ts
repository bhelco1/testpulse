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

// Section 11 cross-platform parity, as the table draws it: passing on some platforms and failing
// on others in the same run.
export function platformMismatch(
  platforms: readonly PlatformResult[],
): { passed: string[]; failed: string[] } | null {
  const passed = platforms.filter((p) => p.status === 'passed').map((p) => p.platform);
  const failed = platforms.filter((p) => isFailing(p.status)).map((p) => p.platform);
  return passed.length > 0 && failed.length > 0 ? { passed, failed } : null;
}
