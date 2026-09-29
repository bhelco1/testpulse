// @vitest-environment jsdom
import { join } from 'node:path';

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import {
  StatusTimeline,
  timelineCapacity,
  type ResultStatus,
  type ResultsTimelineRun,
  type RunsTimelineRun,
} from './StatusTimeline';
import { timeLabel } from '../testing/time';

const CSS = join(import.meta.dirname, 'StatusTimeline.module.css');

// jsdom does no layout, so each test sets the strip width the component measures, and keeps the
// resize callback so a test can change the width afterwards.
let stripWidth = 1000;
let resize: (() => void) | undefined;

beforeEach(() => {
  stripWidth = 1000;
  resize = undefined;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => stripWidth);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Run i of 40 in the Design System's sample history: the 39th is the pull request, the 40th the
// latest push. SHAs are longer than 7 so the tests prove the component shortens them.
const sha7 = (i: number) => i.toString(16).padStart(7, '0');
const base = (i: number) => ({
  title: i === 38 ? 'Pull request from fix-today-count' : 'Push to main',
  branch: i === 38 ? 'fix-today-count' : 'main',
  sha: `${sha7(i)}ffffffffff`,
  when: timeLabel(i === 39 ? '4 min ago' : i === 38 ? 'yesterday' : `${39 - i} days ago`),
  href: `/p/ostomate2/runs/${i}`,
});

type PlatformStatus = (i: number) => ResultStatus | undefined;

// Oldest first. A platform whose status function returns undefined has no result in that run.
function history(
  platforms: Record<string, PlatformStatus>,
  n = 40,
  from = 0,
  durations: Record<string, string> = { jvm: '0.41 s', 'ios-sim': '0.63 s', node: '0.41 s' },
): ResultsTimelineRun[] {
  return Array.from({ length: n }, (_, k) => {
    const i = from + k;
    return {
      ...base(i),
      results: Object.entries(platforms).flatMap(([platform, status]) => {
        const s = status(i);
        return s === undefined ? [] : [{ platform, status: s, duration: durations[platform] }];
      }),
    };
  });
}

// The Design System's two-platform sample history.
const jvm: PlatformStatus = (i) => (i === 14 ? 'flaky' : i === 20 ? 'error' : 'passed');
const ios: PlatformStatus = (i) =>
  i < 3 ? undefined : i === 38 ? 'failed' : i === 25 ? 'skipped' : 'passed';
const TWO = history({ jvm, 'ios-sim': ios });

const results = (runs: readonly ResultsTimelineRun[], initialRun?: number) => (
  <StatusTimeline kind="results" testName="rendersToday" runs={runs} initialRun={initialRun} />
);

const stripsOf = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[data-part="strip"]'),
];
const listboxes = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[role="listbox"]'),
];
const cellsOf = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('[data-part="cell"]'),
];
const part = (root: ParentNode, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);
const text = (root: ParentNode, name: string) => part(root, name)?.textContent;
const legendOf = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-part="legend"] li')].map(
    (li) => li.textContent,
  );
// The index, within its strip, of the cell a listbox's aria-activedescendant names.
const activeIndex = (listbox: HTMLElement) =>
  cellsOf(listbox).findIndex((c) => c.id === listbox.getAttribute('aria-activedescendant'));
const selectedIndexes = (listbox: HTMLElement) =>
  cellsOf(listbox).flatMap((c, i) => (c.getAttribute('aria-selected') === 'true' ? [i] : []));
const panelFields = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-part="field"]')].map((field) => [
    text(field, 'field-label'),
    text(field, 'field-value'),
  ]);

describe('timelineCapacity', () => {
  it('fits one 6px cell and its 3px gap per 9px, capped at 40', () => {
    expect(timelineCapacity(6)).toBe(1);
    expect(timelineCapacity(249)).toBe(28);
    expect(timelineCapacity(357)).toBe(40);
    expect(timelineCapacity(2000)).toBe(40);
  });

  it('always shows at least the latest run', () => {
    expect(timelineCapacity(0)).toBe(1);
  });
});

describe('StatusTimeline, results kind', () => {
  it('derives one labelled listbox strip per platform, in the order platforms first report', () => {
    const { container } = render(results(TWO));
    const strips = stripsOf(container);

    expect(strips.map((s) => text(s, 'platform'))).toEqual(['jvm', 'ios-sim']);
    const boxes = listboxes(container);
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual([
      'rendersToday on jvm, last 40 runs',
      'rendersToday on ios-sim, last 40 runs',
    ]);
    expect(boxes.map((b) => b.getAttribute('aria-orientation'))).toEqual([
      'horizontal',
      'horizontal',
    ]);
    // One Tab stop per strip.
    expect(boxes.map((b) => b.tabIndex)).toEqual([0, 0]);
    expect(strips.map((s) => cellsOf(s).length)).toEqual([40, 40]);
    expect((container.firstElementChild as HTMLElement).dataset.platforms).toBe('true');
  });

  it('with one platform draws one strip, no label column, and names it by the test alone', () => {
    const { container } = render(results(history({ node: () => 'passed' }, 3, 37)));

    expect(part(container, 'platform')).toBeNull();
    expect(listboxes(container).map((b) => b.getAttribute('aria-label'))).toEqual([
      'rendersToday, last 3 runs',
    ]);
    expect((container.firstElementChild as HTMLElement).dataset.platforms).toBe('false');
  });

  it('draws a "not run" cell where a run has no result for the test on that platform', () => {
    const { container } = render(results(TWO));
    const [, iosStrip] = stripsOf(container);

    expect(
      cellsOf(iosStrip as HTMLElement)
        .slice(0, 4)
        .map((c) => c.dataset.status),
    ).toEqual(['not_run', 'not_run', 'not_run', 'passed']);
  });

  it('names each cell option "{Status word}, {when}, {title}, {sha7}", oldest first', () => {
    const statuses: ResultStatus[] = ['passed', 'failed', 'error', 'flaky', 'skipped'];
    const runs = history({ node: (i) => statuses[i - 34] }, 6, 34);
    const { container } = render(results(runs));
    const cells = cellsOf(container);

    expect(cells.map((c) => c.dataset.status)).toEqual([
      'passed',
      'failed',
      'error',
      'flaky',
      'skipped',
      'not_run',
    ]);
    expect(cells.map((c) => c.getAttribute('role'))).toEqual(Array(6).fill('option'));
    expect(cells.map((c) => c.getAttribute('aria-label'))).toEqual([
      `Passed, 5 days ago, Push to main, ${sha7(34)}`,
      `Failed, 4 days ago, Push to main, ${sha7(35)}`,
      `Error, 3 days ago, Push to main, ${sha7(36)}`,
      `Flaky, 2 days ago, Push to main, ${sha7(37)}`,
      `Skipped, yesterday, Pull request from fix-today-count, ${sha7(38)}`,
      `Not run, 4 min ago, Push to main, ${sha7(39)}`,
    ]);
    expect(cells.map((c) => c.textContent)).toEqual(['', '✕', '!', '', '', '']);
  });

  it('selects the latest run in every strip by default', () => {
    const { container } = render(results(TWO));

    for (const box of listboxes(container)) {
      expect(activeIndex(box)).toBe(39);
      expect(selectedIndexes(box)).toEqual([39]);
      expect(cellsOf(box)[39]?.className).toContain('selected');
    }
    // Every option id is unique, so aria-activedescendant names exactly one cell.
    const ids = cellsOf(container).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('opens on the run the page chooses, such as the latest failing run', () => {
    const { container } = render(results(TWO, 38));
    expect(listboxes(container).map(activeIndex)).toEqual([38, 38]);
    expect(listboxes(container).map(selectedIndexes)).toEqual([[38], [38]]);
  });

  it('moves the shared selection with ← → Home End, keeping focus on the strip', () => {
    const { container } = render(results(TWO));
    const [jvmBox, iosBox] = listboxes(container) as [HTMLElement, HTMLElement];
    act(() => jvmBox.focus());

    expect(fireEvent.keyDown(jvmBox, { key: 'ArrowLeft' })).toBe(false);
    expect([activeIndex(jvmBox), activeIndex(iosBox)]).toEqual([38, 38]);
    expect(selectedIndexes(iosBox)).toEqual([38]);

    fireEvent.keyDown(jvmBox, { key: 'Home' });
    expect([activeIndex(jvmBox), activeIndex(iosBox)]).toEqual([0, 0]);
    fireEvent.keyDown(jvmBox, { key: 'ArrowLeft' });
    expect(activeIndex(jvmBox)).toBe(0);

    fireEvent.keyDown(jvmBox, { key: 'End' });
    expect(activeIndex(jvmBox)).toBe(39);
    fireEvent.keyDown(jvmBox, { key: 'ArrowRight' });
    expect(activeIndex(jvmBox)).toBe(39);

    expect(document.activeElement).toBe(jvmBox);
  });

  it('moves focus to the other strip with ↓ ↑ on the same run', () => {
    const { container } = render(results(TWO));
    const [jvmBox, iosBox] = listboxes(container) as [HTMLElement, HTMLElement];
    act(() => jvmBox.focus());
    fireEvent.keyDown(jvmBox, { key: 'ArrowLeft' });

    expect(fireEvent.keyDown(jvmBox, { key: 'ArrowDown' })).toBe(false);
    expect(document.activeElement).toBe(iosBox);
    expect(activeIndex(iosBox)).toBe(38);

    fireEvent.keyDown(iosBox, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(iosBox);

    fireEvent.keyDown(iosBox, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(jvmBox);
    expect(activeIndex(jvmBox)).toBe(38);
  });

  it('leaves other keys to the browser', () => {
    const { container } = render(results(TWO));
    const [jvmBox] = listboxes(container) as [HTMLElement];
    expect(fireEvent.keyDown(jvmBox, { key: 'Tab' })).toBe(true);
    expect(activeIndex(jvmBox)).toBe(39);
  });

  describe('pointer and touch', () => {
    // Lays the cells of every strip out 10px apart, cell k centred at x = 10k + 5.
    const layOut = (container: HTMLElement) => {
      for (const box of listboxes(container)) {
        cellsOf(box).forEach((c, k) => {
          vi.spyOn(c, 'getBoundingClientRect').mockReturnValue(
            DOMRect.fromRect({ x: 10 * k, y: 0, width: 6, height: 14 }),
          );
        });
      }
    };

    it('selects the cell nearest the press anywhere on the strip', () => {
      const { container } = render(results(TWO));
      layOut(container);
      const [jvmBox, iosBox] = listboxes(container) as [HTMLElement, HTMLElement];

      fireEvent.pointerDown(jvmBox, { clientX: 52, pointerType: 'touch' });
      expect([activeIndex(jvmBox), activeIndex(iosBox)]).toEqual([5, 5]);
      // Between cells 7 (x 73) and 8 (x 83): nearest is 8.
      fireEvent.pointerDown(iosBox, { clientX: 79, pointerType: 'mouse', buttons: 1 });
      expect(activeIndex(jvmBox)).toBe(8);
    });

    it('selects on mouse hover and on a drag, but not on a touch passing over', () => {
      const { container } = render(results(TWO));
      layOut(container);
      const [jvmBox] = listboxes(container) as [HTMLElement];

      fireEvent.pointerMove(jvmBox, { clientX: 105, pointerType: 'mouse', buttons: 0 });
      expect(activeIndex(jvmBox)).toBe(10);
      fireEvent.pointerMove(jvmBox, { clientX: 205, pointerType: 'touch', buttons: 0 });
      expect(activeIndex(jvmBox)).toBe(10);
      fireEvent.pointerMove(jvmBox, { clientX: 205, pointerType: 'touch', buttons: 1 });
      expect(activeIndex(jvmBox)).toBe(20);
    });

    it('lets vertical scrolling through the strip', () => {
      expect(ruleFor(CSS, '.cells')).toMatchObject({ 'touch-action': 'pan-y' });
      expect(ruleFor(CSS, '.listbox')).toEqual({ cursor: 'pointer' });
    });
  });

  it('shows the selected run in the panel, one field per platform, and follows the selection', () => {
    const { container } = render(results(TWO, 38));
    const panel = part(container, 'panel') as HTMLElement;

    expect(panel.getAttribute('aria-live')).toBe('polite');
    expect(text(panel, 'run-title')).toBe('Pull request from fix-today-count');
    expect(text(panel, 'run-sha')).toBe(sha7(38));
    expect(text(panel, 'when')).toBe('yesterday');
    expect(panelFields(container)).toEqual([
      ['jvm', 'Passed·0.41 s'],
      ['ios-sim', 'Failed·0.63 s'],
    ]);
    const open = part(panel, 'open-run') as HTMLAnchorElement;
    expect(open.textContent).toBe('Open run →');
    expect(open.getAttribute('href')).toBe('/p/ostomate2/runs/38');

    fireEvent.keyDown(listboxes(container)[0] as HTMLElement, { key: 'ArrowRight' });
    expect(text(panel, 'run-title')).toBe('Push to main');
    expect(text(panel, 'when')).toBe('4 min ago');
    expect(open.getAttribute('href')).toBe('/p/ostomate2/runs/39');
  });

  it('draws each panel result as its status icon and word in the status ink', () => {
    const { container } = render(results(TWO, 38));
    const statuses = [...container.querySelectorAll<HTMLElement>('[data-part="field-status"]')];

    expect(statuses.map((s) => s.dataset.status)).toEqual(['passed', 'failed']);
    expect(statuses.map((s) => s.className)).toEqual([
      expect.stringContaining('tonePass'),
      expect.stringContaining('toneFail'),
    ]);
    const icon = statuses[1]?.querySelector('svg');
    expect(icon?.getAttribute('width')).toBe('14');
    expect(icon?.getAttribute('stroke-width')).toBe('2.6');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('m15 9-6 6M9 9l6 6');
  });

  it('labels the one platform "Result" and omits the duration for skipped and not run', () => {
    const one = render(results(history({ node: () => 'passed' }, 3, 37)));
    expect(panelFields(one.container)).toEqual([['Result', 'Passed·0.41 s']]);
    one.unmount();

    // ios-sim reported in the run before, so it has a strip; the latest run has no result on it.
    const runs = history(
      { jvm: () => 'skipped', 'ios-sim': (i) => (i === 39 ? undefined : 'passed') },
      2,
      38,
    );
    const two = render(results(runs));
    expect(panelFields(two.container)).toEqual([
      ['jvm', 'Skipped'],
      ['ios-sim', 'Not run'],
    ]);
    const tones = [...two.container.querySelectorAll<HTMLElement>('[data-part="field-status"]')];
    expect(tones.map((s) => s.className)).toEqual([
      expect.stringContaining('toneNeutral'),
      expect.stringContaining('toneMuted'),
    ]);
    // Not run: the dashed ring with nothing inside.
    expect(tones[1]?.querySelector('circle')?.getAttribute('stroke-dasharray')).toBe('3.5 3');
    expect(tones[1]?.querySelector('path')).toBeNull();
  });

  it('flaky reads "Flaky" in amber in the panel', () => {
    const { container } = render(results(history({ jvm }, 1, 14)));
    expect(panelFields(container)).toEqual([['Result', 'Flaky·0.41 s']]);
    expect(part(container, 'field-status')?.className).toContain('toneAttn');
  });

  // Design v5 item 17: the oldest label counts as TrendChart does, the oldest of n being n - 1
  // runs back.
  it('with few runs keeps them all and labels the oldest "{n-1} runs ago"', () => {
    const { container } = render(
      results(history({ jvm: () => 'passed', 'ios-sim': () => 'passed' }, 3, 37)),
    );

    expect(stripsOf(container).map((s) => cellsOf(s).length)).toEqual([3, 3]);
    expect(text(container, 'oldest')).toBe('2 runs ago');
    expect(text(container, 'latest')).toBe('Latest');
  });

  it('with two runs labels the oldest "1 run ago"', () => {
    const { container } = render(results(history({ node: () => 'passed' }, 2, 38)));
    expect(text(container, 'oldest')).toBe('1 run ago');
  });

  it('with one cell shown has no oldest label, only "Latest"', () => {
    const { container } = render(results(history({ node: () => 'passed' }, 1, 39)));
    expect(text(container, 'oldest')).toBe('');
    expect(text(container, 'latest')).toBe('Latest');
  });

  it('with all 40 fitting labels the oldest "39 runs ago"', () => {
    const { container } = render(results(TWO));
    expect(text(container, 'oldest')).toBe('39 runs ago');
  });

  it('with more runs than fit shows the latest that fit and says "Last {n} runs"', () => {
    stripWidth = 249;
    const { container } = render(results(TWO));
    const [jvmCells, iosCells] = stripsOf(container).map(cellsOf);

    expect(jvmCells).toHaveLength(28);
    expect(jvmCells?.[0]?.getAttribute('aria-label')).toBe(
      `Passed, 27 days ago, Push to main, ${sha7(12)}`,
    );
    expect(iosCells?.at(-1)?.getAttribute('aria-label')).toBe(
      `Passed, 4 min ago, Push to main, ${sha7(39)}`,
    );
    expect(text(container, 'oldest')).toBe('Last 28 runs');
    expect(listboxes(container)[0]?.getAttribute('aria-label')).toBe(
      'rendersToday on jvm, last 28 runs',
    );

    // Home goes to the oldest run shown, not one clipped away.
    const [jvmBox] = listboxes(container) as [HTMLElement];
    fireEvent.keyDown(jvmBox, { key: 'Home' });
    expect(activeIndex(jvmBox)).toBe(0);
    expect(text(container, 'when')).toBe('27 days ago');
  });

  it('before measurement renders up to 40 cells clipped on the left and no oldest label', () => {
    const runs = history({ node: () => 'passed' }, 45);
    const html = renderToStaticMarkup(results(runs));
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelectorAll('[data-part="cell"]')).toHaveLength(40);
    expect(text(doc, 'oldest')).toBe('');
    expect(text(doc, 'latest')).toBe('Latest');
  });

  it('refits when the strip is resized', () => {
    const { container } = render(results(TWO));
    expect(cellsOf(stripsOf(container)[0] as HTMLElement)).toHaveLength(40);

    stripWidth = 60;
    act(() => resize?.());

    expect(cellsOf(stripsOf(container)[0] as HTMLElement)).toHaveLength(7);
    expect(text(container, 'oldest')).toBe('Last 7 runs');
  });

  it('lists in the legend only the cell types shown, in a fixed order', () => {
    stripWidth = 249;
    const { container } = render(results(TWO));
    // The three "not run" cells are among the oldest, which no longer fit.
    expect(legendOf(container)).toEqual(['Passed', 'Failed', 'Error', 'Flaky', 'Skipped']);
  });
});

describe('StatusTimeline, runs kind', () => {
  const runsOf = (statuses: RunsTimelineRun['status'][]): RunsTimelineRun[] =>
    statuses.map((status, k) => ({ ...base(40 - statuses.length + k), branch: 'main', status }));

  it('is one image named by its counts; cells have no names and nothing is focusable', () => {
    const { container } = render(
      <StatusTimeline
        kind="runs"
        defaultBranch="main"
        runs={runsOf(['passed', 'failed', 'empty', 'passed'])}
      />,
    );
    const img = container.querySelector<HTMLElement>('[role="img"]');

    expect(img?.getAttribute('aria-label')).toBe(
      'Last 4 runs on main: 2 passed, 1 failed, 1 empty.',
    );
    expect(cellsOf(container).map((c) => c.dataset.status)).toEqual([
      'passed',
      'failed',
      'empty',
      'passed',
    ]);
    expect(cellsOf(container).some((c) => c.hasAttribute('aria-label'))).toBe(false);
    expect(cellsOf(container).some((c) => c.hasAttribute('role'))).toBe(false);
    expect(container.querySelector('[role="listbox"], [tabindex]')).toBeNull();
    expect(part(container, 'panel')).toBeNull();
    expect(legendOf(container)).toEqual(['Passed', 'Failed', 'Empty']);
  });

  it('labels the oldest of the runs shown by the same counting rule', () => {
    const { container } = render(
      <StatusTimeline
        kind="runs"
        defaultBranch="main"
        runs={runsOf(['passed', 'failed', 'empty', 'passed'])}
      />,
    );
    expect(text(container, 'oldest')).toBe('3 runs ago');
    expect(text(container, 'latest')).toBe('Latest');
  });

  it('omits zero counts and is singular at one run', () => {
    const two = render(
      <StatusTimeline kind="runs" defaultBranch="main" runs={runsOf(['passed', 'passed'])} />,
    );
    expect(two.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Last 2 runs on main: 2 passed.',
    );
    two.unmount();

    const one = render(
      <StatusTimeline kind="runs" defaultBranch="main" runs={runsOf(['failed'])} />,
    );
    expect(one.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Last 1 run on main: 1 failed.',
    );
  });

  // Design v7 item 10: the name uses the project's default branch, never the runs' own.
  it('names the strip by the default branch it is given', () => {
    const runs = runsOf(['passed', 'failed']).map((run) => ({ ...run, branch: 'feature/x' }));
    const { container } = render(<StatusTimeline kind="runs" defaultBranch="trunk" runs={runs} />);
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Last 2 runs on trunk: 1 passed, 1 failed.',
    );
  });

  it('draws the empty run as a dashed amber cell', () => {
    expect(ruleFor(CSS, '.empty')).toEqual({
      height: '24px',
      background: 'var(--attn-tint)',
      border: '1.5px dashed var(--attn)',
    });
  });
});

describe('StatusTimeline styles', () => {
  it('holds each result cell type to its height, fill and outline', () => {
    expect(ruleFor(CSS, '.passed')).toEqual({ height: '14px', background: 'var(--pass)' });
    expect(ruleFor(CSS, '.failed, .error')).toEqual({ height: '44px', background: 'var(--fail)' });
    expect(ruleFor(CSS, '.flaky')).toEqual({ height: '24px', background: 'var(--attn)' });
    expect(ruleFor(CSS, '.skipped')).toEqual({
      height: '14px',
      border: '1.5px solid var(--ink-3)',
    });
    expect(ruleFor(CSS, '.notRun')).toEqual({ height: '4px', background: 'var(--line-strong)' });
  });

  it('bottom-aligns 6 to 16px cells, 3px apart, latest on the right, in a 48px strip', () => {
    expect(ruleFor(CSS, '.cells')).toEqual({
      flex: '1 1 0%',
      'min-width': '0px',
      display: 'flex',
      'justify-content': 'flex-end',
      'align-items': 'flex-end',
      gap: '3px',
      height: '48px',
      overflow: 'hidden',
      'touch-action': 'pan-y',
      'border-radius': '4px',
    });
    expect(ruleFor(CSS, '.cell')).toEqual({
      flex: '0 1 16px',
      'min-width': '6px',
      'box-sizing': 'border-box',
      'border-radius': '2px',
      display: 'flex',
      'justify-content': 'center',
      'align-items': 'flex-start',
      font: '700 10px/14px var(--font-sans)',
      color: 'var(--on-ink)',
    });
  });

  it('outlines the selected cell 2px --ink offset 2, and the focused strip offset 4', () => {
    expect(ruleFor(CSS, '.selected')).toEqual({
      outline: '2px solid var(--ink)',
      'outline-offset': '2px',
    });
    expect(ruleFor(CSS, '.listbox:focus-visible')).toEqual({
      outline: '2px solid var(--ink)',
      'outline-offset': '4px',
    });
  });

  it('draws each legend swatch as a 10px cell no taller than 20px', () => {
    expect(ruleFor(CSS, '.swatch')).toEqual({
      width: '10px',
      'box-sizing': 'border-box',
      'border-radius': '2px',
    });
    expect(ruleFor(CSS, '.swatch.failed, .swatch.error, .swatch.flaky, .swatch.empty')).toEqual({
      height: '20px',
    });
  });

  it('sets the platform column, the end labels and the legend in the design sizes', () => {
    expect(ruleFor(CSS, '.strips')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      gap: '14px',
    });
    expect(ruleFor(CSS, '.strip')).toEqual({
      display: 'flex',
      gap: 'var(--space-3)',
      'align-items': 'flex-end',
    });
    expect(ruleFor(CSS, '.platform')).toEqual({
      width: '76px',
      flex: '0 0 auto',
      font: '13px var(--font-mono)',
      color: 'var(--ink-2)',
      'padding-bottom': '2px',
    });
    expect(ruleFor(CSS, '.ends')).toEqual({
      display: 'flex',
      'justify-content': 'space-between',
      gap: 'var(--space-3)',
      'margin-top': 'var(--space-2)',
      'font-size': '12.5px',
      color: 'var(--ink-3)',
    });
    // The end labels line up with the cells: the 76px column plus the 12px gap.
    expect(ruleFor(CSS, '.withPlatforms .ends')).toEqual({ 'padding-left': '88px' });
    expect(ruleFor(CSS, '.legend')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: 'var(--space-2) 18px',
      margin: '14px 0px 0px',
      padding: 'var(--space-3) 0 0',
      'border-top': '1px solid var(--line)',
      'list-style': 'none',
      'font-size': '13px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.legendItem')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: 'var(--space-2)',
    });
  });

  it('sets the panel as an inset, wrapping row of labelled fields', () => {
    expect(ruleFor(CSS, '.panel')).toEqual({
      'margin-top': '14px',
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: 'var(--space-3) 28px',
      'align-items': 'center',
      padding: '14px var(--space-4)',
      'border-radius': 'var(--radius-md)',
      background: 'var(--inset)',
      border: '1px solid var(--line)',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.fieldLabel')).toEqual({ 'font-size': '12.5px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.runValue')).toEqual({
      'margin-top': '3px',
      display: 'flex',
      gap: '6px',
      'font-weight': '600',
    });
    expect(ruleFor(CSS, '.sha')).toEqual({
      'font-family': 'var(--font-mono)',
      'font-weight': '500',
    });
    expect(ruleFor(CSS, '.whenValue')).toEqual({ 'margin-top': '3px' });
    expect(ruleFor(CSS, '.resultValue')).toEqual({
      'margin-top': '3px',
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
    });
    expect(ruleFor(CSS, '.status')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      'font-weight': '600',
    });
    expect(ruleFor(CSS, '.duration')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.tonePass')).toEqual({ color: 'var(--pass)' });
    expect(ruleFor(CSS, '.toneFail')).toEqual({ color: 'var(--fail)' });
    expect(ruleFor(CSS, '.toneAttn')).toEqual({ color: 'var(--attn)' });
    expect(ruleFor(CSS, '.toneNeutral')).toEqual({ color: 'var(--neutral)' });
    expect(ruleFor(CSS, '.toneMuted')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.openRun')).toEqual({
      'min-height': '44px',
      display: 'flex',
      'align-items': 'center',
      'font-weight': '600',
      'margin-left': 'auto',
    });
  });
});
