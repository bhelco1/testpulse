// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { RunHeader, type RunHeaderProps } from './RunHeader';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'RunHeader.module.css');
const SHA = '0e2d0b4c1f9a7b3e5d6c8a9b0c1d2e3f4a5b6c7d';

const PUBLIC: RunHeaderProps = {
  status: 'passed',
  when: { text: '2 h ago', datetime: '2026-10-05T09:26:36.000Z', title: '5 Oct 2026, 09:26 UTC' },
  heading: { text: 'Push to main', private: false },
  meta: {
    branch: 'main',
    commit: { text: '0e2d0b4', href: `https://github.com/bhelco1/Ostomate2/commit/${SHA}` },
    event: 'push',
    started: {
      text: '5 Oct, 09:25 UTC',
      datetime: '2026-10-05T09:25:47.312Z',
      title: '5 Oct 2026, 09:25 UTC',
    },
    reports: '3',
    attempt: null,
    ciHref: 'https://github.com/bhelco1/Ostomate2/actions/runs/36100000009',
  },
  tiles: {
    tests: '142',
    passed: '142',
    failed: '0',
    skipped: '0',
    duration: '36 s',
    failTone: false,
  },
  banner: null,
};

const PRIVATE: RunHeaderProps = {
  ...PUBLIC,
  status: 'failed',
  heading: { text: 'Run 36200000011', private: true },
  meta: { ...PUBLIC.meta, commit: { text: '5f0a2c9', href: null }, ciHref: null },
  tiles: { ...PUBLIC.tiles, tests: '1,041', passed: '1,040', failed: '1', failTone: true },
  banner: {
    title: '1 test failed: asset.test.ts › assetCreateSchema accepts a minimal valid asset',
    body:
      'In packages/shared, Unit layer. This repository is private, so failure messages and ' +
      'stack traces are hidden.',
    action: 'Show failure',
    filter: 'failed',
  },
};

const terms = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-part="meta"] dt')].map((dt) => [
    dt.textContent,
    dt.nextElementSibling?.textContent,
  ]);

// design/pages/Run Detail.dc.html, the summary section.
describe('RunHeader', () => {
  it('leads with the status pill and the relative time as a <time>', () => {
    const { container } = render(<RunHeader {...PUBLIC} />);
    const lead = container.querySelector('[data-part="lead"]');
    expect(lead?.querySelector('[data-status]')?.textContent).toBe('Passed');
    expect(lead?.querySelector('[data-status]')?.getAttribute('data-variant')).toBe('pill');
    const time = lead?.querySelector('time');
    expect(time?.textContent).toBe('2 h ago');
    expect(time?.getAttribute('datetime')).toBe('2026-10-05T09:26:36.000Z');
  });

  it('public: titles the run, links the commit and the CI run', () => {
    const { getByRole, container } = render(<RunHeader {...PUBLIC} />);
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Push to main');
    expect(terms(container)).toEqual([
      ['Branch', 'main'],
      ['Commit', '0e2d0b4'],
      ['Event', 'push'],
      ['Started', '5 Oct, 09:25 UTC'],
      ['Reports', '3'],
      ['CI', 'GitHub Actions'],
    ]);
    expect(getByRole('link', { name: '0e2d0b4' }).getAttribute('href')).toBe(
      `https://github.com/bhelco1/Ostomate2/commit/${SHA}`,
    );
    expect(getByRole('link', { name: 'GitHub Actions' }).getAttribute('href')).toBe(
      'https://github.com/bhelco1/Ostomate2/actions/runs/36100000009',
    );
    expect(container.querySelector('[data-part="meta"] time')?.getAttribute('title')).toBe(
      '5 Oct 2026, 09:25 UTC',
    );
  });

  it('private: "Run {id}" with a lock, the commit unlinked, and no CI entry', () => {
    const { getByRole, container, queryByRole } = render(<RunHeader {...PRIVATE} />);
    const heading = getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Run 36200000011');
    expect(within(heading).getByRole('img', { name: 'Private repository' })).toBeTruthy();
    expect(terms(container)).toEqual([
      ['Branch', 'main'],
      ['Commit', '5f0a2c9'],
      ['Event', 'push'],
      ['Started', '5 Oct, 09:25 UTC'],
      ['Reports', '3'],
    ]);
    // The banner's "Show failure" is the only link: the commit and CI run are not linked.
    expect(queryByRole('link', { name: '5f0a2c9' })).toBeNull();
    expect(queryByRole('link', { name: /GitHub Actions/ })).toBeNull();
  });

  // components.md, Run page: "Attempt {k}" only when run_attempt is above 1, before CI.
  it('adds "Attempt {k}" after Reports on a re-run', () => {
    const { container } = render(<RunHeader {...PUBLIC} meta={{ ...PUBLIC.meta, attempt: '2' }} />);
    expect(terms(container).map(([term]) => term)).toEqual([
      'Branch',
      'Commit',
      'Event',
      'Started',
      'Reports',
      'Attempt',
      'CI',
    ]);
    expect(terms(container)[5]).toEqual(['Attempt', '2']);
  });

  it('shows the failed-run banner under the tiles when there is one', () => {
    const { container, getByRole, rerender } = render(<RunHeader {...PRIVATE} />);
    const banner = container.querySelector<HTMLElement>('[data-part="banner"]');
    expect(banner?.previousElementSibling?.className).toContain('tiles');
    expect(banner?.querySelector('[data-part="title"]')?.textContent).toBe(
      '1 test failed: asset.test.ts › assetCreateSchema accepts a minimal valid asset',
    );
    expect(getByRole('link', { name: 'Show failure' }).getAttribute('href')).toBe('#results');
    rerender(<RunHeader {...PUBLIC} />);
    expect(container.querySelector('[data-part="banner"]')).toBeNull();
  });

  it('shows the five tiles, the Failed tile tinted when the run failed', () => {
    const { container, rerender } = render(<RunHeader {...PUBLIC} />);
    const tiles = () => [...container.querySelectorAll<HTMLElement>('[data-part="tile"]')];
    expect(tiles().map((tile) => tile.textContent)).toEqual([
      'Tests142',
      'Passed142',
      'Failed0',
      'Skipped0',
      'Duration36 s',
    ]);
    expect(tiles()[2]?.dataset.tone).toBeUndefined();

    rerender(<RunHeader {...PRIVATE} />);
    expect(tiles()[2]?.dataset.tone).toBe('fail');
    expect(tiles()[0]?.textContent).toBe('Tests1,041');
  });

  it('sets the section, lead, heading, terms and tiles as the mock does', () => {
    expect(ruleFor(CSS, '.header')).toEqual({ padding: '36px 0px 40px' });
    expect(ruleFor(CSS, '.lead')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'align-items': 'center',
      gap: '10px 14px',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.when')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.heading')).toEqual({
      margin: '16px 0px 0px',
      display: 'flex',
      'align-items': 'center',
      gap: '12px',
      'flex-wrap': 'wrap',
      font: '500 clamp(34px, 4.5vw, 52px)/1.08 var(--font-serif)',
      'letter-spacing': '-0.02em',
      'text-wrap': 'pretty',
    });
    expect(ruleFor(CSS, '.lock')).toEqual({ display: 'flex', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.meta')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: '14px 36px',
      margin: '20px 0px 0px',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.term')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.value')).toEqual({ margin: '3px 0px 0px' });
    expect(ruleFor(CSS, '.sha')).toEqual({ font: '13.5px var(--font-mono)' });
    expect(ruleFor(CSS, '.ci')).toEqual({
      display: 'inline-flex',
      'align-items': 'center',
      gap: '5px',
    });
    expect(ruleFor(CSS, '.tiles')).toEqual({
      display: 'grid',
      'grid-template-columns': 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
      gap: '12px',
      'margin-top': '28px',
    });
    expect(ruleFor(CSS, '.tile')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-lg)',
      padding: '18px 20px',
    });
    expect(ruleFor(CSS, '.tileLabel')).toEqual({ 'font-size': '14px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.tileValue')).toEqual({
      font: '500 40px/1.1 var(--font-serif)',
      'margin-top': '6px',
    });
    expect(ruleFor(CSS, '.tileFail')).toEqual({
      background: 'var(--fail-tint)',
      'border-color': 'var(--fail)',
    });
    expect(ruleFor(CSS, '.tileFail .tileLabel, .tileFail .tileValue')).toEqual({
      color: 'var(--fail)',
    });
    // The Run Detail mock's banner sits 16 px under the tiles.
    expect(ruleFor(CSS, '.banner')).toEqual({ 'margin-top': '16px' });
  });
});
