// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { Breadcrumbs } from './Breadcrumbs';
import styles from './Breadcrumbs.module.css';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'Breadcrumbs.module.css');

describe('Breadcrumbs', () => {
  it('links each ancestor and marks the current page', () => {
    const { getByRole } = render(
      <Breadcrumbs
        items={[
          { label: 'Overview', href: '/' },
          { label: 'Ostomate2', href: '/p/ostomate2' },
        ]}
        current="Run 35776037304"
      />,
    );
    const nav = getByRole('navigation', { name: 'Breadcrumb' });
    const links = within(nav).getAllByRole('link');

    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Overview', '/'],
      ['Ostomate2', '/p/ostomate2'],
    ]);
    const current = within(nav).getByText('Run 35776037304');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.tagName).not.toBe('A');
    expect(current.dataset.mono).toBe('false');
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3);
  });

  it('hides the separators from assistive technology', () => {
    const { getByRole } = render(
      <Breadcrumbs items={[{ label: 'Overview', href: '/' }]} current="Ostomate2" />,
    );
    const nav = getByRole('navigation', { name: 'Breadcrumb' });
    const separators = [...nav.querySelectorAll('[aria-hidden="true"]')];

    expect(separators.map((s) => s.textContent)).toEqual(['/']);
    expect(nav.textContent).toBe('Overview/Ostomate2');
  });

  it('sets a test name as the current page in monospace', () => {
    const { getByText } = render(
      <Breadcrumbs
        items={[{ label: 'Overview', href: '/' }]}
        current="HomeViewModelTest › rendersToday"
        currentMono
      />,
    );
    expect(getByText('HomeViewModelTest › rendersToday').dataset.mono).toBe('true');
  });

  it('makes every link and the current page a 44px flex item', () => {
    const target = styles.target;
    if (!target) throw new Error('Breadcrumbs.module.css has no .target');
    const { getByRole, getByText } = render(
      <Breadcrumbs items={[{ label: 'Overview', href: '/' }]} current="Ostomate2" />,
    );
    expect(getByRole('link', { name: 'Overview' }).classList.contains(target)).toBe(true);
    expect(getByText('Ostomate2').classList.contains(target)).toBe(true);
    expect(ruleFor(CSS, '.target')).toEqual({
      'min-height': 'var(--target-min)',
      display: 'flex',
      'align-items': 'center',
    });
  });
});
