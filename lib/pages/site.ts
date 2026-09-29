import type { SwitcherProject } from '../../components/ProjectSwitcher/ProjectSwitcher';
import { relativeTime } from '../copy/time';
import type { SiteChrome } from '../queries/site';

// The footer's "Source on GitHub": testpulse's own repository, the same as its
// projects/testpulse.yaml repo_url.
export const SOURCE_URL = 'https://github.com/bhelco1/testpulse';

export interface SiteChromeView {
  readonly projects: readonly SwitcherProject[];
  /** "Last report received {relative}"; none before any project has reported. */
  readonly lastReport: string | undefined;
}

export function siteChromeView(chrome: SiteChrome, now: Date): SiteChromeView {
  return {
    projects: chrome.projects.map((project) => ({
      name: project.name,
      href: `/p/${encodeURIComponent(project.slug)}`,
      status: project.status,
    })),
    lastReport: chrome.lastReportAt === null ? undefined : relativeTime(chrome.lastReportAt, now),
  };
}
