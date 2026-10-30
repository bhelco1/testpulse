// @vitest-environment jsdom
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { within } from '@testing-library/dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ruleFor } from '../components/testing/stylesheet';
import { fakeClient, type Answer } from '../lib/queries/fake-client.test-support';
import LandingPage, { metadata } from './page';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
// connection() needs a request; the render here is the page function called directly.
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
// No session cookie: the visitor did not arrive by a tracked link, so no lead is asked for.
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));
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

// design/components.md, "Site name, wordmark and page titles" (v20): Landing's document title is
// the name and the tagline, and the same string is the social share title.
describe('the landing page’s metadata', () => {
  it('is titled "Testament · A testament to every test." for the tab and for sharing', () => {
    const title = 'Testament · A testament to every test.';
    expect(metadata.title).toBe(title);
    expect(metadata.openGraph?.title).toBe(title);
    expect(metadata.twitter?.title).toBe(title);
  });
});

// design v20 item 3: the lede's serif type at 500 in --ink, above the lede's 400 in --ink-2.
describe('the landing page’s tagline style', () => {
  it('sets the tagline in the lede’s type, at weight 500 in --ink', () => {
    const css = join(import.meta.dirname, 'page.module.css');
    expect(ruleFor(css, '.tagline')).toEqual({
      margin: '0px',
      font: '500 clamp(20px, 2.2vw, 24px) / 1.3 var(--font-serif)',
      color: 'var(--ink)',
    });
    expect(ruleFor(css, '.lede')).toMatchObject({
      font: '400 clamp(20px, 2.2vw, 24px) / 1.3 var(--font-serif)',
      color: 'var(--ink-2)',
    });
  });
});

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
    // v20: the tagline leads the page only when the page has something to lead.
    expect(main.queryByText('A testament to every test.')).toBeNull();
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
    // v20: the tagline is the line directly above the h1 lede, and is not a heading itself.
    const tagline = main.getByText('A testament to every test.');
    expect(tagline.tagName).toBe('P');
    expect(tagline.nextElementSibling).toBe(main.getByRole('heading', { level: 1 }));
    expect(main.getByRole('heading', { level: 2 }).textContent).toBe('No projects yet');
    expect(
      main.getByText('Projects appear here once they’re registered and send their first report.'),
    ).toBeTruthy();
    expect(main.getByRole('link', { name: 'How Testament is tested' }).getAttribute('href')).toBe(
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
