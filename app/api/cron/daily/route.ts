import { now } from '../../../../lib/clock';
import { handleDailyCron } from '../../../../lib/jobs/cron';

// The daily scheduled function (spec section 12), called once a day by Vercel cron (vercel.json)
// with `Authorization: Bearer ${CRON_SECRET}`. The logic is lib/jobs/cron.ts and lib/jobs/daily.ts.

export const runtime = 'nodejs';
// Vercel Hobby's limit; the prune stops starting batches well before it (lib/jobs/daily.ts).
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const { status, body } = await handleDailyCron(
    { authorization: request.headers.get('authorization'), env: process.env },
    { now: () => now() },
  );
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
