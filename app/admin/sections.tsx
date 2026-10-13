import { AdminAlerts } from '../../components/AdminAlerts/AdminAlerts';
import { AdminDailyJob } from '../../components/AdminDailyJob/AdminDailyJob';
import { AdminLinks } from '../../components/AdminLinks/AdminLinks';
import { AdminMain } from '../../components/AdminMain/AdminMain';
import { AdminProjects } from '../../components/AdminProjects/AdminProjects';
import { AdminShell } from '../../components/AdminShell/AdminShell';
import type { AdminPageData } from '../../lib/admin/types';
import {
  alertsView,
  dailyJobView,
  leadOptions,
  linksView,
  projectsView,
} from '../../lib/pages/admin';
import styles from './sections.module.css';
import { acknowledgeAlertAction, createLinkAction, rotateKeyAction } from './actions';

// /admin's sections once the owner is signed in (design/pages/Admin.dc.html, SIGNED IN: MAIN).
// app/admin/page.tsx asks the guard, starts the read, and renders this inside Suspense, so the
// loading state shows until the data arrives; a read that failed is the drawn error state.

export async function AdminSections({
  data,
  now,
  origin,
}: {
  data: Promise<AdminPageData | null>;
  now: Date;
  origin: string;
}) {
  const loaded = await data;
  if (loaded === null) return <AdminShell state="unavailable" />;

  const projects = loaded.projects.flatMap(({ row }) => (row === null ? [] : [row]));
  return (
    <AdminMain variant="main" top={<h1 className={styles.h1}>Admin</h1>}>
      <AdminAlerts view={alertsView(loaded.alerts, now)} acknowledge={acknowledgeAlertAction} />
      <AdminLinks
        view={linksView(loaded.links, loaded.linkFigures, projects, now)}
        leads={leadOptions(loaded.projects)}
        origin={origin}
        today={now.toISOString().slice(0, 10)}
        create={createLinkAction}
      />
      <AdminProjects
        projects={projectsView(loaded.projects, loaded.lastReports, now)}
        rotate={rotateKeyAction}
      />
      <AdminDailyJob view={dailyJobView(loaded.job, projects, now)} />
    </AdminMain>
  );
}
