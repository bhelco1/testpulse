// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { SERVER_ERROR_TITLE, serverErrorKind } from '../../lib/pages/server-error';
import { ServerError } from './ServerError';

const nav = vi.hoisted(() => ({ path: '/p/ostomate2', search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const CSS = join(import.meta.dirname, 'ServerError.module.css');

beforeEach(() => {
  nav.path = '/p/ostomate2';
  nav.search = '';
});
afterEach(cleanup);

const BODY =
  'Its results couldn’t be read just now. Nothing is shown rather than numbers that might be wrong; try again in a minute.';

// Design v21 item 1 (components.md, "Server error (page)"; ServerError.dc.html): the site's own
// page when a project, run or test page's read fails. Nothing on it is read from the database.
describe('serverErrorKind', () => {
  it('names what failed from the requested path', () => {
    expect(serverErrorKind('/p/ostomate2')).toBe('project');
    expect(serverErrorKind('/p/ostomate2/runs/35642780279')).toBe('run');
    expect(serverErrorKind('/p/ostomate2/tests/com.ostomate.Home.rendersToday')).toBe('test');
  });
});

describe('ServerError', () => {
  it.each([
    ['/p/ostomate2', 'This project couldn’t be loaded'],
    ['/p/ostomate2/runs/35642780279', 'This run couldn’t be loaded'],
    ['/p/ostomate2/tests/com.ostomate.Home.rendersToday', 'This test’s history couldn’t be loaded'],
  ])('at %s says “%s”, with the Error pill, the path and the body', (path, headline) => {
    nav.path = path;
    const { getByRole, container } = render(<ServerError onRetry={() => undefined} />);
    const alert = within(getByRole('main')).getByRole('alert');
    expect(within(alert).getByText('Error')).toBeTruthy();
    expect(within(alert).getByRole('heading', { level: 1 }).textContent).toBe(headline);
    const chip = container.querySelector<HTMLElement>('[data-part="path"]');
    expect(chip?.textContent).toBe(path);
    // The path breaks after "/" and "." (v21 item 8), as soft breaks only.
    expect(chip?.querySelectorAll('wbr').length).toBeGreaterThan(0);
    expect(within(alert).getByText(BODY).tagName).toBe('P');
  });

  it('offers Try again, a link to the same address, and the overview', () => {
    nav.search = 'branches=all';
    const { getByRole } = render(<ServerError onRetry={() => undefined} />);
    const retry = getByRole('link', { name: 'Try again' });
    expect(retry.getAttribute('href')).toBe('/p/ostomate2?branches=all');
    expect(retry.dataset.variant).toBe('primary');
    expect(getByRole('link', { name: 'Go to overview' }).getAttribute('href')).toBe('/');
  });

  it('retries in place when scripts run, rather than navigating to itself', () => {
    const onRetry = vi.fn();
    const { getByRole } = render(<ServerError onRetry={onRetry} />);
    const click = fireEvent.click(getByRole('link', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(click).toBe(false);
  });

  it('shows the header and footer with nothing from the database', () => {
    const { container, getByRole } = render(<ServerError onRetry={() => undefined} />);
    // No breadcrumbs: they would need the project's name.
    expect(container.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
    // No Live or Offline: the header's tools are the theme toggle alone (v21 item 2).
    const controls = container.querySelector('[data-part="controls"]');
    expect(controls?.children).toHaveLength(1);
    expect(controls?.textContent).not.toMatch(/Live|Offline/);
    fireEvent.click(getByRole('button', { name: 'Projects' }));
    expect(within(getByRole('banner')).getByText('Projects couldn’t be loaded')).toBeTruthy();
    const footer = getByRole('contentinfo');
    expect(footer.textContent).toBe('PrivacySource on GitHub');
  });

  it('is titled “Couldn’t load · Testament”', () => {
    expect(SERVER_ERROR_TITLE).toBe('Couldn’t load · Testament');
    render(<ServerError onRetry={() => undefined} />);
    expect(document.querySelector('title')?.textContent).toBe('Couldn’t load · Testament');
  });

  it('sets the column, headline, chip, body and actions as the design draws them', () => {
    expect(ruleFor(CSS, '.main')).toEqual({ 'max-width': '640px', padding: '40px 0px 80px' });
    expect(ruleFor(CSS, '.title')).toEqual({
      margin: '16px 0px 0px',
      font: '500 clamp(34px, 4.5vw, 48px) / 1.1 var(--font-serif)',
      'letter-spacing': '-0.02em',
      'text-wrap': 'balance',
    });
    expect(ruleFor(CSS, '.body')).toEqual({
      margin: '16px 0px 0px',
      font: '400 19px / 1.5 var(--font-serif)',
      color: 'var(--ink-2)',
      'text-wrap': 'pretty',
    });
    expect(ruleFor(CSS, '.actions')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: '12px',
      'margin-top': '20px',
    });
    expect(ruleFor(CSS, '.link')).toEqual({
      'min-height': 'var(--target-min)',
      display: 'flex',
      'align-items': 'center',
      padding: '0px 8px',
      'font-size': '15px',
    });
  });
});
