import { arrivalDeps, handleArrival } from '../../../../lib/tracked-links/arrive';

// /v/<token>, a tracked link (spec section 14), reaches this handler through the rewrite in
// next.config.ts, so the code that holds the secret client stays under app/api, where lint and
// lib/queries/boundary.test.ts allow it. The logic is lib/tracked-links/arrive.ts.

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  return handleArrival(request, token, arrivalDeps());
}
