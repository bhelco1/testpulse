// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';
import styles from './SegmentedControl.module.css';

afterEach(cleanup);

// CSS Modules rename classes, so a test asks for the module's own name for one.
const has = (element: Element, name: string) => {
  const className = styles[name];
  if (!className) throw new Error(`SegmentedControl.module.css has no .${name}`);
  return element.classList.contains(className);
};

const CSS = join(import.meta.dirname, 'SegmentedControl.module.css');

type Status = 'all' | 'passed' | 'failed' | 'error' | 'skipped';

const STATUS_OPTIONS: SegmentedOption<Status>[] = [
  { value: 'all', label: 'All', count: 142 },
  { value: 'passed', label: 'Passed', count: 140 },
  { value: 'failed', label: 'Failed', count: 1, tone: 'fail' },
  { value: 'error', label: 'Error', count: 1, tone: 'fail' },
  { value: 'skipped', label: 'Skipped', count: 0 },
];

function renderStatus(value: Status = 'all') {
  const onChange = vi.fn<(value: Status) => void>();
  const view = render(
    <SegmentedControl
      label="Status"
      options={STATUS_OPTIONS}
      value={value}
      onChange={onChange}
      wrap
    />,
  );
  const radios = view.getAllByRole('radio');
  return { ...view, onChange, radios };
}

describe('SegmentedControl', () => {
  it('is a labelled radio group with one radio per option, the chosen one checked', () => {
    const { getByRole, radios } = renderStatus('passed');

    expect(getByRole('radiogroup').getAttribute('aria-label')).toBe('Status');
    expect(radios.map((radio) => radio.textContent)).toEqual([
      'All 142',
      'Passed 140',
      'Failed 1',
      'Error 1',
      'Skipped 0',
    ]);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(radios.every((radio) => radio.tagName === 'BUTTON')).toBe(true);
    expect(radios.every((radio) => radio.getAttribute('type') === 'button')).toBe(true);
  });

  it('shows no count when an option has none', () => {
    const { getAllByRole } = render(
      <SegmentedControl
        label="Branches"
        options={[
          { value: 'default', label: 'Default branch' },
          { value: 'all', label: 'All branches' },
        ]}
        value="default"
        onChange={() => {}}
      />,
    );
    expect(getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Default branch',
      'All branches',
    ]);
  });

  it('is one Tab stop: only the checked radio is in the Tab order', () => {
    const { radios } = renderStatus('failed');
    expect(radios.map((radio) => radio.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
  });

  it('selects an option on click', () => {
    const { radios, onChange } = renderStatus();
    fireEvent.click(radios[2] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith('failed');
  });

  it('moves and selects with the arrow keys, wrapping at both ends', () => {
    const { radios, onChange } = renderStatus('all');
    const [all, passed, , , skipped] = radios as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];

    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('passed');
    expect(document.activeElement).toBe(passed);

    fireEvent.keyDown(passed, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('failed');

    fireEvent.keyDown(all, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('skipped');
    expect(document.activeElement).toBe(skipped);

    fireEvent.keyDown(all, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('skipped');

    fireEvent.keyDown(skipped, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('all');
    expect(document.activeElement).toBe(all);
  });

  it('jumps to the first and last option with Home and End', () => {
    const { radios, onChange } = renderStatus('failed');
    const failed = radios[2] as HTMLElement;

    fireEvent.keyDown(failed, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('skipped');
    fireEvent.keyDown(failed, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('all');
  });

  it('leaves other keys alone, so Tab still leaves the group', () => {
    const { radios, onChange } = renderStatus();
    const event = fireEvent.keyDown(radios[0] as HTMLElement, { key: 'Tab' });
    expect(event).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the chosen option and the fail-toned options for styling', () => {
    const { radios } = renderStatus('passed');
    expect(radios.map((radio) => has(radio, 'on'))).toEqual([false, true, false, false, false]);
    expect(radios.map((radio) => has(radio, 'fail'))).toEqual([false, false, true, true, false]);
    expect(radios.map((radio) => radio.dataset.tone)).toEqual([
      undefined,
      undefined,
      'fail',
      'fail',
      undefined,
    ]);
  });

  it('wraps its options only when asked', () => {
    const { getByRole } = renderStatus();
    expect(has(getByRole('radiogroup'), 'wrap')).toBe(true);
    cleanup();
    const { getByRole: again } = render(
      <SegmentedControl label="Branches" options={[]} value="x" onChange={() => {}} />,
    );
    expect(has(again('radiogroup'), 'wrap')).toBe(false);
  });

  it('draws the group: 3px padding, 2px gap, --surface, 1px --line, radius 10', () => {
    expect(ruleFor(CSS, '.group')).toEqual({
      display: 'flex',
      padding: '3px',
      gap: '2px',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-sm)',
    });
    expect(ruleFor(CSS, '.wrap')).toEqual({ 'flex-wrap': 'wrap' });
  });

  it('draws each option 44px tall, radius 6, 14px: off --ink-2 500, on --raised --ink 600', () => {
    expect(ruleFor(CSS, '.option')).toEqual({
      'min-height': 'var(--target-min)',
      padding: '0px 14px',
      'border-radius': 'var(--radius-tag)',
      border: '0px',
      cursor: 'pointer',
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      background: 'transparent',
      color: 'var(--ink-2)',
      font: '500 14px var(--font-sans)',
    });
    expect(ruleFor(CSS, '.on')).toEqual({
      background: 'var(--raised)',
      color: 'var(--ink)',
      'font-weight': '600',
    });
    expect(ruleFor(CSS, '.option.fail')).toEqual({ color: 'var(--fail)' });
  });
});
