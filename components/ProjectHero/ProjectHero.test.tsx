// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { HeroView } from '../../lib/pages/project';
import { ruleFor } from '../testing/stylesheet';
import { timeLabel } from '../testing/time';
import { ProjectHero } from './ProjectHero';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'ProjectHero.module.css');

const HERO: HeroView = {
  name: 'Ostomate 2.0',
  private: false,
  tagline: 'Local-first ostomy supply tracker.',
  paragraphs: ['Tracks supply changes.', 'Second paragraph.'],
  health: { health: 'healthy' },
  healthDetail: ['Last report ', timeLabel('2 h ago')],
  repoUrl: 'https://github.com/bhelco1/Ostomate2',
  stale: null,
};

const PRIVATE_NOTE =
  'This repository is private, so failure details and source links are hidden. Counts, trends, and test names are real.';

describe('ProjectHero', () => {
  it('heads the page with the project name, then its tagline and description paragraphs', () => {
    const { getByRole, container } = render(
      <ProjectHero hero={HERO}>
        <article>card</article>
      </ProjectHero>,
    );

    expect(getByRole('heading', { level: 1 }).textContent).toBe('Ostomate 2.0');
    const texts = [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(texts).toEqual([
      'Local-first ostomy supply tracker.',
      'Tracks supply changes.',
      'Second paragraph.',
    ]);
    expect(container.textContent).toContain('card');
  });

  it('shows the health marker with its detail, and links the public repository', () => {
    const { getByRole, container } = render(<ProjectHero hero={HERO}>{null}</ProjectHero>);

    const marker = container.querySelector<HTMLElement>('[data-health]');
    expect(marker?.dataset.health).toBe('healthy');
    expect(marker?.textContent).toBe('Reporting healthy');
    expect(container.querySelector('[data-part="health-detail"]')?.textContent).toBe(
      'Last report 2 h ago',
    );
    const source = getByRole('link', { name: 'Source on GitHub' });
    expect(source.getAttribute('href')).toBe('https://github.com/bhelco1/Ostomate2');
    expect(source.querySelector('svg')?.getAttribute('width')).toBe('13');
    expect(container.textContent).not.toContain(PRIVATE_NOTE);
  });

  it('marks a private project with a lock in the heading and the private note, and no link', () => {
    const { getByRole, queryByRole, container } = render(
      <ProjectHero hero={{ ...HERO, name: 'RouteServe', private: true, repoUrl: null }}>
        {null}
      </ProjectHero>,
    );

    const heading = getByRole('heading', { level: 1 });
    expect(within(heading).getByRole('img', { name: 'Private repository' })).toBeTruthy();
    expect(heading.querySelector('svg')?.getAttribute('width')).toBe('26');
    expect(queryByRole('link', { name: 'Source on GitHub' })).toBeNull();
    const note = container.querySelector<HTMLElement>('[data-tone="neutral"]');
    expect(note?.textContent).toBe(PRIVATE_NOTE);
  });

  it('leaves out the detail where the design draws none', () => {
    const { container } = render(
      <ProjectHero hero={{ ...HERO, health: { health: 'below_floor' }, healthDetail: null }}>
        {null}
      </ProjectHero>,
    );
    expect(container.querySelector('[data-part="health-detail"]')).toBeNull();
  });

  it('puts a stale project’s notice above everything else', () => {
    const { container } = render(
      <ProjectHero
        hero={{
          ...HERO,
          health: { health: 'stale', days: 13 },
          healthDetail: ['Expected every 8 days'],
          stale: {
            title: 'testpulse hasn’t reported in 13 days',
            body: ['Everything below is from the last report, ', timeLabel('22 Sep'), '.'],
          },
        }}
      >
        {null}
      </ProjectHero>,
    );

    const notice = container.firstElementChild?.querySelector<HTMLElement>('[data-tone="attn"]');
    expect(notice?.querySelector('[data-part="title"]')?.textContent).toBe(
      'testpulse hasn’t reported in 13 days',
    );
    expect(notice?.querySelector('[data-part="body"]')?.textContent).toBe(
      'Everything below is from the last report, 22 Sep.',
    );
    expect(notice?.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-10-05T11:56:00.000Z',
    );
    expect(notice?.getAttribute('role')).toBeNull();
    expect(container.querySelector('[data-health]')?.textContent).toBe('No report in 13 days');
  });

  it('lays out the hero as the design draws it', () => {
    expect(ruleFor(CSS, '.stale')).toEqual({ 'margin-top': 'var(--space-6)' });
    expect(ruleFor(CSS, '.hero')).toMatchObject({
      display: 'grid',
      'grid-template-columns': 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
      gap: 'var(--space-8)',
      'align-items': 'start',
      padding: 'var(--space-8) 0 56px',
    });
    expect(ruleFor(CSS, '.intro')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      gap: '18px',
      'min-width': '0px',
    });
    expect(ruleFor(CSS, '.name')).toMatchObject({
      font: '500 clamp(44px, 6vw, 72px)/1 var(--font-serif)',
      'letter-spacing': '-0.03em',
      gap: '14px',
    });
    expect(ruleFor(CSS, '.tagline')).toMatchObject({
      'max-width': '640px',
      font: 'var(--text-lede)',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.description')).toMatchObject({
      'max-width': '620px',
      'font-size': '16px',
      'line-height': '1.6',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.meta')).toMatchObject({
      gap: '10px var(--space-6)',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.health')).toMatchObject({ gap: 'var(--space-2)' });
    expect(ruleFor(CSS, '.detail')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.source')).toMatchObject({
      'min-height': 'var(--target-min)',
      gap: '6px',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.privateNote')).toEqual({ 'max-width': '620px' });
  });
});
