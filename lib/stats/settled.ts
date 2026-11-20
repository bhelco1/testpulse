import type { StatsRun } from './input.ts';
import { byFinish, countsTowardCiOnlyStats } from './rules.ts';

// Spec section 11, "Latest run" (decision 2026-11-19). A project's CI sends one run as several
// reports minutes apart (Testament's own: unit at about 1 minute, integration at 3, e2e at 15 to
// 18), and a run was the latest as soon as its first report arrived, so the headline, the tiles
// and the card swung while a run was still arriving. The latest run is now the newest settled
// default-branch CI run. A run is settled when any of these holds:
// (a) every report key (job, module, platform) of the previous settled run has arrived in it; a
//     superset is fine, so a new suite does not delay it;
// (b) 45 minutes have passed since its first report was received (reports.received_at), so a
//     report that never arrives delays it by 45 minutes at most;
// (c) the project has no earlier settled run: its first run is settled on arrival.
// Pure: the instant is passed in.

export const SETTLE_AFTER_MS = 45 * 60_000;

/** A report of a run as received: its key and when testpulse received it. */
export interface ReportReceipt {
  readonly runId: string;
  readonly job: string;
  readonly module: string;
  readonly platform: string;
  readonly receivedAt: Date;
}

export interface SettledOptions {
  readonly defaultBranch: string;
  readonly now: Date;
}

interface Received {
  readonly keys: Set<string>;
  readonly firstAt: number;
}

// JSON keeps a key's parts apart whatever characters they hold.
const keyOf = (receipt: ReportReceipt): string =>
  JSON.stringify([receipt.job, receipt.module, receipt.platform]);

function byRun(receipts: readonly ReportReceipt[]): Map<string, Received> {
  const runs = new Map<string, { keys: Set<string>; firstAt: number }>();
  for (const receipt of receipts) {
    const time = receipt.receivedAt.getTime();
    const held = runs.get(receipt.runId);
    if (held === undefined) {
      runs.set(receipt.runId, { keys: new Set([keyOf(receipt)]), firstAt: time });
    } else {
      held.keys.add(keyOf(receipt));
      held.firstAt = Math.min(held.firstAt, time);
    }
  }
  return runs;
}

const settledByTime = (received: Received | undefined, now: Date): boolean =>
  received !== undefined && now.getTime() - received.firstAt >= SETTLE_AFTER_MS;

const holdsEvery = (expected: Received | undefined, received: Received | undefined): boolean =>
  [...(expected?.keys ?? [])].every((key) => received?.keys.has(key) === true);

/**
 * Whether any of these receipts' runs is settled by time (rule b). Such a run is settled
 * whatever came before it, so a loader walking back from the newest run can stop at it.
 */
export function anySettledByTime(receipts: readonly ReportReceipt[], now: Date): boolean {
  return [...byRun(receipts).values()].some((received) => settledByTime(received, now));
}

/**
 * The newest settled default-branch CI run finished at or before now, or null with none. Only
 * the runs from the newest one settled by time onward need receipts: that run is settled, and
 * each later one is measured against the settled runs after it. With none settled by time, the
 * oldest run is the anchor (rule c).
 */
export function latestSettledRun<R extends StatsRun>(
  runs: readonly R[],
  receipts: readonly ReportReceipt[],
  options: SettledOptions,
): R | null {
  const ordered = runs
    .filter(
      (run) =>
        countsTowardCiOnlyStats(run, options.defaultBranch) &&
        run.finishedAt.getTime() <= options.now.getTime(),
    )
    .sort(byFinish);
  const received = byRun(receipts);
  const anchor = ordered.findLastIndex((run) => settledByTime(received.get(run.id), options.now));
  const [first = null, ...later] = ordered.slice(Math.max(anchor, 0));
  let settled = first;
  for (const run of later) {
    const own = received.get(run.id);
    if (settledByTime(own, options.now) || holdsEvery(received.get(settled?.id ?? ''), own)) {
      settled = run;
    }
  }
  return settled;
}

/**
 * The runs as of the latest settled run: every run but the default-branch CI runs after it,
 * which are still arriving. Stats that read the latest run's place in the history, Red now, time
 * to green and the green streak, read these, so they agree with the latest run shown.
 */
export function runsThroughLatest<R extends StatsRun>(
  runs: readonly R[],
  latest: StatsRun | null,
  defaultBranch: string,
): R[] {
  if (latest === null) return [...runs];
  return runs.filter(
    (run) => !countsTowardCiOnlyStats(run, defaultBranch) || byFinish(run, latest) <= 0,
  );
}
