import { handleVisitTime, visitDeps } from '../../../../lib/visits/record';

// POST /api/visits/time: the visit beacon sends how long a view lasted (spec section 14), once,
// for a view of the caller's own session. The logic is lib/visits/record.ts.

export const runtime = 'nodejs';

export function POST(request: Request): Promise<Response> {
  return handleVisitTime(request, visitDeps());
}
