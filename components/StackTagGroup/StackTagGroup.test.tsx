// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { StackTagGroup, type StackGroup } from './StackTagGroup';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'StackTagGroup.module.css');

const BUILT: StackGroup[] = [
  { category: 'Language', items: [{ name: 'Kotlin 2.3' }, { name: 'Kotlin Multiplatform' }] },
  { category: 'UI', items: [{ name: 'Compose Multiplatform 1.11' }] },
];

const TESTED: StackGroup[] = [
  { category: 'Frameworks', items: [{ name: 'kotlin.test' }, { name: 'JUnit4' }] },
  {
    category: 'E2E',
    items: [
      { name: 'Maestro', declaredStatus: 'runs_in_ci_not_reported' },
      { name: 'Maestro', declaredStatus: 'authored_not_executed' },
    ],
  },
];

const tagsOf = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[data-part="tag"]'),
];

describe('StackTagGroup', () => {
  // Design v4 item 27: the title is part of the component, fixed by variant, and a heading.
  it('titles each variant with a level 3 heading by default', () => {
    const { getByRole, unmount } = render(<StackTagGroup variant="built" groups={BUILT} />);
    expect(getByRole('heading', { level: 3 }).textContent).toBe('Built with');
    unmount();
    const tested = render(<StackTagGroup variant="tested" groups={TESTED} />);
    expect(tested.getByRole('heading', { level: 3 }).textContent).toBe('Tested with');
  });

  it('takes the heading level the page sets', () => {
    const { getByRole } = render(
      <StackTagGroup variant="tested" groups={TESTED} headingLevel={4} />,
    );
    expect(getByRole('heading', { level: 4 }).textContent).toBe('Tested with');
  });

  it('sets the title as a mono 12/600 uppercase label in --ink-3, 14 above the tags', () => {
    expect(ruleFor(CSS, '.title')).toEqual({
      margin: '0px 0px 14px',
      font: 'var(--text-label)',
      'letter-spacing': '0.08em',
      'text-transform': 'uppercase',
      color: 'var(--ink-3)',
    });
  });

  it('pairs each category with its tags as a description list, in the given order', () => {
    const { container } = render(<StackTagGroup variant="built" groups={BUILT} />);
    const list = container.querySelector('dl');

    expect([...(list?.querySelectorAll('dt') ?? [])].map((dt) => dt.textContent)).toEqual([
      'Language',
      'UI',
    ]);
    const [language, ui] = [...(list?.querySelectorAll('dd') ?? [])];
    expect(
      within(language as HTMLElement)
        .getAllByRole('listitem')
        .map((t) => t.textContent),
    ).toEqual(['Kotlin 2.3', 'Kotlin Multiplatform']);
    expect(within(ui as HTMLElement).getAllByRole('listitem')[0]?.textContent).toBe(
      'Compose Multiplatform 1.11',
    );
  });

  it('built: every tag is solid, on the inset fill with a --line border', () => {
    const { container } = render(<StackTagGroup variant="built" groups={BUILT} />);
    expect((container.firstElementChild as HTMLElement).dataset.variant).toBe('built');
    expect(tagsOf(container).every((t) => t.dataset.declared === undefined)).toBe(true);
    expect(ruleFor(CSS, '.built .tag')).toEqual({
      background: 'var(--inset)',
      'border-color': 'var(--line)',
    });
  });

  it('tested: no fill and a --line-strong border', () => {
    const { container } = render(<StackTagGroup variant="tested" groups={TESTED} />);
    expect((container.firstElementChild as HTMLElement).dataset.variant).toBe('tested');
    expect(ruleFor(CSS, '.tested .tag')).toEqual({
      background: 'transparent',
      'border-color': 'var(--line-strong)',
    });
  });

  it('marks a declared suite in words and with a dashed border in --ink-2', () => {
    const { container } = render(<StackTagGroup variant="tested" groups={TESTED} />);
    const declared = tagsOf(container).filter((t) => t.dataset.declared !== undefined);

    expect(declared.map((t) => [t.textContent, t.dataset.declared])).toEqual([
      ['Maestro · not yet reported', 'runs_in_ci_not_reported'],
      ['Maestro · not yet executed', 'authored_not_executed'],
    ]);
    expect(ruleFor(CSS, '.declared')).toEqual({
      'border-style': 'dashed',
      color: 'var(--ink-2)',
    });
  });

  it('lays out a 96px category column with 6px-radius tags, 13.5px', () => {
    expect(ruleFor(CSS, '.group')).toEqual({
      display: 'grid',
      'grid-template-columns': '96px minmax(0, 1fr)',
      gap: 'var(--space-3) var(--space-4)',
      'align-items': 'start',
      margin: '0px',
      'font-size': '13.5px',
    });
    expect(ruleFor(CSS, '.category')).toEqual({ color: 'var(--ink-3)', 'padding-top': '5px' });
    expect(ruleFor(CSS, '.tags')).toMatchObject({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: '6px',
    });
    expect(ruleFor(CSS, '.tag')).toEqual({
      padding: 'var(--space-1) 10px',
      'border-radius': 'var(--radius-tag)',
      border: '1px solid',
      color: 'var(--ink)',
    });
  });
});
