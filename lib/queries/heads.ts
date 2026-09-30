import { runTitle } from '../runs/title.ts';
import { createPublicClient, type PublicClient } from '../supabase/public.ts';
import { loadProject, type ProjectDetail } from './project-summary.ts';
import { findRun } from './run.ts';
import { findTest, type HistoryTest } from './test-history.ts';

// What each page's head (its title) reads, and nothing more (decision 2026-09-30). Next.js
// prefetches the head of every linked page that scrolls into view, four at a time, and a head
// request runs generateMetadata alone; a head that read its whole page made each run link on the
// project page cost a full run page load, and those loads starved the visitor's own navigations.

/** The project page's head: the project, or null when there is none. */
export function loadProjectHead(
  slug: string,
  client: PublicClient = createPublicClient(),
): Promise<ProjectDetail | null> {
  return loadProject(client, slug);
}

export interface RunHead {
  readonly project: ProjectDetail;
  readonly run: { readonly ciRunId: string; readonly title: string };
}

/** The run page's head: its project and the run's title, or null when there is no such run. */
export async function loadRunHead(
  slug: string,
  runId: string,
  client: PublicClient = createPublicClient(),
): Promise<RunHead | null> {
  const project = await loadProject(client, slug);
  if (project === null) return null;
  const run = await findRun(client, project, runId);
  if (run === null) return null;
  return { project, run: { ciRunId: run.ciRunId, title: runTitle(run.event, run.branch) } };
}

export interface TestHead {
  readonly project: ProjectDetail;
  readonly test: HistoryTest;
}

/** The test history page's head: its project and the test, or null when there is no such test. */
export async function loadTestHead(
  slug: string,
  testKey: string,
  client: PublicClient = createPublicClient(),
): Promise<TestHead | null> {
  const project = await loadProject(client, slug);
  if (project === null) return null;
  const found = await findTest(client, project, testKey);
  if (found === null) return null;
  return { project, test: found.test };
}
