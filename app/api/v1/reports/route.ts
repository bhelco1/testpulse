import {
  type IngestResponse,
  ingestReportWithSecretClient,
  internalErrorResponse,
} from '../../../../lib/ingest/ingest';

// The parsers and the multipart reader hold whole files in memory, which needs the Node runtime.
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  // A body-less response is the one answer a reporting repository cannot act on, so nothing is
  // allowed to escape: whatever fails, the caller gets JSON and the detail goes to the log.
  let response: IngestResponse;
  try {
    response = await ingestReportWithSecretClient({
      authorization: request.headers.get('authorization'),
      contentLength: request.headers.get('content-length'),
      contentEncoding: request.headers.get('content-encoding'),
      formData: () => request.formData(),
      receivedAt: new Date(),
    });
  } catch (error) {
    response = internalErrorResponse(error);
  }
  return Response.json(response.body, { status: response.status });
}
