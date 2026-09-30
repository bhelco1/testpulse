import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeClient, type Answer, type Query } from '../../../lib/queries/fake-client.test-support';
import { generateMetadata as projectHead } from './page';
import { generateMetadata as runHead } from './runs/[id]/page';
import { generateMetadata as testHead } from './tests/[testKey]/page';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

// Next.js prefetches the head of every linked page that scrolls into view, up to four at a time,
// and a head request runs generateMetadata alone. A head that read its whole page made each run
// link on the project page cost a full run page load, which starved the visitor's own
// navigations on the server (decision 2026-09-30). So each head reads only what its title needs.

const RUN_ID = '0b5a3c1e-6f0e-4d1c-9a55-3c2a1b0f9e77';
const KEY = 'a'.repeat(64);

const projectRow = (visibility: 'public' | 'private') => ({
  id: 'project-1',
  slug: 'ostomate2',
  name: 'Ostomate 2.0',
  tagline: 'Tracker',
  visibility,
  default_branch: 'main',
  declared_suites: [],
  coverage_floors: {},
  expected_cadence_days: 8,
  description: 'About it.',
  repo_url: visibility === 'public' ? 'https://github.com/bhelco1/Ostomate2' : null,
  dev_stack: [],
  test_stack: [],
});

const runRow = {
  id: RUN_ID,
  ci_run_id: '36100000009',
  run_attempt: 1,
  commit_sha: 'c1',
  branch: 'main',
  status: 'failed',
  passed: 2,
  failed: 1,
  skipped: 1,
  started_at: '2026-10-05T09:26:00+00:00',
  finished_at: '2026-10-05T09:26:17.747+00:00',
  source: 'ci',
  event: 'push',
  run_url: null,
  total: 4,
  duration_ms: 26_000,
  results_pruned_at: null,
};

const testRow = {
  id: 'test-1',
  test_key: KEY,
  module: 'composeApp',
  suite: 'com.ostomate.app.HomeViewModelTest',
  name: 'rendersToday',
  layer: 'unit',
  first_seen_at: '2026-09-24T14:05:00+00:00',
  last_seen_at: '2026-10-05T09:26:17.747+00:00',
};

// Every table the pages read answers; only the project, the run and the test have rows.
const answering =
  (visibility: 'public' | 'private', found = true) =>
  (query: Query): Answer => {
    if (query.table === 'projects_public') return { data: [projectRow(visibility)] };
    if (!found) return { data: [] };
    if (query.table === 'runs_public') return { data: [runRow] };
    if (query.table === 'tests') return { data: [testRow] };
    return { data: [] };
  };

let queries: Query[];

function serve(visibility: 'public' | 'private', found = true) {
  const fake = fakeClient(answering(visibility, found));
  queries = fake.queries;
  vi.mocked(createClient).mockReturnValue(
    fake.client as unknown as ReturnType<typeof createClient>,
  );
}

const tables = () => queries.map((query) => query.table);
const searchParams = Promise.resolve({ branches: 'all' });

describe('page heads read only what their titles need', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_test_placeholder');
    vi.stubEnv('TESTPULSE_FIXED_NOW', '2026-10-05T12:00:00.000Z');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createClient).mockReset();
  });

  it('the project page reads the project alone', async () => {
    serve('public');

    const head = await projectHead({
      params: Promise.resolve({ slug: 'ostomate2' }),
      searchParams,
    });

    expect(head).toEqual({ title: 'Ostomate 2.0 · testpulse' });
    expect(tables()).toEqual(['projects_public']);
  });

  it('the run page reads the project and the run, and no results', async () => {
    serve('public');

    const head = await runHead({ params: Promise.resolve({ slug: 'ostomate2', id: RUN_ID }) });

    expect(head).toEqual({ title: 'Push to main · Ostomate 2.0 · testpulse' });
    expect(tables()).toEqual(['projects_public', 'runs_public']);
  });

  it('a private project’s run is titled by its CI run ID, as its page heads it', async () => {
    serve('private');

    const head = await runHead({ params: Promise.resolve({ slug: 'ostomate2', id: RUN_ID }) });

    expect(head).toEqual({ title: 'Run 36100000009 · Ostomate 2.0 · testpulse' });
  });

  it('the test history page reads the project and the test, and no results', async () => {
    serve('public');

    const head = await testHead({ params: Promise.resolve({ slug: 'ostomate2', testKey: KEY }) });

    expect(head).toEqual({ title: 'rendersToday · Ostomate 2.0 · testpulse' });
    expect(tables()).toEqual(['projects_public', 'tests']);
  });

  it('each reads Not found when there is no such run or test', async () => {
    serve('public', false);

    expect(await runHead({ params: Promise.resolve({ slug: 'ostomate2', id: RUN_ID }) })).toEqual({
      title: 'Not found · testpulse',
    });
    expect(
      await testHead({ params: Promise.resolve({ slug: 'ostomate2', testKey: KEY }) }),
    ).toEqual({ title: 'Not found · testpulse' });
  });
});
