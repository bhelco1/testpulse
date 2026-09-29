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

  it('points "Source on GitHub" at the testpulse repository', () => {
    expect(SOURCE_URL).toBe('https://github.com/bhelco1/testpulse');
  });
});
