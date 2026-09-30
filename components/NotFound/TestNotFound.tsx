'use client';

import { useParams, usePathname } from 'next/navigation';

import { Breadcrumbs } from '../Breadcrumbs/Breadcrumbs';
import type { SwitcherProject } from '../ProjectSwitcher/ProjectSwitcher';
import { NotFound } from './NotFound';

// The not-found answer under /p/[slug]/tests/[testKey] (design/components.md, "NotFound (page)").
// A not-found boundary is given no props, so the route's slug comes from the router: a registered
// project answers with the test kind, anything else with the project kind.
export function TestNotFound({
  projects,
  latestRuns,
}: {
  projects: readonly SwitcherProject[];
  // Each project's latest run page, keyed by its project page (lib/pages/site.ts).
  latestRuns: Readonly<Record<string, string>>;
}) {
  const { slug } = useParams<{ slug: string }>();
  const path = usePathname();
  const project = projects.find((candidate) => candidate.href === `/p/${encodeURIComponent(slug)}`);
  if (project === undefined) return <NotFound kind="project" path={path} projects={projects} />;
  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Overview', href: '/' },
          { label: project.name, href: project.href },
        ]}
        current="Not found"
      />
      <NotFound
        kind="test"
        path={path}
        project={project}
        latestRunHref={latestRuns[project.href] ?? null}
      />
    </>
  );
}
