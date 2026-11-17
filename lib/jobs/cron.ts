import { createHash, timingSafeEqual } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createSecretClient } from '../supabase/server.ts';
import { type DailyLog, runDailyJob } from './daily.ts';
import type { DailySummary } from './summary.ts';

// The cron route's logic (app/api/cron/daily/route.ts; spec sections 12 and 15). Vercel cron
// sends `Authorization: Bearer ${CRON_SECRET}`; only that exact header runs the job. A missing or
// blank CRON_SECRET refuses every request, so a deployment without it is closed, never open.
// Lint lets only app/api import this module, since it builds the secret client.

export const CRON_SECRET_VAR = 'CRON_SECRET';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/**
 * Whether the header is exactly `Bearer ${secret}`. Both sides are hashed first, so the
 * constant-time comparison always sees two 32-byte values and the time taken says nothing about
 * the secret's length or how much of it matched.
 */
export function isCronAuthorized(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (secret === undefined || secret.trim() === '' || authorization === null) return false;
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

export type CronResponse =
  | { readonly status: 200 | 500; readonly body: DailySummary }
  | { readonly status: 401 | 500; readonly body: { readonly error: string } };

export interface CronRequest {
  readonly authorization: string | null;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface CronDeps {
  readonly now: () => Date;
  readonly createClient?: () => SupabaseClient;
  readonly runJob?: (client: SupabaseClient, now: Date) => Promise<DailySummary>;
  readonly log?: DailyLog;
  /**
   * Marks the public read cache stale (lib/queries/cache.ts). Its entries are keyed by the
   * reports' version, which the prune does not change, so the route passes revalidateTag here.
   */
  readonly revalidatePublicReads?: () => void;
}

const LOG_PREFIX = 'testpulse daily:';
const UNAUTHORIZED: CronResponse = { status: 401, body: { error: 'Unauthorized' } };

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

// What a public page shows that the prune can remove: results, failure text and pruned marks.
const prunedPublicRows = ({ pruned }: DailySummary): boolean =>
  pruned.results + pruned.result_failures + pruned.runs_marked_pruned > 0;

// A cache that stays stale until its 300 s fallback is not worth failing a job that did its work,
// so a failure is logged by its name alone and the summary stands.
function revalidateAfterPrune(summary: DailySummary, deps: CronDeps, log: DailyLog): void {
  if (deps.revalidatePublicReads === undefined || !prunedPublicRows(summary)) return;
  try {
    deps.revalidatePublicReads();
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    log.error(`${LOG_PREFIX} revalidating the public read cache failed: ${name}`);
  }
}

export async function handleDailyCron(request: CronRequest, deps: CronDeps): Promise<CronResponse> {
  const log = deps.log ?? { info: console.info, error: console.error };
  const secret = request.env[CRON_SECRET_VAR];
  if (secret === undefined || secret.trim() === '') {
    log.error(`${LOG_PREFIX} ${CRON_SECRET_VAR} is not set, so every request is refused`);
    return UNAUTHORIZED;
  }
  if (!isCronAuthorized(request.authorization, secret)) return UNAUTHORIZED;

  let client: SupabaseClient;
  let now: Date;
  try {
    client = (deps.createClient ?? (() => createSecretClient()))();
    now = deps.now();
  } catch (error) {
    // createSecretClient names a missing setting, never its value.
    log.error(`${LOG_PREFIX} not configured: ${messageOf(error)}`);
    return { status: 500, body: { error: 'The daily job is not configured.' } };
  }

  try {
    const summary = await (deps.runJob ?? runDailyJob)(client, now);
    revalidateAfterPrune(summary, deps, log);
    return { status: summary.status === 'ok' ? 200 : 500, body: summary };
  } catch (error) {
    log.error(`${LOG_PREFIX} failed unexpectedly: ${messageOf(error)}`);
    return { status: 500, body: { error: 'The daily job failed unexpectedly.' } };
  }
}
