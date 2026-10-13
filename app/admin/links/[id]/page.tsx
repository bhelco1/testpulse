import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { AdminHeader } from '../../../../components/AdminHeader/AdminHeader';
import { AdminLinkDetail } from '../../../../components/AdminLinkDetail/AdminLinkDetail';
import { AdminShell } from '../../../../components/AdminShell/AdminShell';
import { PageFrame } from '../../../../components/PageFrame/PageFrame';
import { readLinkDetail } from '../../../../lib/admin/data';
import { gateFor, getAdminAccess } from '../../../../lib/admin/guard';
import { siteOrigin } from '../../../../lib/admin/origin';
import { adminPath } from '../../../../lib/admin/view';
import { now } from '../../../../lib/clock';
import { linkDetailView } from '../../../../lib/pages/admin';
import { deleteLinkAction, signOutAction } from '../../actions';

// One tracked link, /admin/links/{id} (design/components.md, Admin, "Link detail"). The guard
// runs first; anyone but the owner is sent to /admin, which shows them the state the guard's
// answer gives (sign-in, refused or unavailable). An id that names no link answers 404.

export const metadata: Metadata = {
  title: 'Admin · testpulse',
  robots: { index: false, follow: false },
};

export default async function TrackedLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getAdminAccess();
  const gate = gateFor(access);
  if (!gate.ok) redirect(adminPath());

  const { id } = await params;
  const detail = await readLinkDetail(gate, id);
  if (detail === null) notFound();
  return (
    <PageFrame>
      <AdminHeader signOut={signOutAction} />
      {detail === 'error' ? (
        <AdminShell state="unavailable" />
      ) : (
        <AdminLinkDetail
          view={linkDetailView(detail, now())}
          linkId={detail.link.id}
          origin={siteOrigin(await headers()) ?? ''}
          remove={deleteLinkAction}
        />
      )}
    </PageFrame>
  );
}
