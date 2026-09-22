import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  ParseError,
  parseIstanbulSummary,
  parseJacoco,
  parseJestJson,
  parseJunit,
  type NormalizedReport,
} from '../parsers';
import { API_KEY_PATTERN, hashApiKey } from '../projects/keys';
import { createSecretClient } from '../supabase/server';
import { ReportMetaSchema } from './meta';
import {
  type CoverageInput,
  type IngestPayload,
  type IngestProject,
  normalizeReport,
  type ReportFormat,
} from './normalize';
import { MAX_BODY_BYTES, PartsError, readParts, type ReportParts } from './parts';

// Spec section 6.3.
export const RATE_LIMIT_PER_MINUTE = 60;

const UNAUTHORIZED_MESSAGE = 'missing or unknown API key';
const EMPTY_REPORT_MESSAGE = 'the report parsed but contained zero test cases';
// An unexpected failure says nothing else to the caller. The exception message, the stack and
// the names of the settings involved would tell an unauthenticated poster how the deployment is
// wired, and a caller can do nothing with any of it; the operator reads it in the log instead.
const INTERNAL_ERROR_MESSAGE = 'internal error';
const LOG_PREFIX = 'ingest:';
const CONFIG_LOG_PREFIX = 'ingest: configuration:';

/** What the route hands over: headers as received, the body still unread, and the clock. */
export interface IngestInput {
  readonly authorization: string | null;
  readonly contentLength: string | null;
  readonly contentEncoding: string | null;
  /** Deferred so the size and encoding headers can refuse a body before it is read. */
  readonly formData: () => Promise<FormData>;
  readonly receivedAt: Date;
}

const IngestResultSchema = z.object({
  run_id: z.string(),
  report_id: z.string(),
  replaced: z.boolean(),
  totals: z.object({
    total: z.int().nonnegative(),
    passed: z.int().nonnegative(),
    failed: z.int().nonnegative(),
    skipped: z.int().nonnegative(),
  }),
  run_status: z.enum(['passed', 'failed', 'empty']),
});

type IngestResult = z.infer<typeof IngestResultSchema>;

export interface IngestSuccessBody {
  readonly run_id: string;
  readonly report_id: string;
  readonly totals: IngestResult['totals'];
  readonly run_status: IngestResult['run_status'];
  /** Only on 422, saying why a stored report is still not a success. */
  readonly error?: string;
}

export interface IngestErrorBody {
  readonly error: string;
  /** The offending part, for 400s about the body (spec 6.3). */
  readonly part?: string;
  /** The offending meta field or parser field, when known. */
  readonly field?: string;
}

export type IngestResponse =
  | { readonly status: 200 | 201 | 422; readonly body: IngestSuccessBody }
  | { readonly status: 400 | 401 | 413 | 415 | 429 | 500; readonly body: IngestErrorBody };

const unauthorized = (): IngestResponse => ({
  status: 401,
  body: { error: UNAUTHORIZED_MESSAGE },
});

/**
 * The one place a 500 is built. The detail goes to the platform's runtime log on a single
 * greppable line, never to the caller; the request headers and body stay out of it, since the
 * Authorization value is in them.
 */
function internalError(prefix: string, cause: unknown): IngestResponse {
  const detail =
    cause instanceof Error ? (cause.stack ?? `${cause.name}: ${cause.message}`) : String(cause);
  console.error(`${prefix} ${detail}`);
  return { status: 500, body: { error: INTERNAL_ERROR_MESSAGE } };
}

/** For the route's own last-resort catch, around everything outside {@link ingestReport}. */
export function internalErrorResponse(cause: unknown): IngestResponse {
  return internalError(LOG_PREFIX, cause);
}

const BEARER = /^Bearer\s+(\S+)$/;

/** The presented key, only if it has the issued shape; anything else was never a key. */
function bearerKey(authorization: string | null): string | null {
  const match = authorization === null ? null : BEARER.exec(authorization);
  const key = match?.[1];
  return key !== undefined && API_KEY_PATTERN.test(key) ? key : null;
}

function floorToMinute(at: Date): Date {
  return new Date(Math.floor(at.getTime() / 60_000) * 60_000);
}

function declaredContentLength(header: string | null): number | undefined {
  if (header === null) return undefined;
  const length = Number.parseInt(header, 10);
  return Number.isSafeInteger(length) ? length : undefined;
}

const failed = (what: string, error: { code: string; message: string }): Error =>
  new Error(`${what}: ${error.code} ${error.message}`);

/**
 * The key is looked up by its digest with an indexed equality: the caller controls the key,
 * never the stored hash, so a comparison on the digest leaks nothing about the stored value.
 */
async function findProjectByKeyHash(
  client: SupabaseClient,
  hash: string,
): Promise<IngestProject | null> {
  const { data, error } = await client
    .from('projects')
    .select('id, layer_rules')
    .eq('api_key_hash', hash)
    .maybeSingle();
  if (error) throw failed('look up project by key', error);
  return data === null ? null : { id: data.id as string, layer_rules: data.layer_rules };
}

async function rateLimitHit(client: SupabaseClient, hash: string, minute: Date): Promise<number> {
  const { data, error } = await client.rpc('rate_limit_hit', {
    p_api_key_hash: hash,
    p_minute: minute.toISOString(),
  });
  if (error) throw failed('rate_limit_hit', error);
  return Number(data);
}

async function writeReport(client: SupabaseClient, payload: IngestPayload): Promise<IngestResult> {
  const { data, error } = await client.rpc('ingest_report', { payload });
  if (error) throw failed('ingest_report', error);
  return IngestResultSchema.parse(data);
}

/** A ParseError tagged with the multipart part it came from, so the 400 can name it. */
class PartParseError extends Error {
  constructor(
    readonly part: string,
    readonly reason: ParseError,
  ) {
    super(reason.message);
    this.name = 'PartParseError';
  }
}

function parsing<T>(part: string, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ParseError) throw new PartParseError(part, error);
    throw error;
  }
}

const REPORT_FORMATS: Readonly<Record<ReportParts['results']['format'], ReportFormat>> = {
  junit: 'junit',
  jest: 'jest-json',
};

function parseResults(parts: ReportParts, pathPrefix: string | undefined): NormalizedReport {
  const { results } = parts;
  return results.format === 'junit'
    ? parsing('junit', () => parseJunit(results.files))
    : parsing('jest', () => parseJestJson(results.file, { pathPrefix }));
}

function parseCoverage(parts: ReportParts): CoverageInput[] {
  const coverage: CoverageInput[] = [];
  if (parts.jacoco !== undefined) {
    const text = parts.jacoco;
    coverage.push({ format: 'jacoco', coverage: parsing('jacoco', () => parseJacoco(text)) });
  }
  if (parts.istanbul !== undefined) {
    const text = parts.istanbul;
    coverage.push({
      format: 'istanbul',
      coverage: parsing('istanbul', () => parseIstanbulSummary(text)),
    });
  }
  return coverage;
}

function refused(error: PartsError | PartParseError): IngestResponse {
  const { part } = error;
  const field = error instanceof PartParseError ? error.reason.field : undefined;
  return {
    status: error instanceof PartsError ? error.status : 400,
    body: {
      error: `${part}: ${error.message}`,
      part,
      ...(field === undefined ? {} : { field }),
    },
  };
}

/**
 * Spec section 6: one request, one report. Steps run in the order that lets each refusal do the
 * least work: the key's shape needs no lookup at all, the key and the rate limit need only
 * headers and two indexed lookups, the size and encoding checks need only headers, and the body
 * is read last.
 */
async function runIngest(client: SupabaseClient, input: IngestInput): Promise<IngestResponse> {
  const key = bearerKey(input.authorization);
  if (key === null) return unauthorized();
  const hash = hashApiKey(key);
  const project = await findProjectByKeyHash(client, hash);
  if (project === null) return unauthorized();

  const hits = await rateLimitHit(client, hash, floorToMinute(input.receivedAt));
  if (hits > RATE_LIMIT_PER_MINUTE) {
    return {
      status: 429,
      body: { error: `rate limit exceeded: ${RATE_LIMIT_PER_MINUTE} requests per minute per key` },
    };
  }

  const declared = declaredContentLength(input.contentLength);
  if (declared !== undefined && declared > MAX_BODY_BYTES) {
    return {
      status: 413,
      body: { error: `body is ${declared} bytes; the limit is ${MAX_BODY_BYTES} bytes` },
    };
  }
  const encoding = input.contentEncoding?.trim().toLowerCase() ?? '';
  if (encoding !== '' && encoding !== 'identity') {
    return {
      status: 415,
      body: {
        error: `Content-Encoding "${encoding.slice(0, 40)}" is not yet accepted; send the body uncompressed`,
      },
    };
  }

  let formData: FormData;
  try {
    formData = await input.formData();
  } catch {
    return { status: 400, body: { error: 'body is not multipart/form-data' } };
  }

  let payload: IngestPayload;
  try {
    const parts = await readParts(formData);
    const meta = ReportMetaSchema.safeParse(parts.meta);
    if (!meta.success) {
      const issue = meta.error.issues[0];
      const field = issue === undefined ? '' : issue.path.join('.');
      const message = issue?.message ?? 'does not match the schema';
      return {
        status: 400,
        body: {
          error: field === '' ? `meta: ${message}` : `meta: ${field}: ${message}`,
          part: 'meta',
          ...(field === '' ? {} : { field }),
        },
      };
    }
    const report = parseResults(parts, meta.data.path_prefix);
    const coverage = parseCoverage(parts);
    payload = parsing(parts.results.format, () =>
      normalizeReport(
        meta.data,
        project,
        { format: REPORT_FORMATS[parts.results.format], report },
        coverage,
        input.receivedAt,
      ),
    );
  } catch (error) {
    if (error instanceof PartsError || error instanceof PartParseError) {
      return refused(error);
    }
    throw error;
  }

  const result = await writeReport(client, payload);
  const body: IngestSuccessBody = {
    run_id: result.run_id,
    report_id: result.report_id,
    totals: result.totals,
    run_status: result.run_status,
  };
  if (result.totals.total === 0) {
    return { status: 422, body: { ...body, error: EMPTY_REPORT_MESSAGE } };
  }
  return { status: result.replaced ? 200 : 201, body };
}

/**
 * Every status but 500 is a decision this function made deliberately; the 500 is everything
 * else, so that a caller always gets a body it can print. Before this wrapper existed, a throw
 * here reached the route unhandled and CI logged `HTTP 500:` with nothing after it.
 */
export async function ingestReport(
  client: SupabaseClient,
  input: IngestInput,
): Promise<IngestResponse> {
  try {
    return await runIngest(client, input);
  } catch (error) {
    return internalError(LOG_PREFIX, error);
  }
}

/**
 * The route's entry point. Lint forbids app/ from importing the secret client directly, so the
 * client is built here, per request; the constructor is cheap and holds no connection.
 *
 * A throw from the factory is a misconfigured deployment rather than a failing request, so it
 * gets its own log prefix; the caller cannot tell the two apart, and should not be able to.
 */
export async function ingestReportWithSecretClient(
  input: IngestInput,
  createClient: () => SupabaseClient = createSecretClient,
): Promise<IngestResponse> {
  let client: SupabaseClient;
  try {
    client = createClient();
  } catch (error) {
    return internalError(CONFIG_LOG_PREFIX, error);
  }
  return ingestReport(client, input);
}
