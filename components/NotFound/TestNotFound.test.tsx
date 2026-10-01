// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TestNotFound } from './TestNotFound';

const KEY = '0'.repeat(64);
const route = vi.hoisted(() => ({ slug: 'ostomate2', path: '' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: route.slug, testKey: KEY }),
  usePathname: () => route.path,
}));

afterEach(cleanup);

const PROJECTS = [
  { name: 'Ostomate 2.0', href: '/p/ostomate2', status: 'passed' as const },
  { name: 'testpulse', href: '/p/testpulse', status: 'not_reporting' as const },
];
const LATEST_RUNS = { '/p/ostomate2': '/p/ostomate2/runs/r9' };

// design/components.md "NotFound (page)": a test URL names a project; when that project exists the
// test kind answers, with breadcrumbs, and an unknown project in a test URL is the project kind.
describe('TestNotFound', () => {
  it('a known project: the test kind, under "Overview / {project} / Not found"', () => {
    route.slug = 'ostomate2';
    route.path = `/p/ostomate2/tests/${KEY}`;
    const { getByRole, container } = render(
      <TestNotFound projects={PROJECTS} latestRuns={LATEST_RUNS} />,
    );

    expect(getByRole('heading', { level: 1 }).textContent).toBe('This test isn’t in Ostomate 2.0');
    expect(container.querySelector('[data-part="path"]')?.textContent).toBe(route.path);
    expect(getByRole('link', { name: 'Latest Ostomate 2.0 results' }).getAttribute('href')).toBe(
      '/p/ostomate2/runs/r9',
    );
    const crumbs = getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      [...crumbs.querySelectorAll('a')].map((link) => [
        link.textContent,
        link.getAttribute('href'),
      ]),
    ).toEqual([
      ['Overview', '/'],
      ['Ostomate 2.0', '/p/ostomate2'],
    ]);
    expect(crumbs.querySelector('[aria-current="page"]')?.textContent).toBe('Not found');
  });

  it('a known project with no run: the test kind, going to the project page', () => {
    route.slug = 'testpulse';
    route.path = `/p/testpulse/tests/${KEY}`;
    const { getByRole, queryByRole } = render(
      <TestNotFound projects={PROJECTS} latestRuns={LATEST_RUNS} />,
    );

    expect(getByRole('heading', { level: 1 }).textContent).toBe('This test isn’t in testpulse');
    expect(queryByRole('link', { name: /^Latest/ })).toBeNull();
    expect(getByRole('link', { name: 'Go to testpulse' }).getAttribute('href')).toBe(
      '/p/testpulse',
    );
  });

  it('an unknown project: the project kind, with no breadcrumbs', () => {
    route.slug = 'nope';
    route.path = `/p/nope/tests/${KEY}`;
    const { getByRole, queryByRole } = render(
      <TestNotFound projects={PROJECTS} latestRuns={LATEST_RUNS} />,
    );

    expect(getByRole('heading', { level: 1 }).textContent).toBe('No project at this address');
    expect(queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });
});
