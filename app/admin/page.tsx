import type { Metadata } from 'next';

import { AdminHeader } from '../../components/AdminHeader/AdminHeader';
import { AdminShell } from '../../components/AdminShell/AdminShell';
import { AdminSignIn } from '../../components/AdminSignIn/AdminSignIn';
import { PageFrame } from '../../components/PageFrame/PageFrame';
import { getAdminAccess } from '../../lib/admin/guard';
import { readRefusedFlash } from '../../lib/admin/handlers';
import { adminView } from '../../lib/admin/view';
import { requestSignInLinkAction, signOutAction } from './actions';

// /admin (spec section 15; design/pages/Admin.dc.html). The guard runs first, on every request:
// Supabase Auth checks the session in the cookies, and only the owner's magic-link session sees
// the signed-in page. Its sections arrive in the next pull request. Never indexed, and no public
// page links here.

export const metadata: Metadata = {
  title: 'Admin · testpulse',
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

  return (
    <PageFrame>
      <AdminHeader signOut={view.kind === 'shell' ? signOutAction : undefined} />
      {view.kind === 'shell' && <AdminShell state="ready" />}
      {view.kind === 'unavailable' && <AdminShell state="unavailable" />}
      {(view.kind === 'sign-in' || view.kind === 'refused') && (
        <AdminSignIn view={view} requestLink={requestSignInLinkAction} signOut={signOutAction} />
      )}
    </PageFrame>
  );
}
