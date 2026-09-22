import { ingestReportWithSecretClient } from '../../../../lib/ingest/ingest';

// The parsers and the multipart reader hold whole files in memory, which needs the Node runtime.
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const { status, body } = await ingestReportWithSecretClient({
    authorization: request.headers.get('authorization'),
    contentLength: request.headers.get('content-length'),
    contentEncoding: request.headers.get('content-encoding'),
    formData: () => request.formData(),
    receivedAt: new Date(),
  });
  return Response.json(body, { status });
}
