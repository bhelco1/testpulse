// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunNotFound } from './RunNotFound';

const route = vi.hoisted(() => ({ slug: 'ostomate2', path: '/p/ostomate2/runs/nope' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: route.slug, id: 'nope' }),
  usePathname: () => route.path,
}));

afterEach(cleanup);

const PROJECTS = [
  { name: 'Ostomate 2.0', href: '/p/ostomate2', status: 'passed' as const },
  { name: 'RouteServe', href: '/p/routeserve', status: 'failed' as const },
];

// design/components.md "NotFound (page)": a run URL names a project; when that project exists the
// run kind answers, with breadcrumbs, and an unknown project in a run URL is the project kind.
describe('RunNotFound', () => {
  it('a known project: the run kind, under "Overview / {project} / Not found"', () => {
    route.slug = 'ostomate2';
    route.path = '/p/ostomate2/runs/nope';
    const { getByRole, container } = render(<RunNotFound projects={PROJECTS} />);

    expect(getByRole('heading', { level: 1 }).textContent).toBe('This run isn’t in Ostomate 2.0');
    expect(container.querySelector('[data-part="path"]')?.textContent).toBe(
      '/p/ostomate2/runs/nope',
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

  it('an unknown project: the project kind, with no breadcrumbs', () => {
    route.slug = 'nope';
    route.path = '/p/nope/runs/nope';
    const { getByRole, queryByRole } = render(<RunNotFound projects={PROJECTS} />);

    expect(getByRole('heading', { level: 1 }).textContent).toBe('No project at this address');
    expect(queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });
});
