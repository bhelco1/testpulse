// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { ProjectSwitcher, type SwitcherProject } from './ProjectSwitcher';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'ProjectSwitcher.module.css');

const PROJECTS: SwitcherProject[] = [
  { name: 'Ostomate2', href: '/p/ostomate2', status: 'passed' },
  { name: 'RouteServe', href: '/p/routeserve', status: 'failed' },
  { name: 'testpulse', href: '/p/testpulse', status: 'not_reporting' },
];

function renderSwitcher(currentHref?: string) {
  const utils = render(
    <div>
      <ProjectSwitcher projects={PROJECTS} currentHref={currentHref} />
      <button type="button">Elsewhere</button>
    </div>,
  );
  const button = utils.getByRole('button', { name: 'Projects' });
  const panelId = button.getAttribute('aria-controls') ?? '';
  const panel = utils.container.querySelector<HTMLElement>(`[id="${panelId}"]`);
  if (!panel) throw new Error('aria-controls does not point at the panel');
  const open = () => {
    fireEvent.click(button);
    return within(panel).getAllByRole('link');
  };
  return { ...utils, button, panel, open };
}

const chevron = (button: HTMLElement) => button.querySelector('svg path')?.getAttribute('d');

describe('ProjectSwitcher', () => {
  it('starts closed, with the panel hidden and a down chevron', () => {
    const { button, panel } = renderSwitcher();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(chevron(button)).toBe('m6 9 6 6 6-6');
  });

  it('opens on click to one list of links, each with its latest status in words', () => {
    const { button, panel, open } = renderSwitcher();
    const links = open();

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(chevron(button)).toBe('m18 15-6-6-6 6');
    expect(within(panel).getAllByRole('list')).toHaveLength(1);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/p/ostomate2',
      '/p/routeserve',
      '/p/testpulse',
    ]);
    const badge = (i: number, word: string) => within(links[i] ?? panel).getByText(word);
    expect(badge(0, 'Passed').dataset.variant).toBe('inline');
    expect(badge(1, 'Failed').dataset.status).toBe('failed');
    expect(badge(2, 'Not reporting yet').dataset.status).toBe('not_reporting');
    expect(within(panel).queryByRole('img')).toBeNull();
  });

  it('marks the current project with "Current" and aria-current, and no other', () => {
    const { panel, open } = renderSwitcher('/p/routeserve');
    const links = open();

    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null]);
    const current = within(panel).getByText('Current');
    expect(links[1]?.contains(current)).toBe(true);
    expect(within(panel).getAllByText('Current')).toHaveLength(1);
  });

  it('shows no "Current" when the page is not a project page', () => {
    const { panel, open } = renderSwitcher();
    open();
    expect(within(panel).queryByText('Current')).toBeNull();
  });

  it('closes on a second click', () => {
    const { button, panel, open } = renderSwitcher();
    open();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });

  it('closes when a project is selected', () => {
    const { button, panel, open } = renderSwitcher();
    const [first] = open();
    if (!first) throw new Error('no links');
    fireEvent.click(first);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });

  it('closes on Escape and returns focus to the button', () => {
    const { button, panel, open } = renderSwitcher();
    const [first] = open();
    if (!first) throw new Error('no links');
    first.focus();

    fireEvent.keyDown(first, { key: 'Escape' });

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it('ignores Escape while closed and other keys while open', () => {
    const { button, panel, open } = renderSwitcher();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    open();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(panel.hidden).toBe(false);
  });

  it('closes on a click outside it, and not on a click inside the panel', () => {
    const { button, panel, open, getByRole } = renderSwitcher();
    open();

    fireEvent.pointerDown(panel);
    expect(panel.hidden).toBe(false);

    fireEvent.pointerDown(getByRole('button', { name: 'Elsewhere' }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });

  it('stays open while focus moves between its links, and closes when focus leaves it', () => {
    const { button, panel, open, getByRole } = renderSwitcher();
    const [first, second] = open();
    if (!first || !second) throw new Error('no links');

    fireEvent.blur(first, { relatedTarget: second });
    expect(panel.hidden).toBe(false);

    fireEvent.blur(second, { relatedTarget: getByRole('button', { name: 'Elsewhere' }) });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });

  // components.md (design v10): "the Projects menu opens to a single non-link line 'No projects
  // yet' (14 --ink-3, 44 tall)".
  it('opens to one non-link line, "No projects yet", when no project is registered', () => {
    const { getByRole, container } = render(<ProjectSwitcher projects={[]} />);
    const button = getByRole('button', { name: 'Projects' });
    const panel = container.querySelector<HTMLElement>(
      `[id="${button.getAttribute('aria-controls') ?? ''}"]`,
    );
    if (!panel) throw new Error('aria-controls does not point at the panel');
    fireEvent.click(button);

    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toBe('No projects yet');
    expect(within(panel).queryAllByRole('link')).toEqual([]);
    expect(within(panel).queryAllByRole('list')).toEqual([]);
    expect(ruleFor(CSS, '.empty')).toMatchObject({
      'min-height': 'var(--target-min)',
      'font-size': '14px',
      color: 'var(--ink-3)',
    });
  });

  it('draws the panel and rows as the design does, current and hover on the same fill', () => {
    expect(ruleFor(CSS, '.panel')).toMatchObject({
      width: '320px',
      padding: '6px',
      background: 'var(--raised)',
      border: '1px solid var(--line-strong)',
      'border-radius': 'var(--radius-md)',
      'box-shadow': 'var(--shadow-menu)',
    });
    expect(ruleFor(CSS, '.item')).toMatchObject({
      'min-height': 'var(--target-min)',
      padding: '0px 12px',
      'border-radius': 'var(--radius-tag)',
    });
    expect(ruleFor(CSS, ".item[aria-current='page'], .item:hover, .item:focus-visible")).toEqual({
      background: 'var(--surface)',
    });
    expect(ruleFor(CSS, '.name')).toMatchObject({ 'font-size': '15px', 'font-weight': '600' });
    expect(ruleFor(CSS, '.current')).toEqual({ 'font-size': '13px', color: 'var(--ink-3)' });
  });
});
