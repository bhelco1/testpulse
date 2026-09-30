'use client';

import { useParams, usePathname } from 'next/navigation';

import { Breadcrumbs } from '../Breadcrumbs/Breadcrumbs';
import type { SwitcherProject } from '../ProjectSwitcher/ProjectSwitcher';
import { NotFound } from './NotFound';

// The not-found answer under /p/[slug]/runs/[id] (design/components.md, "NotFound (page)"). A
// not-found boundary is given no props, so the route's slug comes from the router: a registered
// project answers with the run kind, anything else with the project kind.
export function RunNotFound({ projects }: { projects: readonly SwitcherProject[] }) {
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
      <NotFound kind="run" path={path} project={project} />
    </>
  );
}
