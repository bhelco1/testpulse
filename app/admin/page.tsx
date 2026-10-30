import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Suspense } from 'react';

import { AdminHeader } from '../../components/AdminHeader/AdminHeader';
import { AdminShell } from '../../components/AdminShell/AdminShell';
import { AdminSignIn } from '../../components/AdminSignIn/AdminSignIn';
import { PageFrame } from '../../components/PageFrame/PageFrame';
import { readAdminPage } from '../../lib/admin/data';
import { gateFor, getAdminAccess } from '../../lib/admin/guard';
import { readRefusedFlash } from '../../lib/admin/handlers';
import { siteOrigin } from '../../lib/admin/origin';
import { adminView } from '../../lib/admin/view';
import { now } from '../../lib/clock';
import { requestSignInLinkAction, signOutAction } from './actions';
import { AdminSections } from './sections';

// /admin (spec section 15; design/pages/Admin.dc.html). The guard runs first, on every request:
// Supabase Auth checks the session in the cookies, and only the owner's magic-link session sees
// the signed-in page. Only then is the secret client made and the sections' data read
// (lib/admin/data.ts), streamed in behind the drawn loading state. Never indexed, and no public
// page links here.

export const metadata: Metadata = {
  title: 'Admin · Testament admin',
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getAdminAccess();
  const query = await searchParams;
  const view = adminView(access, { notice: query.notice }, await readRefusedFlash());
  const gate = gateFor(access);

  if (view.kind !== 'shell' || !gate.ok) {
    return (
      <PageFrame>
        <AdminHeader signOut={undefined} />
        {view.kind === 'unavailable' && <AdminShell state="unavailable" />}
        {(view.kind === 'sign-in' || view.kind === 'refused') && (
          <AdminSignIn view={view} requestLink={requestSignInLinkAction} signOut={signOutAction} />
        )}
      </PageFrame>
    );
  }

  const at = now();
  const origin = siteOrigin(await headers()) ?? '';
  return (
    <PageFrame>
      <AdminHeader signOut={signOutAction} />
      <Suspense fallback={<AdminShell state="loading" />}>
        <AdminSections data={readAdminPage(gate, at)} now={at} origin={origin} />
      </Suspense>
    </PageFrame>
  );
}
