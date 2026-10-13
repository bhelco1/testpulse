import { handleVisit, visitDeps } from '../../../lib/visits/record';

// POST /api/visits: the visit beacon records a page view (spec section 14). The logic, its limits
// and its protections are lib/visits/record.ts.

export const runtime = 'nodejs';

export function POST(request: Request): Promise<Response> {
  return handleVisit(request, visitDeps());
}
