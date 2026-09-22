import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../../app/api/v1/reports/route';
import { hashApiKey } from '../projects/keys';
import {
  type IngestInput,
  ingestReport,
  ingestReportWithSecretClient,
  RATE_LIMIT_PER_MINUTE,
} from './ingest';
import { MAX_BODY_BYTES } from './parts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const readFixture = (relativePath: string): string =>
  readFileSync(`${repoRoot}fixtures/${relativePath}`, 'utf8');
const sharedJunit = readdirSync(`${repoRoot}fixtures/ostomate2/junit/jvm/shared`)
  .filter((name) => name.endsWith('.xml'))
  .sort()
  .map((name) => readFixture(`ostomate2/junit/jvm/shared/${name}`));

// A key of the issued shape (spec 6.4) that was never issued; the fake client owns the lookup.
const KEY = `tp_${'unit_test_key_that_is_never_stored_'.padEnd(43, '0')}`;
const PROJECT = {
  id: '11111111-2222-4333-8444-555555555555',
  layer_rules: [{ default: 'unit' }],
  name_normalization: {},
};
const RECEIVED_AT = new Date('2026-09-22T10:15:42.123Z');

const meta = {
  ci_run_id: '35644117162',
  job: 'android',
  module: 'shared',
  platform: 'jvm',
  commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
  branch: 'main',
  event: 'push',
};

interface FakeOptions {
  project?: typeof PROJECT | null;
  rateCount?: number;
  ingestResult?: Record<string, unknown>;
}

interface Fake {
  client: SupabaseClient;
  lookups: string[];
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
}

// The ingest module only ever uses two shapes of the client: a single-row lookup on projects
// by api_key_hash, and RPC. The fake records both so a test can assert what was (not) called.
function fakeClient(options: FakeOptions = {}): Fake {
  const lookups: string[] = [];
  const rpcCalls: Fake['rpcCalls'] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            lookups.push(`${table}.${column}=${value}`);
            return { data: options.project === undefined ? null : options.project, error: null };
          },
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === 'rate_limit_hit') return { data: options.rateCount ?? 1, error: null };
      if (fn === 'ingest_report') {
        return {
          data: options.ingestResult ?? {
            run_id: 'run-1',
            report_id: 'report-1',
            replaced: false,
            totals: { total: 82, passed: 82, failed: 0, skipped: 0 },
            run_status: 'passed',
          },
          error: null,
        };
      }
      return { data: null, error: { code: '42883', message: `unknown function ${fn}` } };
    },
  } as unknown as SupabaseClient;
  return { client, lookups, rpcCalls };
}

const multipart = (
  entries: Array<[name: string, value: string | Blob, filename?: string]>,
): FormData => {
  const data = new FormData();
  for (const [name, value, filename] of entries) {
    if (typeof value === 'string') data.append(name, value);
    else data.append(name, value, filename ?? name);
  }
  return data;
};

const junitForm = (metaOverrides: Record<string, unknown> = {}, files = sharedJunit): FormData =>
  multipart([
    ['meta', JSON.stringify({ ...meta, ...metaOverrides })],
    ...files.map((file): [string, Blob, string] => ['junit', new Blob([file]), 'TEST.xml']),
  ]);

const input = (overrides: Partial<IngestInput> = {}) => {
  const formData = vi.fn(overrides.formData ?? (async () => junitForm()));
  return {
    authorization: `Bearer ${KEY}`,
    contentLength: null,
    contentEncoding: null,
    receivedAt: RECEIVED_AT,
    ...overrides,
    formData,
  };
};

describe('ingestReport authentication (spec section 6.3, 401)', () => {
  it.each<[string, string | null]>([
    ['a missing header', null],
    ['a non-Bearer scheme', `Basic ${KEY}`],
    ['an empty Bearer token', 'Bearer '],
    ['a bare key without the scheme', KEY],
  ])(
    'answers 401 with the same body for %s without touching the database',
    async (_label, authorization) => {
      const fake = fakeClient({ project: PROJECT });
      const request = input({ authorization });

      const response = await ingestReport(fake.client, request);

      expect(response).toEqual({ status: 401, body: { error: 'missing or unknown API key' } });
      expect(fake.lookups).toEqual([]);
      expect(fake.rpcCalls).toEqual([]);
      expect(request.formData).not.toHaveBeenCalled();
    },
  );

  it.each<[string, string]>([
    ['a key without the tp_ prefix', KEY.slice(3)],
    ['a key one character short', KEY.slice(0, -1)],
    ['a key one character long', `${KEY}0`],
    ['a key with a character outside base64url', `${KEY.slice(0, -1)}+`],
    ['a key with base64 padding', `${KEY.slice(0, -1)}=`],
    ['a key with an upper-case prefix', `TP_${KEY.slice(3)}`],
    ['a key with a trailing line break', `${KEY}\n`],
  ])(
    'answers the same 401 for %s without a database lookup, since it cannot have been issued',
    async (_label, key) => {
      const fake = fakeClient({ project: PROJECT });
      const request = input({ authorization: `Bearer ${key}` });

      const response = await ingestReport(fake.client, request);

      expect(response).toEqual({ status: 401, body: { error: 'missing or unknown API key' } });
      expect(fake.lookups).toEqual([]);
      expect(fake.rpcCalls).toEqual([]);
      expect(request.formData).not.toHaveBeenCalled();
    },
  );

  it('answers the identical 401 for a well-formed key with no project, looked up by hash only', async () => {
    const fake = fakeClient({ project: null });
    const request = input();

    const response = await ingestReport(fake.client, request);

    expect(response).toEqual({ status: 401, body: { error: 'missing or unknown API key' } });
    expect(fake.lookups).toEqual([`projects.api_key_hash=${hashApiKey(KEY)}`]);
    expect(fake.rpcCalls).toEqual([]);
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe('ingestReport rate limit (spec section 6.3, 429)', () => {
  it('counts the hit for the key hash in the receipt minute before reading the body', async () => {
    const fake = fakeClient({ project: PROJECT, rateCount: RATE_LIMIT_PER_MINUTE + 1 });
    const request = input();

    const response = await ingestReport(fake.client, request);

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      error: `rate limit exceeded: ${RATE_LIMIT_PER_MINUTE} requests per minute per key`,
    });
    expect(fake.rpcCalls).toEqual([
      {
        fn: 'rate_limit_hit',
        args: { p_api_key_hash: hashApiKey(KEY), p_minute: '2026-09-22T10:15:00.000Z' },
      },
    ]);
    expect(request.formData).not.toHaveBeenCalled();
  });

  it('lets the 60th request in a minute through', async () => {
    const fake = fakeClient({ project: PROJECT, rateCount: RATE_LIMIT_PER_MINUTE });
    const response = await ingestReport(fake.client, input());
    expect(response.status).toBe(201);
  });
});

describe('ingestReport body guards (spec section 6.5)', () => {
  it('answers 413 from content-length alone when it exceeds 4 MB', async () => {
    const fake = fakeClient({ project: PROJECT });
    const request = input({ contentLength: String(MAX_BODY_BYTES + 1) });

    const response = await ingestReport(fake.client, request);

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: `body is ${MAX_BODY_BYTES + 1} bytes; the limit is ${MAX_BODY_BYTES} bytes`,
    });
    expect(request.formData).not.toHaveBeenCalled();
    expect(fake.rpcCalls.map((call) => call.fn)).toEqual(['rate_limit_hit']);
  });

  it('reads the body when content-length is at the limit, absent, or unparseable', async () => {
    for (const contentLength of [String(MAX_BODY_BYTES), null, 'not-a-number']) {
      const fake = fakeClient({ project: PROJECT });
      const request = input({ contentLength });
      const response = await ingestReport(fake.client, request);
      expect(response.status, `content-length ${contentLength}`).toBe(201);
      expect(request.formData).toHaveBeenCalledTimes(1);
    }
  });

  it('answers 413 when the parts read exceed 4 MB although no content-length said so', async () => {
    const fake = fakeClient({ project: PROJECT });
    const form = multipart([
      ['meta', JSON.stringify(meta)],
      ['junit', new Blob([new Uint8Array(MAX_BODY_BYTES + 1)]), 'huge.xml'],
    ]);
    const request = input({ contentLength: null, formData: async () => form });

    const response = await ingestReport(fake.client, request);

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ part: 'junit' });
    expect(String(response.body.error)).toMatch(/^junit: .*byte limit/);
    expect(fake.rpcCalls.map((call) => call.fn)).toEqual(['rate_limit_hit']);
  });

  it('answers 415 for a gzip body, saying gzip is not yet accepted', async () => {
    const fake = fakeClient({ project: PROJECT });
    const request = input({ contentEncoding: 'gzip' });

    const response = await ingestReport(fake.client, request);

    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      error: 'Content-Encoding "gzip" is not yet accepted; send the body uncompressed',
    });
    expect(request.formData).not.toHaveBeenCalled();
  });

  it('treats identity encoding as no encoding', async () => {
    const fake = fakeClient({ project: PROJECT });
    const response = await ingestReport(fake.client, input({ contentEncoding: 'identity' }));
    expect(response.status).toBe(201);
  });

  it('answers 400 when the body cannot be read as multipart form data', async () => {
    const fake = fakeClient({ project: PROJECT });
    const request = input({
      formData: async () => {
        throw new TypeError('Content-Type was not one of "multipart/form-data"');
      },
    });

    const response = await ingestReport(fake.client, request);

    expect(response).toEqual({
      status: 400,
      body: { error: 'body is not multipart/form-data' },
    });
    expect(fake.rpcCalls.map((call) => call.fn)).toEqual(['rate_limit_hit']);
  });
});

describe('ingestReport validation (spec section 6.3, 400)', () => {
  it('names the part for a multipart shape error', async () => {
    const fake = fakeClient({ project: PROJECT });
    const form = multipart([['meta', JSON.stringify(meta)]]);
    const response = await ingestReport(fake.client, input({ formData: async () => form }));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ part: 'junit' });
    expect(fake.rpcCalls.map((call) => call.fn)).toEqual(['rate_limit_hit']);
  });

  it('bounds a reflected part name and names an empty one', async () => {
    const fake = fakeClient({ project: PROJECT });
    const long = junitForm();
    long.append('p'.repeat(300), 'x');
    const longResponse = await ingestReport(fake.client, input({ formData: async () => long }));
    expect(longResponse.status).toBe(400);
    expect(longResponse.body).toMatchObject({ part: 'p'.repeat(100) });
    expect(String(longResponse.body.error)).not.toContain('p'.repeat(101));

    const unnamed = junitForm();
    unnamed.append('', 'x');
    const unnamedResponse = await ingestReport(
      fake.client,
      input({ formData: async () => unnamed }),
    );
    expect(unnamedResponse.status).toBe(400);
    expect(unnamedResponse.body).toMatchObject({ part: '(unnamed)' });
    expect(String(unnamedResponse.body.error)).toMatch(/^\(unnamed\): unknown part/);
  });

  it('names meta and the field that failed validation', async () => {
    const fake = fakeClient({ project: PROJECT });
    const form = junitForm({ commit_sha: 'not-hex' });
    const response = await ingestReport(fake.client, input({ formData: async () => form }));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ part: 'meta', field: 'commit_sha' });
    expect(String(response.body.error)).toMatch(/^meta: commit_sha/);
  });

  it('names the part for a parse error', async () => {
    const fake = fakeClient({ project: PROJECT });
    const form = junitForm({}, [
      '<testsuite name="x"><testcase name="y" classname="z"></testsuite>',
    ]);
    const response = await ingestReport(fake.client, input({ formData: async () => form }));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ part: 'junit' });
    expect(String(response.body.error)).toMatch(/^junit: /);
  });

  it.each([
    ['jacoco', 'not xml at all'],
    ['istanbul', '{"total": {}}'],
  ])('names a coverage part (%s) that fails to parse', async (part, content) => {
    const fake = fakeClient({ project: PROJECT });
    const form = junitForm();
    form.append(part, new Blob([content]), part);
    const response = await ingestReport(fake.client, input({ formData: async () => form }));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ part });
  });

  it('parses jest with the path prefix from meta', async () => {
    const fake = fakeClient({ project: PROJECT });
    const form = multipart([
      [
        'meta',
        JSON.stringify({
          ...meta,
          module: 'packages/shared',
          path_prefix: '/home/runner/work/routeserve/routeserve/',
        }),
      ],
      ['jest', new Blob([readFixture('routeserve/jest/shared.json')]), 'results.json'],
    ]);
    const response = await ingestReport(fake.client, input({ formData: async () => form }));

    expect(response.status).toBe(201);
    const ingest = fake.rpcCalls.find((call) => call.fn === 'ingest_report');
    const payload = ingest?.args.payload as {
      report: { format: string };
      tests: Array<{ suite: string }>;
    };
    expect(payload.report.format).toBe('jest-json');
    expect(payload.tests[0]?.suite.startsWith('packages/shared/')).toBe(true);
  });
});

describe('ingestReport responses (spec section 6.3)', () => {
  it('answers 201 with the ids, totals and run status from the database function', async () => {
    const fake = fakeClient({ project: PROJECT });

    const response = await ingestReport(fake.client, input());

    expect(response).toEqual({
      status: 201,
      body: {
        run_id: 'run-1',
        report_id: 'report-1',
        totals: { total: 82, passed: 82, failed: 0, skipped: 0 },
        run_status: 'passed',
      },
    });
    const ingest = fake.rpcCalls.find((call) => call.fn === 'ingest_report');
    expect(ingest?.args.payload).toMatchObject({
      project_id: PROJECT.id,
      received_at: RECEIVED_AT.toISOString(),
      report: { job: 'android', module: 'shared', platform: 'jvm', format: 'junit', total: 82 },
    });
  });

  it('answers 200 when the function replaced an existing report', async () => {
    const fake = fakeClient({
      project: PROJECT,
      ingestResult: {
        run_id: 'run-1',
        report_id: 'report-2',
        replaced: true,
        totals: { total: 82, passed: 82, failed: 0, skipped: 0 },
        run_status: 'passed',
      },
    });

    const response = await ingestReport(fake.client, input());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ report_id: 'report-2' });
    expect(response.body).not.toHaveProperty('replaced');
  });

  it('answers 422 for a report with zero tests, which is still stored', async () => {
    const fake = fakeClient({
      project: PROJECT,
      ingestResult: {
        run_id: 'run-1',
        report_id: 'report-3',
        replaced: false,
        totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
        run_status: 'empty',
      },
    });
    const gradle = sharedJunit[0] ?? '';
    const emptySuite = gradle.replace(/^\s*<testcase [^>]*\/>\n/gm, '');
    expect(emptySuite).not.toContain('<testcase');

    const response = await ingestReport(
      fake.client,
      input({ formData: async () => junitForm({}, [emptySuite]) }),
    );

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      run_id: 'run-1',
      report_id: 'report-3',
      totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
      run_status: 'empty',
      error: 'the report parsed but contained zero test cases',
    });
    const ingest = fake.rpcCalls.find((call) => call.fn === 'ingest_report');
    expect(ingest?.args.payload).toMatchObject({ report: { total: 0 }, tests: [] });
  });
});

// Spec section 6.3 has no 500 row: it is the answer to anything the other rows do not cover,
// and the one thing it must never do is answer with an empty body, which is undiagnosable from
// the reporting repository's CI log.
describe('ingestReport unexpected failures (500)', () => {
  const FAKE_SECRET = 'sb_secret_never_issued_placeholder';

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const spyOnConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => {});
  const loggedLine = (spy: ReturnType<typeof spyOnConsoleError>): string =>
    String(spy.mock.calls[0]?.[0]);

  it('answers 500 for a configuration error without naming a setting or a key to the caller', async () => {
    const logged = spyOnConsoleError();
    const missingSetting = (): never => {
      throw new Error(`Missing SUPABASE_SECRET_KEY (was ${FAKE_SECRET}).`);
    };

    const response = await ingestReportWithSecretClient(input(), missingSetting);

    expect(response).toEqual({ status: 500, body: { error: 'internal error' } });
    expect(Object.keys(response.body)).toEqual(['error']);
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(FAKE_SECRET);
    expect(body).not.toContain('SUPABASE_SECRET_KEY');
    expect(logged).toHaveBeenCalledOnce();
    expect(loggedLine(logged)).toContain('ingest: configuration:');
    expect(loggedLine(logged)).toContain('SUPABASE_SECRET_KEY');
  });

  it('hands a working client straight to the ingest, logging nothing', async () => {
    const logged = spyOnConsoleError();
    const fake = fakeClient({ project: PROJECT });

    const response = await ingestReportWithSecretClient(input(), () => fake.client);

    expect(response.status).toBe(201);
    expect(logged).not.toHaveBeenCalled();
  });

  it('answers the same 500 when a query rejects mid-write, logged as a runtime failure', async () => {
    const logged = spyOnConsoleError();
    const fake = fakeClient({ project: PROJECT });
    fake.client.rpc = (async (fn: string) =>
      fn === 'rate_limit_hit'
        ? { data: 1, error: null }
        : Promise.reject(new Error('fetch failed: ECONNRESET'))) as never;

    const response = await ingestReport(fake.client, input());

    expect(response).toEqual({ status: 500, body: { error: 'internal error' } });
    expect(Object.keys(response.body)).toEqual(['error']);
    expect(logged).toHaveBeenCalledOnce();
    expect(loggedLine(logged)).toContain('ingest:');
    expect(loggedLine(logged).startsWith('ingest: configuration:')).toBe(false);
    expect(loggedLine(logged)).toContain('ECONNRESET');
  });

  it.each<[string, (fake: Fake) => void]>([
    [
      'the write function raises',
      (fake) => {
        fake.client.rpc = (async (fn: string) =>
          fn === 'rate_limit_hit'
            ? { data: 1, error: null }
            : { data: null, error: { code: 'P0001', message: 'ingest_report: boom' } }) as never;
      },
    ],
    [
      'the rate limit function raises',
      (fake) => {
        fake.client.rpc = (async () => ({
          data: null,
          error: { code: '42501', message: 'permission denied' },
        })) as never;
      },
    ],
    [
      'the project lookup raises',
      (fake) => {
        fake.client.from = (() => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { code: '08000', message: 'down' } }),
            }),
          }),
        })) as never;
      },
    ],
  ])('answers 500 and keeps the database error out of the body when %s', async (_label, breaks) => {
    const logged = spyOnConsoleError();
    const fake = fakeClient({ project: PROJECT });
    breaks(fake);

    const response = await ingestReport(fake.client, input());

    expect(response).toEqual({ status: 500, body: { error: 'internal error' } });
    expect(logged).toHaveBeenCalledOnce();
    expect(loggedLine(logged)).toContain('ingest:');
  });
});

describe('POST /api/v1/reports', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const postAnything = () =>
    POST(new Request('http://localhost/api/v1/reports', { method: 'POST' }));

  it('answers 500 with a JSON body, not an empty one, when the secret key is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');

    const response = await postAnything();

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ error: 'internal error' });
  });

  it('answers the same 500 when the configured Supabase URL is malformed', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '"127.0.0.1:54321"');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_unit_test_placeholder');

    const response = await postAnything();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'internal error' });
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).toContain('ingest: configuration:');
    expect(line).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(line).not.toContain('sb_secret_unit_test_placeholder');
  });

  it('answers 500 rather than throwing when reading the request itself fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unreadable = {
      headers: {
        get: () => {
          throw new Error('headers unavailable');
        },
      },
    } as unknown as Request;

    const response = await POST(unreadable);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'internal error' });
    expect(logged).toHaveBeenCalledOnce();
  });
});
