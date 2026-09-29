// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { NotFound } from './NotFound';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'NotFound.module.css');

const PROJECTS = [
  { name: 'Ostomate 2.0', href: '/p/ostomate2', status: 'passed' as const },
  { name: 'testpulse', href: '/p/testpulse', status: 'not_reporting' as const },
];

describe('NotFound (project)', () => {
  it('says 404, names the problem, shows the path and lists the projects', () => {
    const { getByRole, container } = render(
      <NotFound kind="project" path="/p/nope" projects={PROJECTS} />,
    );
    const main = getByRole('main');

    expect(main.id).toBe('main');
    expect(container.querySelector('[data-part="eyebrow"]')?.textContent).toBe('404 · Not found');
    expect(getByRole('heading', { level: 1 }).textContent).toBe('No project at this address');
    expect(container.querySelector('[data-part="path"]')?.textContent).toBe('/p/nope');
    expect(main.querySelector('p')?.textContent).toBe(
      'The link may be mistyped, or the project may have been renamed. These are the projects testpulse reports on.',
    );
    const list = getByRole('list', { name: 'Projects' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => [link.getAttribute('href'), link.textContent])).toEqual([
      ['/p/ostomate2', 'Ostomate 2.0Passed'],
      ['/p/testpulse', 'testpulseNot reporting yet'],
    ]);
    expect(links[0]?.querySelector('[data-status]')?.getAttribute('data-variant')).toBe('inline');
  });

  it('offers the overview as a primary button link, with no retry', () => {
    const { getByRole, queryByRole } = render(
      <NotFound kind="project" path="/p/nope" projects={PROJECTS} />,
    );
    const overview = getByRole('link', { name: 'Go to overview' });

    expect(overview.getAttribute('href')).toBe('/');
    expect(overview.dataset.variant).toBe('primary');
    expect(queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('sets the column, eyebrow, headline, path chip, body and list as the design draws them', () => {
    expect(ruleFor(CSS, '.main')).toEqual({
      'max-width': '640px',
      padding: 'var(--space-8) 0 var(--space-11)',
    });
    expect(ruleFor(CSS, '.eyebrow')).toEqual({
      font: 'var(--text-label)',
      'letter-spacing': '0.08em',
      'text-transform': 'uppercase',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.title')).toEqual({
      margin: '14px 0px 0px',
      font: '500 clamp(34px, 4.5vw, 48px)/1.1 var(--font-serif)',
      'letter-spacing': '-0.02em',
      'text-wrap': 'balance',
    });
    expect(ruleFor(CSS, '.path')).toMatchObject({
      'margin-top': 'var(--space-4)',
      padding: '6px 10px',
      'border-radius': 'var(--radius-tag)',
      background: 'var(--inset)',
      border: '1px solid var(--line)',
      font: '13.5px/1.5 var(--font-mono)',
      color: 'var(--ink-2)',
      'overflow-wrap': 'anywhere',
    });
    expect(ruleFor(CSS, '.body')).toMatchObject({
      margin: 'var(--space-4) 0 0',
      font: '400 19px/1.5 var(--font-serif)',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.projects')).toMatchObject({
      margin: 'var(--space-5) 0 0',
      padding: '6px',
      'max-width': '440px',
      gap: '2px',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-md)',
    });
    expect(ruleFor(CSS, '.project')).toMatchObject({
      'min-height': 'var(--target-min)',
      padding: '0 var(--space-3)',
      'border-radius': 'var(--radius-tag)',
    });
    expect(ruleFor(CSS, '.project:hover')).toEqual({ background: 'var(--raised)' });
    expect(ruleFor(CSS, '.actions')).toMatchObject({
      gap: 'var(--space-3)',
      'margin-top': 'var(--space-5)',
    });
  });
});
