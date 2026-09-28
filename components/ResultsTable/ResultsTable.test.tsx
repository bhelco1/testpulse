// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { ResultsTable, type ResultRow } from './ResultsTable';
import styles from './ResultsTable.module.css';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'ResultsTable.module.css');
const NARROW = '(width < 720px)';
const TOKENS = join(import.meta.dirname, '..', '..', 'design', 'tokens.css');

const has = (element: Element | null | undefined, name: string) => {
  const className = styles[name];
  if (!className) throw new Error(`ResultsTable.module.css has no .${name}`);
  return element?.classList.contains(className) ?? false;
};

const TRACE =
  'at kotlin.test.assertEquals(Assertions.kt:63)\n' +
  'at com.ostomate.app.ui.home.HomeViewModelTest.rendersToday(HomeViewModelTest.kt:48)';

const row = (
  key: string,
  extra: Partial<ResultRow> & Pick<ResultRow, 'suite' | 'name' | 'status'>,
): ResultRow => ({
  key,
  layer: 'unit',
  flaky: false,
  platforms: [
    { platform: 'jvm', status: extra.status },
    { platform: 'ios-sim', status: extra.status },
  ],
  time: '0.08 s',
  historyHref: `/p/ostomate2/tests/${key}`,
  ...extra,
});

// Arrival order, which the table must reorder: failures first, then by suite.
const RESULTS: ResultRow[] = [
  row('shows-days', {
    suite: 'com.ostomate.app.ui.home.HomeViewModelTest',
    name: 'showsDaysOfSupply',
    status: 'passed',
  }),
  row('inserts', {
    suite: 'com.ostomate.app.data.ChangeEventDaoTest',
    name: 'insertsAndQueriesByDay',
    status: 'passed',
    layer: 'integration',
    flaky: true,
    time: '1.12 s',
  }),
  row('dark-mode', {
    suite: 'com.ostomate.app.ui.HomeScreenshotTest',
    name: 'rendersDarkMode',
    status: 'skipped',
    layer: 'visual',
    platforms: [{ platform: 'jvm', status: 'skipped' }],
    time: '—',
  }),
  row('renders-today', {
    suite: 'com.ostomate.app.ui.home.HomeViewModelTest',
    name: 'rendersToday',
    status: 'failed',
    platforms: [
      { platform: 'ios-sim', status: 'failed' },
      { platform: 'jvm', status: 'passed' },
    ],
    time: '0.41 s',
    failure: {
      message: 'AssertionError: expected "2 changes today" but was "1 change today"',
      detail: TRACE,
    },
  }),
  row('restores', {
    suite: 'com.ostomate.app.domain.BackupSerializerTest',
    name: 'restoresBackup',
    status: 'error',
    time: '0.02 s',
    failure: {
      message: 'IllegalStateException: Room database not initialised',
      detail: 'at androidx.room.RoomDatabase.assertNotMainThread(RoomDatabase.kt:512)',
    },
  }),
  row('deletes', {
    suite: 'com.ostomate.app.data.ChangeEventDaoTest',
    name: 'deletesOlderThan',
    status: 'passed',
    layer: 'integration',
  }),
];

function renderTable(
  extra: { results?: ResultRow[]; limit?: number; visibility?: 'public' | 'private' } = {},
) {
  const onLoadMore = vi.fn();
  const view = render(
    <ResultsTable
      results={extra.results ?? RESULTS}
      visibility={extra.visibility ?? 'public'}
      limit={extra.limit ?? 50}
      onLoadMore={onLoadMore}
    />,
  );
  return { ...view, onLoadMore };
}

// The data rows (one per test), not the header or the detail rows.
const testRows = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-part="test"]')].map((body) => ({
    body,
    row: body.querySelector<HTMLElement>('[data-part="row"]') as HTMLElement,
    name: body.querySelector('[data-part="name"]')?.textContent,
  }));

const names = (root: HTMLElement) => testRows(root).map((test) => test.name);

describe('ResultsTable filters', () => {
  it('offers the status radio group with counts from the whole run', () => {
    const { getByRole } = renderTable();
    const group = getByRole('radiogroup', { name: 'Status' });
    const radios = within(group).getAllByRole('radio');

    expect(radios.map((radio) => radio.textContent)).toEqual([
      'All 6',
      'Passed 3',
      'Failed 1',
      'Error 1',
      'Skipped 1',
    ]);
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the counts for the whole run while a filter is on', () => {
    const { getByRole } = renderTable();
    fireEvent.change(getByRole('combobox', { name: 'Layer' }), { target: { value: 'visual' } });
    expect(getByRole('radio', { name: 'Passed 3' })).toBeTruthy();
  });

  it('reads Failed and Error in --fail only while there are any', () => {
    const { getByRole, unmount } = renderTable();
    const failTone = (name: RegExp) => getByRole('radio', { name }).dataset.tone === 'fail';
    expect(failTone(/^Failed/)).toBe(true);
    expect(failTone(/^Error/)).toBe(true);
    expect(failTone(/^Passed/)).toBe(false);
    unmount();

    const { getByRole: again } = renderTable({ results: RESULTS.slice(0, 3) });
    expect(again('radio', { name: 'Failed 0' }).dataset.tone).toBeUndefined();
    expect(again('radio', { name: 'Error 0' }).dataset.tone).toBeUndefined();
  });

  it('offers a native layer select: All layers, then the run’s layers in section 8 order', () => {
    const { getByRole } = renderTable();
    const select = getByRole('combobox', { name: 'Layer' }) as HTMLSelectElement;

    expect(select.tagName).toBe('SELECT');
    expect([...select.options].map((option) => [option.value, option.textContent])).toEqual([
      ['all', 'All layers'],
      ['unit', 'Unit'],
      ['integration', 'Integration'],
      ['visual', 'Visual'],
    ]);
    expect(select.value).toBe('all');
  });

  it('says how the rows are ordered, and offers no search', () => {
    const { getByText, queryByRole } = renderTable();
    expect(getByText('Failures first, then by suite')).toBeTruthy();
    expect(queryByRole('searchbox')).toBeNull();
    expect(queryByRole('textbox')).toBeNull();
  });

  it('filters by status when a radio is chosen', () => {
    const { getByRole, container } = renderTable();

    fireEvent.click(getByRole('radio', { name: 'Failed 1' }));
    expect(names(container)).toEqual(['rendersToday']);
    fireEvent.click(getByRole('radio', { name: 'Skipped 1' }));
    expect(names(container)).toEqual(['rendersDarkMode']);
  });

  it('moves the status filter with the arrow keys, as a radio group does', () => {
    const { getByRole, container } = renderTable();

    fireEvent.keyDown(getByRole('radio', { name: 'All 6' }), { key: 'ArrowRight' });
    expect(getByRole('radio', { name: 'Passed 3' }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(getByRole('radio', { name: 'Passed 3' }));
    expect(names(container)).toEqual([
      'deletesOlderThan',
      'insertsAndQueriesByDay',
      'showsDaysOfSupply',
    ]);
  });

  it('filters by layer when the select changes, together with the status', () => {
    const { getByRole, container } = renderTable();

    fireEvent.change(getByRole('combobox', { name: 'Layer' }), {
      target: { value: 'integration' },
    });
    expect(names(container)).toEqual(['deletesOlderThan', 'insertsAndQueriesByDay']);
    fireEvent.click(getByRole('radio', { name: 'Passed 3' }));
    expect(names(container)).toEqual(['deletesOlderThan', 'insertsAndQueriesByDay']);
    fireEvent.click(getByRole('radio', { name: 'Failed 1' }));
    expect(names(container)).toEqual([]);
  });

  it('no match: "No tests match" and "Clear filters", which brings every row back', () => {
    const { getByRole, getByText, container } = renderTable();

    fireEvent.change(getByRole('combobox', { name: 'Layer' }), { target: { value: 'visual' } });
    fireEvent.click(getByRole('radio', { name: 'Failed 1' }));

    expect(getByText('No tests match')).toBeTruthy();
    expect(getByText('Nothing in this run matches the current filters.')).toBeTruthy();
    expect(container.querySelector('table')).toBeNull();
    const clear = getByRole('button', { name: 'Clear filters' });
    expect(clear.dataset.variant).toBe('secondary');

    fireEvent.click(clear);
    expect(names(container)).toHaveLength(6);
    expect(getByRole('radio', { name: 'All 6' }).getAttribute('aria-checked')).toBe('true');
    expect((getByRole('combobox', { name: 'Layer' }) as HTMLSelectElement).value).toBe('all');
  });
});

describe('ResultsTable rows', () => {
  it('is a table with the design’s column headers', () => {
    const { getByRole } = renderTable();
    const table = getByRole('table');
    const headers = within(table).getAllByRole('columnheader');

    expect(headers.map((header) => header.textContent)).toEqual([
      'Details',
      'Status',
      'Test',
      'Layer',
      'Platform',
      'Time',
    ]);
    // The first column holds only the chevron, so its header is for assistive technology only.
    expect(has(headers[0]?.firstElementChild, 'srOnly')).toBe(true);
  });

  it('puts failed and error first, then orders by suite, then name', () => {
    const { container } = renderTable();
    expect(names(container)).toEqual([
      'restoresBackup',
      'rendersToday',
      'deletesOlderThan',
      'insertsAndQueriesByDay',
      'showsDaysOfSupply',
      'rendersDarkMode',
    ]);
  });

  it('passed: inline status badge, name, suite, layer, platforms and time, not expandable', () => {
    const { container } = renderTable();
    const test = testRows(container).find((t) => t.name === 'showsDaysOfSupply');
    const cells = within(test?.row as HTMLElement).getAllByRole('cell');

    expect(cells).toHaveLength(6);
    const badge = cells[1]?.querySelector<HTMLElement>('[data-status]');
    expect(badge?.dataset.status).toBe('passed');
    expect(badge?.dataset.variant).toBe('inline');
    expect(test?.body.querySelector('[data-part="suite"]')?.textContent).toBe(
      'com.ostomate.app.ui.home.HomeViewModelTest',
    );
    expect(cells[3]?.textContent).toBe('Unit');
    expect(
      [...(cells[4]?.querySelectorAll('[data-part="platform"]') ?? [])].map((p) => p.textContent),
    ).toEqual(['jvm', 'ios-sim']);
    expect(cells[5]?.textContent).toBe('0.08 s');
    expect(cells[0]?.querySelector('svg')).toBeNull();
    expect(within(test?.body as HTMLElement).queryByRole('button')).toBeNull();
    expect(test?.body.querySelector('[data-part="detail"]')).toBeNull();
    expect(has(test?.body, 'failing')).toBe(false);
  });

  it('skipped: Skipped badge, not expandable', () => {
    const { container } = renderTable();
    const test = testRows(container).find((t) => t.name === 'rendersDarkMode');
    expect(test?.row.querySelector('[data-status]')?.textContent).toBe('Skipped');
    expect(within(test?.body as HTMLElement).queryByRole('button')).toBeNull();
    expect(test?.row.textContent).toContain('—');
  });

  it('failed: --fail-tint row, open by default, message, stack trace and Test history', () => {
    const { container } = renderTable();
    const test = testRows(container).find((t) => t.name === 'rendersToday');
    const body = test?.body as HTMLElement;

    expect(has(body, 'failing')).toBe(true);
    expect(test?.row.querySelector('[data-status]')?.textContent).toBe('Failed');
    const toggle = within(body).getByRole('button', { name: 'rendersToday' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const detail = body.querySelector<HTMLElement>('[data-part="detail"]');
    expect(toggle.getAttribute('aria-controls')).toBe(detail?.id);
    expect(has(detail, 'expanded')).toBe(true);

    expect(body.querySelector('[data-part="message"]')?.textContent).toBe(
      'AssertionError: expected "2 changes today" but was "1 change today"',
    );
    const trace = body.querySelector('pre');
    expect(trace?.textContent).toBe(TRACE);
    // It scrolls sideways inside its own box, so it takes keyboard focus to scroll.
    expect(trace?.getAttribute('tabindex')).toBe('0');
    const history = within(body).getByRole('link', { name: 'Test history' });
    expect(history.getAttribute('href')).toBe('/p/ostomate2/tests/renders-today');
    const chevron = test?.row.querySelector('svg');
    expect(chevron?.querySelector('path')?.getAttribute('d')).toBe('m9 6 6 6-6 6');
    expect(has(chevron, 'open')).toBe(true);
  });

  it('error: the Error badge, expandable and open like a failure', () => {
    const { container } = renderTable();
    const test = testRows(container).find((t) => t.name === 'restoresBackup');
    const body = test?.body as HTMLElement;

    expect(has(body, 'failing')).toBe(true);
    expect(test?.row.querySelector('[data-status]')?.textContent).toBe('Error');
    expect(
      within(body).getByRole('button', { name: 'restoresBackup' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(body.querySelector('[data-part="message"]')?.textContent).toBe(
      'IllegalStateException: Room database not initialised',
    );
  });

  it('collapses and reopens a failed row when its toggle is pressed', () => {
    const { container } = renderTable();
    const body = testRows(container).find((t) => t.name === 'rendersToday')?.body as HTMLElement;
    const toggle = within(body).getByRole('button', { name: 'rendersToday' });
    const detail = () => body.querySelector<HTMLElement>('[data-part="detail"]');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(has(detail(), 'expanded')).toBe(false);
    expect(has(body.querySelector('[data-part="row"] svg'), 'open')).toBe(false);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(has(detail(), 'expanded')).toBe(true);
  });

  it('keeps a row collapsed while the filters change', () => {
    const { container, getByRole } = renderTable();
    const toggle = () =>
      within(testRows(container)[1]?.body as HTMLElement).getByRole('button', {
        name: 'rendersToday',
      });

    fireEvent.click(toggle());
    fireEvent.click(getByRole('radio', { name: 'Failed 1' }));
    expect(
      within(container).getByRole('button', { name: 'rendersToday' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('flaky: a Flaky chip with its icon after the name, and a plain one for the narrow layout', () => {
    const { container } = renderTable();
    const test = testRows(container).find((t) => t.name === 'insertsAndQueriesByDay');
    const wide = test?.row.querySelector<HTMLElement>('[data-part="flaky-wide"]');
    const narrow = test?.row.querySelector<HTMLElement>('[data-part="flaky-narrow"]');

    expect(wide?.textContent).toBe('Flaky');
    expect(wide?.querySelector('svg path')?.getAttribute('d')).toBe('M2 12h4l3-7 6 14 3-7h4');
    expect(narrow?.textContent).toBe('Flaky');
    expect(narrow?.querySelector('svg')).toBeNull();
    expect(test?.row.querySelector('[data-status]')?.textContent).toBe('Passed');
    expect(
      testRows(container)
        .find((t) => t.name === 'showsDaysOfSupply')
        ?.row.querySelector('[data-part="flaky-wide"]'),
    ).toBeNull();
  });

  it('platform mismatch: marks each platform in words as well as ✕ / ✓, and explains in the detail', () => {
    const { container } = renderTable();
    const test = testRows(container).find((t) => t.name === 'rendersToday');
    const platforms = [
      ...(test?.row.querySelectorAll<HTMLElement>('[data-part="platform"]') ?? []),
    ];

    expect(platforms.map((p) => p.textContent)).toEqual(['ios-sim ✕ failed', 'jvm ✓ passed']);
    expect(has(platforms[0], 'platformFail')).toBe(true);
    expect(has(platforms[1], 'platformFail')).toBe(false);
    const words = platforms.map(
      (p) => p.querySelector(`.${styles.srOnly ?? 'missing'}`)?.textContent,
    );
    expect(words).toEqual([' failed', ' passed']);
    const glyphs = platforms.map((p) => p.querySelector('[aria-hidden="true"]')?.textContent);
    expect(glyphs).toEqual(['✕', '✓']);

    const mismatch = test?.body.querySelector('[data-part="mismatch"]');
    expect(mismatch?.textContent).toBe(
      'Platform mismatchPassed on jvm, failed on ios-sim in the same run.',
    );
  });

  it('has no mismatch line or marks when every platform agrees', () => {
    const { container } = renderTable();
    const test = testRows(container).find((t) => t.name === 'restoresBackup');
    expect(test?.body.querySelector('[data-part="mismatch"]')).toBeNull();
    expect(
      [...(test?.row.querySelectorAll('[data-part="platform"]') ?? [])].map((p) => p.textContent),
    ).toEqual(['jvm', 'ios-sim']);
  });

  it('private: the private-details notice in place of failure text, the mismatch line kept', () => {
    // A failure would never reach a private page (RLS returns none); passing one proves the
    // table does not print it either.
    const { container } = renderTable({ visibility: 'private' });
    const body = testRows(container).find((t) => t.name === 'rendersToday')?.body as HTMLElement;

    expect(body.textContent).toContain('Details hidden: private repository');
    expect(body.textContent).not.toContain('AssertionError');
    expect(body.querySelector('pre')).toBeNull();
    expect(body.querySelector('[data-part="message"]')).toBeNull();
    expect(body.querySelector('[data-part="mismatch"]')?.textContent).toContain(
      'Platform mismatch',
    );
    expect(within(body).getByRole('link', { name: 'Test history' })).toBeTruthy();
    // Names and statuses are public (spec section 9).
    expect(within(body).getByRole('button', { name: 'rendersToday' })).toBeTruthy();
  });

  it('renders on the server with failures open, so the detail reads without JavaScript', () => {
    const html = renderToStaticMarkup(
      <ResultsTable results={RESULTS} visibility="public" limit={50} onLoadMore={() => {}} />,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Room database not initialised');
  });
});

describe('ResultsTable paging', () => {
  it('shows the first {limit} rows and "Showing N of M", with "Load 50 more"', () => {
    const { container, getByRole, getByText, onLoadMore } = renderTable({ limit: 2 });

    expect(names(container)).toEqual(['restoresBackup', 'rendersToday']);
    expect(container.querySelector('[data-part="showing"]')?.textContent).toBe('Showing2of6');
    expect(getByText('Showing')).toBeTruthy();
    const more = getByRole('button', { name: 'Load 50 more' });
    expect(more.dataset.variant).toBe('secondary');
    fireEvent.click(more);
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('counts the rows that match the filters, and hides "Load 50 more" when all are shown', () => {
    const { container, getByRole, queryByRole } = renderTable({ limit: 2 });

    fireEvent.click(getByRole('radio', { name: 'Failed 1' }));
    expect(container.querySelector('[data-part="showing"]')?.textContent).toBe('Showing1of1');
    expect(queryByRole('button', { name: 'Load 50 more' })).toBeNull();
  });

  it('shows every row when the limit covers them', () => {
    const { container, queryByRole } = renderTable({ limit: 50 });
    expect(container.querySelector('[data-part="showing"]')?.textContent).toBe('Showing6of6');
    expect(queryByRole('button', { name: 'Load 50 more' })).toBeNull();
  });
});

describe('ResultsTable states', () => {
  it('loading: a busy box with the header and 6 skeleton rows, and no filters', () => {
    const { getByLabelText, queryByRole } = render(<ResultsTable loading />);
    const box = getByLabelText('Loading results');

    expect(box.getAttribute('aria-busy')).toBe('true');
    expect(box.querySelectorAll('[data-part="skeleton-row"]')).toHaveLength(6);
    expect(box.querySelector('[data-part="skeleton-head"]')).not.toBeNull();
    const bars = [
      ...(box
        .querySelector('[data-part="skeleton-row"]')
        ?.querySelectorAll<HTMLElement>('[data-part="skeleton"]') ?? []),
    ];
    expect(bars.map((bar) => [bar.style.width, bar.style.height])).toEqual([
      ['90px', '14px'],
      ['auto', '14px'],
      ['60px', '14px'],
    ]);
    expect(queryByRole('radiogroup')).toBeNull();
  });

  it('pruned: the retention note with the permanent totals in place of the table and filters', () => {
    const { container, queryByRole } = render(
      <ResultsTable pruned={{ total: 1048, passed: 1047, failed: 1 }} />,
    );

    expect(container.querySelector('[data-part="pruned-title"]')?.textContent).toBe(
      'Per-test results retained for 180 days',
    );
    expect(container.querySelector('[data-part="pruned-text"]')?.textContent).toBe(
      'This run is older than that, so its individual results were removed to keep the database small. Summary totals are permanent: 1,048 tests, 1,047 passed, 1 failed.',
    );
    const clock = container.querySelector('svg');
    expect(clock?.getAttribute('width')).toBe('22');
    expect(clock?.querySelector('path')?.getAttribute('d')).toBe('M12 7v5l3 2');
    expect(queryByRole('table')).toBeNull();
    expect(queryByRole('radiogroup')).toBeNull();
  });
});

describe('ResultsTable styles', () => {
  it('is a size container, so the layout follows the table’s width, not the page’s', () => {
    expect(ruleFor(CSS, '.root')).toEqual({ 'container-type': 'inline-size' });
  });

  it('sets the toolbar, the layer select (44px) and the order note', () => {
    expect(ruleFor(CSS, '.toolbar')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: '10px',
      'align-items': 'center',
      'margin-bottom': '14px',
    });
    expect(ruleFor(CSS, '.layer')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '8px',
      'min-height': 'var(--target-min)',
      padding: '0px 4px 0px 12px',
      'box-sizing': 'border-box',
      'border-radius': 'var(--radius-sm)',
      border: '1px solid var(--line-strong)',
      background: 'var(--surface)',
      'font-size': '14px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.select')).toEqual({
      'min-height': '42px',
      border: '0px',
      background: 'transparent',
      color: 'var(--ink)',
      font: '500 14px var(--font-sans)',
      'padding-right': '8px',
    });
    expect(ruleFor(CSS, '.note')).toEqual({ 'font-size': '14px', color: 'var(--ink-3)' });
  });

  it('draws the box: --surface, 1px --line, radius 16', () => {
    expect(ruleFor(CSS, '.box')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-lg)',
      overflow: 'hidden',
    });
  });

  it('lays header and rows on the v3 grid: 36 130 1fr 110 130 80, gap 12, padding 12 16', () => {
    const columns = '36px 130px minmax(0, 1fr) 110px 130px 80px';
    expect(ruleFor(CSS, '.headRow')).toEqual({
      display: 'grid',
      'grid-template-columns': columns,
      gap: '12px',
      padding: '12px 16px',
      'border-bottom': '1px solid var(--line)',
      font: '600 12px var(--font-mono)',
      'letter-spacing': '0.04em',
      color: 'var(--ink-3)',
      'text-transform': 'uppercase',
    });
    expect(ruleFor(CSS, '.row')).toEqual({
      position: 'relative',
      display: 'grid',
      'grid-template-columns': columns,
      gap: '12px',
      'align-items': 'center',
      padding: '12px 16px',
      'min-height': 'var(--target-min)',
      'box-sizing': 'border-box',
      'font-size': '14px',
    });
  });

  it('tints failed and error tests --fail-tint and rules every test off with --line', () => {
    expect(ruleFor(CSS, '.test')).toEqual({
      display: 'block',
      'border-bottom': '1px solid var(--line)',
    });
    expect(ruleFor(CSS, '.failing')).toEqual({ background: 'var(--fail-tint)' });
  });

  it('makes the whole row the toggle’s 44px target, with the name as its label', () => {
    expect(ruleFor(CSS, '.toggle::after')).toEqual({
      content: '""',
      position: 'absolute',
      inset: '0px',
    });
    expect(ruleFor(CSS, '.chevron.open')).toEqual({ transform: 'rotate(90deg)' });
  });

  it('sets the test cell: name mono 13.5 and suite mono 12 --ink-3, both with ellipsis', () => {
    expect(ruleFor(CSS, '.name')).toEqual({
      display: 'block',
      font: '13.5px var(--font-mono)',
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
    });
    expect(ruleFor(CSS, '.suite')).toEqual({
      display: 'block',
      font: '12px var(--font-mono)',
      color: 'var(--ink-3)',
      'margin-top': '2px',
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
    });
    expect(ruleFor(CSS, '.flakyWide')).toEqual({
      flex: '0 0 auto',
      display: 'inline-flex',
      'align-items': 'center',
      gap: '5px',
      padding: '2px 8px',
      'border-radius': 'var(--radius-pill)',
      background: 'var(--attn-tint)',
      color: 'var(--attn)',
      'font-size': '12px',
      'font-weight': '600',
    });
  });

  it('sets layer --ink-2, platforms 13 stacked (--fail when failing), time right --ink-2', () => {
    expect(ruleFor(CSS, '.layerCell')).toEqual({ color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.platformCell')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      gap: '2px',
      'font-size': '13px',
    });
    expect(ruleFor(CSS, '.platform')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.platformFail')).toEqual({ color: 'var(--fail)' });
    expect(ruleFor(CSS, '.timeCell')).toEqual({ 'text-align': 'right', color: 'var(--ink-2)' });
  });

  it('expands over --motion-base (200ms) by animating the row track', () => {
    const { transition, ...collapse } = ruleFor(CSS, '.collapse');
    expect(collapse).toEqual({
      display: 'grid',
      'grid-template-rows': '0fr',
      visibility: 'hidden',
    });
    // Prettier writes the two transitions on separate lines.
    expect(transition?.replace(/\s+/g, ' ')).toBe(
      'grid-template-rows var(--motion-base), visibility var(--motion-base)',
    );
    expect(ruleFor(CSS, '.collapse.expanded')).toEqual({
      'grid-template-rows': '1fr',
      visibility: 'visible',
    });
    expect(ruleFor(CSS, '.collapseInner')).toEqual({ overflow: 'hidden', 'min-height': '0px' });
  });

  it('opens instantly under reduced motion: tokens.css turns every transition off', () => {
    expect(
      ruleFor(TOKENS, '*, *::before, *::after', '(prefers-reduced-motion: reduce)'),
    ).toMatchObject({ transition: 'none !important' });
  });

  it('hides text visually but not from assistive technology', () => {
    expect(ruleFor(CSS, '.srOnly')).toEqual({
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      'clip-path': 'inset(50%)',
      'white-space': 'nowrap',
    });
  });

  it('pads the detail 4 16 18 64 and sets the mismatch line, message, trace and link', () => {
    expect(ruleFor(CSS, '.detail')).toEqual({ padding: '4px 16px 18px 64px' });
    expect(ruleFor(CSS, '.mismatch')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: '6px 10px',
      'margin-bottom': '10px',
      'font-size': '13.5px',
    });
    expect(ruleFor(CSS, '.mismatchTitle')).toEqual({
      'font-weight': '600',
      color: 'var(--fail)',
    });
    expect(ruleFor(CSS, '.mismatchText')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.message')).toEqual({
      font: '600 13.5px/1.5 var(--font-mono)',
      'margin-bottom': '8px',
      'overflow-wrap': 'anywhere',
    });
    expect(ruleFor(CSS, '.trace')).toEqual({
      margin: '0px',
      padding: '12px 14px',
      'border-radius': 'var(--radius-sm)',
      background: 'var(--inset)',
      border: '1px solid var(--line)',
      font: '12.5px/1.65 var(--font-mono)',
      color: 'var(--ink-2)',
      'overflow-x': 'auto',
      'white-space': 'pre',
    });
    expect(ruleFor(CSS, '.history')).toEqual({
      display: 'inline-flex',
      'align-items': 'center',
      'min-height': 'var(--target-min)',
      'margin-top': '4px',
      'font-size': '14px',
    });
  });

  it('sets the footer 13.5 --ink-3 with "Load 50 more" on the right', () => {
    expect(ruleFor(CSS, '.footer')).toEqual({
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      'flex-wrap': 'wrap',
      gap: '10px',
      padding: '12px 16px',
      'font-size': '13.5px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.showing')).toEqual({ display: 'flex', gap: '6px' });
  });

  it('sets the empty-filter card, the loading rows and the pruned card', () => {
    expect(ruleFor(CSS, '.empty')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-lg)',
      padding: '28px 20px',
      display: 'flex',
      'flex-direction': 'column',
      gap: '6px',
      'align-items': 'flex-start',
    });
    expect(ruleFor(CSS, '.emptyTitle')).toEqual({ font: '500 20px var(--font-serif)' });
    expect(ruleFor(CSS, '.emptyText')).toEqual({ 'font-size': '14px', color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.clear')).toEqual({ 'margin-top': '6px' });
    expect(ruleFor(CSS, '.skeletonHead')).toEqual({
      height: '40px',
      'border-bottom': '1px solid var(--line)',
    });
    expect(ruleFor(CSS, '.skeletonRow')).toEqual({
      display: 'flex',
      gap: '16px',
      'align-items': 'center',
      padding: '14px 16px',
      'border-bottom': '1px solid var(--line)',
    });
    expect(ruleFor(CSS, '.skeletonGrow')).toEqual({ flex: '1 1 0%' });
    expect(ruleFor(CSS, '.pruned')).toEqual({
      display: 'flex',
      gap: '14px',
      'align-items': 'flex-start',
      padding: '24px',
      'border-radius': 'var(--radius-xl)',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
    });
    expect(ruleFor(CSS, '.prunedIcon')).toEqual({
      flex: '0 0 auto',
      'margin-top': '3px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.prunedTitle')).toEqual({ font: '500 22px var(--font-serif)' });
    expect(ruleFor(CSS, '.prunedText')).toEqual({
      margin: '6px 0px 0px',
      'font-size': '14.5px',
      'line-height': '1.55',
      color: 'var(--ink-2)',
    });
  });

  it('hides the narrow-only parts at full width', () => {
    expect(ruleFor(CSS, '.flakyNarrow, .narrowLayer')).toEqual({ display: 'none' });
  });
});

describe('ResultsTable narrow layout (container below 720px)', () => {
  it('drops the visible header but keeps it for assistive technology', () => {
    expect(ruleFor(CSS, '.head', NARROW)).toEqual({
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      'clip-path': 'inset(50%)',
      'white-space': 'nowrap',
    });
  });

  it('stacks each row: chevron, status and time; then name and suite; then layer · platforms', () => {
    expect(ruleFor(CSS, '.row', NARROW)).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: '4px 10px',
    });
    expect(ruleFor(CSS, '.chevronCell', NARROW)).toEqual({ width: '20px', flex: '0 0 auto' });
    expect(ruleFor(CSS, '.statusCell', NARROW)).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '10px',
    });
    expect(ruleFor(CSS, '.timeCell', NARROW)).toEqual({
      'margin-left': 'auto',
      'font-size': '13px',
    });
    expect(ruleFor(CSS, '.testCell', NARROW)).toEqual({
      order: '1',
      'flex-basis': '100%',
      'padding-left': '30px',
      'box-sizing': 'border-box',
    });
    expect(ruleFor(CSS, '.platformCell', NARROW)).toEqual({
      order: '2',
      'flex-basis': '100%',
      'padding-left': '30px',
      'box-sizing': 'border-box',
      'flex-direction': 'row',
      'flex-wrap': 'wrap',
      gap: '0 6px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.layerCell, .flakyWide', NARROW)).toEqual({ display: 'none' });
    expect(ruleFor(CSS, '.narrowLayer', NARROW)).toEqual({ display: 'inline' });
  });

  it('wraps the name and suite instead of cutting them off', () => {
    expect(ruleFor(CSS, '.name', NARROW)).toEqual({
      'white-space': 'normal',
      'overflow-wrap': 'anywhere',
    });
    expect(ruleFor(CSS, '.suite', NARROW)).toEqual({
      'white-space': 'normal',
      'overflow-wrap': 'anywhere',
      'margin-top': '4px',
    });
  });

  it('shows the plain Flaky chip on the first line', () => {
    expect(ruleFor(CSS, '.flakyNarrow', NARROW)).toEqual({
      display: 'inline-flex',
      padding: '2px 8px',
      'border-radius': 'var(--radius-pill)',
      background: 'var(--attn-tint)',
      color: 'var(--attn)',
      'font-size': '12px',
      'font-weight': '600',
    });
  });

  it('pads the detail 4 16 16 16 and tightens the mismatch line', () => {
    expect(ruleFor(CSS, '.detail', NARROW)).toEqual({ padding: '4px 16px 16px' });
    expect(ruleFor(CSS, '.mismatch', NARROW)).toEqual({
      gap: '4px 10px',
      'margin-bottom': '8px',
    });
  });
});
