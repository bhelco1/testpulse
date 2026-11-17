import { createPublicClient } from '../supabase/public.ts';
import { cachedRead, dataVersion, sharedRead } from './cache.ts';
import {
  loadProjectHead,
  loadRunHead,
  loadTestHead,
  type RunHead,
  type TestHead,
} from './heads.ts';
import { howItsTestedAsOf, loadHowItsTested, type HowItsTested } from './how-its-tested.ts';
import { landingAsOf, loadLanding, type Landing } from './landing.ts';
import {
  loadProjectPage,
  projectPageAsOf,
  runListLimit,
  type ProjectPage,
  type ProjectPageOptions,
} from './project.ts';
import type { ProjectDetail } from './project-summary.ts';
import { loadRunResults, loadRunShell, runDetailOf, type RunDetail } from './run.ts';
import { loadSiteChrome, type SiteChrome } from './site.ts';
import { loadTestHistory, type TestHistoryPage } from './test-history.ts';

// What the public pages and their heads read (decision 2026-11-17): the lib/queries loaders,
// cached by lib/queries/cache.ts. Each loader builds its own publishable-key client inside the
// cached read, so the key holds only plain arguments. Everything shown relative to now is put
// back at the exact instant `at` (the *AsOf functions); a run's per-test rows are read live.
// The tracked-link lead (lib/queries/lead.ts) is per visitor and is never read through here.

const siteChrome = cachedRead('site-chrome', (_: readonly [], until) =>
  loadSiteChrome(undefined, until),
);
const landing = cachedRead('landing', (_: readonly [], until) => loadLanding(undefined, until));
const howItsTested = cachedRead('how-its-tested', (_: readonly [], until) =>
  loadHowItsTested(undefined, until),
);
const projectPage = cachedRead(
  'project-page',
  ([slug, branches, runLimit]: readonly [string, 'default' | 'all', number], until) =>
    loadProjectPage(slug, { branches, runLimit }, undefined, until),
);
const runShell = cachedRead('run-shell', ([slug, runId]: readonly [string, string], until) =>
  loadRunShell(slug, runId, undefined, until),
);
const testHistory = cachedRead(
  'test-history',
  ([slug, testKey]: readonly [string, string], until) =>
    loadTestHistory(slug, testKey, undefined, until),
);
const projectHead = cachedRead('project-head', ([slug]: readonly [string]) =>
  loadProjectHead(slug),
);
const runHead = cachedRead('run-head', ([slug, runId]: readonly [string, string]) =>
  loadRunHead(slug, runId),
);
const testHead = cachedRead('test-head', ([slug, testKey]: readonly [string, string]) =>
  loadTestHead(slug, testKey),
);

export const readSiteChrome = (at: Date): Promise<SiteChrome> => siteChrome([], at);

export async function readLanding(at: Date): Promise<Landing> {
  return landingAsOf(await landing([], at), at);
}

export async function readHowItsTested(at: Date): Promise<HowItsTested> {
  return howItsTestedAsOf(await howItsTested([], at), at);
}

export async function readProjectPage(
  slug: string,
  options: ProjectPageOptions,
  at: Date,
): Promise<ProjectPage | null> {
  const page = await projectPage(
    [slug, options.branches ?? 'default', runListLimit(options.runLimit)],
    at,
  );
  return page === null ? null : projectPageAsOf(page, at);
}

export async function readRunDetail(
  slug: string,
  runId: string,
  at: Date,
): Promise<RunDetail | null> {
  const shell = await runShell([slug, runId], at);
  if (shell === null) return null;
  const { flakyTestIds } = shell;
  if (flakyTestIds === null) return runDetailOf(shell, null);
  // Never cached: a large public run's rows are 0.4 to 2 MB, over the cache's budget.
  const results = await sharedRead(
    'run-results',
    [shell.run.id, await dataVersion(), flakyTestIds.join(',')],
    () => loadRunResults(createPublicClient(), shell.run.id, flakyTestIds),
  );
  return runDetailOf(shell, results);
}

export const readTestHistory = (
  slug: string,
  testKey: string,
  at: Date,
): Promise<TestHistoryPage | null> => testHistory([slug, testKey], at);

export const readProjectHead = (slug: string, at: Date): Promise<ProjectDetail | null> =>
  projectHead([slug], at);

export const readRunHead = (slug: string, runId: string, at: Date): Promise<RunHead | null> =>
  runHead([slug, runId], at);

export const readTestHead = (slug: string, testKey: string, at: Date): Promise<TestHead | null> =>
  testHead([slug, testKey], at);
