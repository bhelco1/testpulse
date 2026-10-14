import type { ReactNode } from 'react';

import { TrackedLinkCrumbs } from '../AdminLinkDetail/AdminLinkDetail';
import { NotFound } from '../NotFound/NotFound';

// /admin/links/{id} with no such link (design/components.md, Admin, "Page states", Unknown link;
// design v18 item 14): inside the admin frame, the breadcrumb and NotFound's layout. The page only
// gets here after the admin guard has let the owner in, so it says nothing to anyone else.
export function AdminNotFound({ path }: { path: ReactNode }) {
  return (
    <>
      <TrackedLinkCrumbs current="Not found" />
      <NotFound kind="tracked-link" path={path} />
    </>
  );
}
