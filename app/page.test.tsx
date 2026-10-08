// @vitest-environment jsdom
import { createClient } from '@supabase/supabase-js';
import { within } from '@testing-library/dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeClient, type Answer } from '../lib/queries/fake-client.test-support';
import LandingPage from './page';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
// connection() needs a request; the render here is the page function called directly.
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// The two landing states the seed cannot produce, rendered as the server sends them (no
// JavaScript runs): the database not answering, and no project registered. The seeded page is
// tests/e2e/home.spec.ts.

function serve(answer: () => Answer) {
  const fake = fakeClient(answer);
  vi.mocked(createClient).mockReturnValue(
    fake.client as unknown as ReturnType<typeof createClient>,
  );
}

async function render(): Promise<HTMLElement> {
  document.body.innerHTML = renderToStaticMarkup(await LandingPage());
  return document.body;
}

describe('the landing page', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_test_placeholder');
    vi.stubEnv('TESTPULSE_FIXED_NOW', '2026-10-05T12:00:00.000Z');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createClient).mockReset();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows the page ErrorState, retried by a link to /, when the database does not answer', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serve(() => ({ error: { code: 'PGRST002', message: 'Could not query the database' } }));

    const main = within((await render()).querySelector('main') as HTMLElement);

    expect(main.getByRole('alert')).toBeTruthy();
    expect(main.getByRole('heading', { level: 1 }).textContent).toBe('Results couldn’t be loaded');
    // design/components.md Landing, Error (design v10).
    expect(
      main.getByText(
        'The database isn’t answering, so nothing is shown rather than numbers that might be out of date. Try again in a minute.',
      ),
    ).toBeTruthy();
    expect(main.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe('/');
    expect(main.getByRole('link', { name: 'How it’s tested' }).getAttribute('href')).toBe(
      '/how-its-tested',
    );
    // Nothing that might be out of date is shown beside it.
    expect(main.queryByText('Live test results for every project I build.')).toBeNull();
    expect(document.body.querySelector('[data-part="tiles"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Last report received/);
    // The cause reaches the server log, by the query that failed and Postgres's code.
    expect(logged).toHaveBeenCalledWith(expect.stringMatching(/PGRST002/));
  });

  it('shows the h1 and the “No projects yet” card when no project is registered', async () => {
    serve(() => ({ data: [] }));

    const main = within((await render()).querySelector('main') as HTMLElement);

    expect(main.getByRole('heading', { level: 1 }).textContent).toBe(
      'Live test results for every project I build.',
    );
    expect(main.getByRole('heading', { level: 2 }).textContent).toBe('No projects yet');
    expect(
      main.getByText('Projects appear here once they’re registered and send their first report.'),
    ).toBeTruthy();
    expect(main.getByRole('link', { name: 'How testpulse is tested' }).getAttribute('href')).toBe(
      '/how-its-tested',
    );
    // The hero, tiles, Projects, feed and About are replaced by the card.
    expect(main.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'Live test results for every project I build.',
      'No projects yet',
    ]);
    expect(document.body.querySelector('[data-part="hero-total"]')).toBeNull();
  });
});
