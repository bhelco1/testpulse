import { AdminHeader } from '../../../../components/AdminHeader/AdminHeader';
import { AdminNotFound } from '../../../../components/AdminNotFound/AdminNotFound';
import { RequestedPath } from '../../../../components/NotFound/RequestedPath';
import { PageFrame } from '../../../../components/PageFrame/PageFrame';
import { signOutAction } from '../../actions';

// An id that names no tracked link (design/components.md, Admin, "Page states", Unknown link),
// served with 404 inside the admin frame. The page calls notFound() only once the guard has let
// the owner in; anyone else is sent to sign in first, so nothing says whether an id exists. Its
// title, "Not found · testpulse admin", is the page's generateMetadata.

export default function TrackedLinkNotFound() {
  return (
    <PageFrame>
      <AdminHeader signOut={signOutAction} />
      <AdminNotFound path={<RequestedPath />} />
    </PageFrame>
  );
}
