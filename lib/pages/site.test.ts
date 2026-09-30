import { describe, expect, it } from 'vitest';

import { SOURCE_URL, siteChromeView } from './site.ts';

const NOW = new Date('2026-10-05T12:00:00.000Z');

describe('siteChromeView', () => {
  it('links each project to its page with its latest run’s status', () => {
    const view = siteChromeView(
      {
        projects: [
          { slug: 'ostomate2', name: 'Ostomate 2.0', status: 'passed' },
          { slug: 'testpulse', name: 'testpulse', status: 'not_reporting' },
        ],
        lastReportAt: new Date('2026-10-05T09:26:00Z'),
      },
      NOW,
    );

    expect(view.projects).toEqual([
      { name: 'Ostomate 2.0', href: '/p/ostomate2', status: 'passed' },
      { name: 'testpulse', href: '/p/testpulse', status: 'not_reporting' },
    ]);
    expect(view.lastReport).toEqual({
      text: '2 h ago',
      datetime: '2026-10-05T09:26:00.000Z',
      title: '5 Oct 2026, 09:26 UTC',
    });
  });

  it('has no last report before anything has reported', () => {
    expect(siteChromeView({ projects: [], lastReportAt: null }, NOW).lastReport).toBeUndefined();
  });

  // The live note's "Offline. Showing runs as of {HH:MM}; reconnecting": the page's data is as
  // of the instant it was rendered, in UTC.
  it('dates the page’s data at the render instant, as HH:MM UTC', () => {
    expect(siteChromeView({ projects: [], lastReportAt: null }, NOW).asOf).toEqual({
      text: '12:00',
      datetime: '2026-10-05T12:00:00.000Z',
      title: '5 Oct 2026, 12:00 UTC',
    });
  });

  it('points "Source on GitHub" at the testpulse repository', () => {
    expect(SOURCE_URL).toBe('https://github.com/bhelco1/testpulse');
  });
});
