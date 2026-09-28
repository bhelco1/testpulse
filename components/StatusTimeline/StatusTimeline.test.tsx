// @vitest-environment jsdom
import { join } from 'node:path';

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import {
  StatusTimeline,
  timelineCapacity,
  type ResultCellStatus,
  type TimelineCell,
} from './StatusTimeline';

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

function cell<S extends string>(status: S, i: number): TimelineCell<S> {
  return {
    status,
    label: `Run ${i + 1}`,
    sha: `sha${i}`,
    when: `${40 - i} days ago`,
    branch: 'main',
  };
}

const strip = (statuses: ResultCellStatus[]) => statuses.map((s, i) => cell(s, i));

// The Design System's two-platform sample history.
const JVM = Array.from({ length: 40 }, (_, i): ResultCellStatus =>
  i === 14 ? 'flaky' : i === 20 ? 'error' : 'passed',
);
const IOS = Array.from({ length: 40 }, (_, i): ResultCellStatus =>
  i < 3 ? 'not_run' : i === 38 ? 'failed' : i === 25 ? 'skipped' : 'passed',
);

const stripsOf = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[data-part="strip"]'),
];
const cellsOf = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('[data-part="cell"]'),
];
const text = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-part="${name}"]`)?.textContent;
const legendOf = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('[data-part="legend"] li')].map(
    (li) => li.textContent,
  );

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

describe('StatusTimeline', () => {
  it('draws one labelled strip per platform when the test ran on more than one', () => {
    const { container } = render(
      <StatusTimeline
        kind="results"
        strips={[
          { platform: 'jvm', cells: strip(JVM) },
          { platform: 'ios-sim', cells: strip(IOS) },
        ]}
      />,
    );
    const strips = stripsOf(container);

    expect(strips.map((s) => s.querySelector('[data-part="platform"]')?.textContent)).toEqual([
      'jvm',
      'ios-sim',
    ]);
    const groups = strips.map((s) => s.querySelector('[role="group"]'));
    expect(groups.map((g) => g?.getAttribute('aria-label'))).toEqual([
      'jvm timeline',
      'ios-sim timeline',
    ]);
    expect(strips.map((s) => cellsOf(s).length)).toEqual([40, 40]);
    expect((container.firstElementChild as HTMLElement).dataset.platforms).toBe('true');
  });

  it('with one platform draws one strip and no label column', () => {
    const { container } = render(
      <StatusTimeline kind="results" strips={[{ platform: 'node', cells: strip(['passed']) }]} />,
    );

    expect(container.querySelector('[data-part="platform"]')).toBeNull();
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect((container.firstElementChild as HTMLElement).dataset.platforms).toBe('false');
  });

  it('draws every result cell type with its status in words, oldest first, latest last', () => {
    const { container } = render(
      <StatusTimeline
        kind="results"
        strips={[
          {
            cells: strip(['passed', 'failed', 'error', 'flaky', 'skipped', 'not_run']),
          },
        ]}
      />,
    );
    const cells = cellsOf(container);

    expect(cells.map((c) => c.dataset.status)).toEqual([
      'passed',
      'failed',
      'error',
      'flaky',
      'skipped',
      'not_run',
    ]);
    expect(cells.map((c) => [c.getAttribute('role'), c.getAttribute('aria-label')])).toEqual([
      ['img', 'Passed, Run 1'],
      ['img', 'Failed, Run 2'],
      ['img', 'Error, Run 3'],
      ['img', 'Flaky, Run 4'],
      ['img', 'Skipped, Run 5'],
      ['img', 'Not run, Run 6'],
    ]);
    expect(cells.map((c) => c.textContent)).toEqual(['', '✕', '!', '', '', '']);
  });

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

  it('kind runs: passed, failed and a dashed amber empty cell', () => {
    const { container } = render(
      <StatusTimeline
        kind="runs"
        strips={[{ cells: (['passed', 'failed', 'empty'] as const).map((s, i) => cell(s, i)) }]}
      />,
    );

    expect(cellsOf(container).map((c) => c.getAttribute('aria-label'))).toEqual([
      'Passed, Run 1',
      'Failed, Run 2',
      'Empty, Run 3',
    ]);
    expect(legendOf(container)).toEqual(['Passed', 'Failed', 'Empty']);
    expect(ruleFor(CSS, '.empty')).toEqual({
      height: '24px',
      background: 'var(--attn-tint)',
      border: '1.5px dashed var(--attn)',
    });
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

  it('with few runs keeps them all and labels the oldest "{n} runs ago"', () => {
    const { container } = render(
      <StatusTimeline
        kind="results"
        strips={[
          { platform: 'jvm', cells: strip(['passed', 'passed', 'passed']) },
          { platform: 'ios-sim', cells: strip(['passed', 'passed', 'failed']) },
        ]}
      />,
    );

    expect(stripsOf(container).map((s) => cellsOf(s).length)).toEqual([3, 3]);
    expect(text(container, 'oldest')).toBe('3 runs ago');
    expect(text(container, 'latest')).toBe('Latest');
  });

  it('says "1 run ago" for a single run', () => {
    const { container } = render(
      <StatusTimeline kind="results" strips={[{ cells: strip(['passed']) }]} />,
    );
    expect(text(container, 'oldest')).toBe('1 run ago');
  });

  it('with all 40 fitting labels the oldest "40 runs ago"', () => {
    const { container } = render(
      <StatusTimeline kind="results" strips={[{ platform: 'jvm', cells: strip(JVM) }]} />,
    );
    expect(text(container, 'oldest')).toBe('40 runs ago');
  });

  it('with more runs than fit shows the latest that fit and says "Last {n} runs"', () => {
    stripWidth = 249;
    const { container } = render(
      <StatusTimeline
        kind="results"
        strips={[
          { platform: 'jvm', cells: strip(JVM) },
          { platform: 'ios-sim', cells: strip(IOS) },
        ]}
      />,
    );
    const [jvm, ios] = stripsOf(container).map(cellsOf);

    expect(jvm).toHaveLength(28);
    expect(jvm?.[0]?.getAttribute('aria-label')).toBe('Passed, Run 13');
    expect(ios?.at(-1)?.getAttribute('aria-label')).toBe('Passed, Run 40');
    expect(text(container, 'oldest')).toBe('Last 28 runs');
  });

  it('refits when the strip is resized', () => {
    const { container } = render(
      <StatusTimeline kind="results" strips={[{ platform: 'jvm', cells: strip(JVM) }]} />,
    );
    expect(cellsOf(container)).toHaveLength(40);

    stripWidth = 60;
    act(() => resize?.());

    expect(cellsOf(container)).toHaveLength(7);
    expect(text(container, 'oldest')).toBe('Last 7 runs');
  });

  it('lists in the legend only the cell types shown, in a fixed order', () => {
    stripWidth = 249;
    const { container } = render(
      <StatusTimeline
        kind="results"
        strips={[
          { platform: 'jvm', cells: strip(JVM) },
          { platform: 'ios-sim', cells: strip(IOS) },
        ]}
      />,
    );
    // The three "not run" cells are among the oldest, which no longer fit.
    expect(legendOf(container)).toEqual(['Passed', 'Failed', 'Error', 'Flaky', 'Skipped']);
  });

  it('draws each legend swatch as a 10px cell, failed and error shortened to 20px', () => {
    const { container } = render(
      <StatusTimeline
        kind="results"
        strips={[{ cells: strip(['passed', 'failed', 'error', 'flaky', 'skipped', 'not_run']) }]}
      />,
    );
    const swatches = [...container.querySelectorAll<HTMLElement>('[data-part="swatch"]')];

    expect(legendOf(container)).toEqual([
      'Passed',
      'Failed',
      'Error',
      'Flaky',
      'Skipped',
      'Not run',
    ]);
    expect(swatches.map((s) => s.dataset.status)).toEqual([
      'passed',
      'failed',
      'error',
      'flaky',
      'skipped',
      'not_run',
    ]);
    expect(swatches.every((s) => s.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(ruleFor(CSS, '.swatch')).toEqual({
      width: '10px',
      'box-sizing': 'border-box',
      'border-radius': '2px',
    });
    expect(ruleFor(CSS, '.swatch.failed, .swatch.error')).toEqual({ height: '20px' });
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
});
