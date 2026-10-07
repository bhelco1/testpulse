import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ReportMetaSchema } from '../lib/ingest/meta';

// Spec section 16, "Contract" row: the Appendix A reporter, run against a local server through
// both of its entry points: the script itself, as a repo that copies it calls it, and the shared
// action that runs it (.github/actions/report).

const actionDir = fileURLToPath(new URL('../.github/actions/report/', import.meta.url));
const scriptPath = `${actionDir}testpulse-report.sh`;
const copiedScriptPath = fileURLToPath(new URL('./testpulse-report.sh', import.meta.url));
const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url));
const junitDir = `${fixturesDir}ostomate2/junit/jvm/shared/`;
const junitGlob = `${junitDir}TEST-*.xml`;
const jacocoFile = `${fixturesDir}ostomate2/jacoco/shared.xml`;
const jestFile = `${fixturesDir}routeserve/jest/shared.json`;
const istanbulFile = `${fixturesDir}routeserve/istanbul/shared.json`;

const token = 'tp_contract-test-token';

// The variables a GitHub Actions runner exports and the script reads. GITHUB_HEAD_REF is left
// unset here so the push-event branch rule is the default under test.
const githubEnv = {
  GITHUB_RUN_ID: '35644117162',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_SHA: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
  GITHUB_REF_NAME: 'main',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'bhelco1/Ostomate2',
  GITHUB_WORKSPACE: '/home/runner/work/Ostomate2/Ostomate2',
};

const expectedMeta = {
  ci_run_id: '35644117162',
  run_attempt: 2,
  job: 'android',
  module: 'shared',
  platform: 'jvm',
  commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
  branch: 'main',
  event: 'push',
  run_url: 'https://github.com/bhelco1/Ostomate2/actions/runs/35644117162',
  path_prefix: '/home/runner/work/Ostomate2/Ostomate2/',
};

interface Outcome {
  code: number | null;
  stdout: string;
  stderr: string;
}

// The test process itself serves the request, so the script has to run asynchronously: a
// synchronous spawn would block the event loop and the server could never answer.
function runBash(bashArgs: string[], env: Record<string, string>): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    // Only PATH (and NODE_ENV, which Next's ProcessEnv type requires) is inherited: the test
    // must not pick up the GITHUB_* variables of a CI runner.
    const child = spawn('bash', bashArgs, {
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? '/usr/bin:/bin', ...env },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

const ActionSchema = z.object({
  inputs: z.record(z.string(), z.object({ default: z.string().optional() })),
  runs: z.object({
    using: z.literal('composite'),
    steps: z
      .array(
        z.object({
          shell: z.literal('bash'),
          env: z.record(z.string(), z.string()),
          run: z.string(),
        }),
      )
      .length(1),
  }),
});
const action = ActionSchema.parse(parseYaml(readFileSync(`${actionDir}action.yml`, 'utf8')));
const actionStep = action.runs.steps[0] as (typeof action.runs.steps)[number];

// The script's positional arguments, in order, as the action's inputs name them.
const POSITIONAL_INPUTS = [
  'job',
  'module',
  'platform',
  'format',
  'results',
  'coverage-format',
  'coverage-file',
] as const;

// What the runner does with the step: every `${{ inputs.<name> }}` in its env becomes the input's
// value (the caller's, else the default, else empty), and `run` goes to bash as GitHub's
// `shell: bash` runs it. Any other expression would be untested, so it fails the test instead.
function evaluateInputs(template: string, inputs: Record<string, string>): string {
  return template.replace(/\$\{\{\s*([^}]*?)\s*\}\}/g, (_match, expression: string) => {
    const name = /^inputs\.([a-z-]+)$/.exec(expression)?.[1];
    if (name === undefined || !(name in action.inputs)) {
      throw new Error(`action.yml uses an expression this test does not model: ${expression}`);
    }
    return inputs[name] ?? action.inputs[name]?.default ?? '';
  });
}

interface Entry {
  readonly name: string;
  readonly run: (args: string[], env: Record<string, string>) => Promise<Outcome>;
}

const scriptEntry: Entry = {
  name: 'testpulse-report.sh',
  run: (args, env) => runBash([scriptPath, ...args], env),
};

// The caller's TESTPULSE_* variables become the url and token inputs, as a workflow passes
// vars.TESTPULSE_URL and secrets.TESTPULSE_TOKEN; the step's env then sets them for the script.
const actionEntry: Entry = {
  name: 'the report action',
  run: (args, env) => {
    const { TESTPULSE_URL: url, TESTPULSE_TOKEN: token, ...runnerEnv } = env;
    const inputs: Record<string, string> = {};
    POSITIONAL_INPUTS.forEach((name, index) => {
      const value = args[index];
      if (value !== undefined) inputs[name] = value;
    });
    if (url !== undefined) inputs.url = url;
    if (token !== undefined) inputs.token = token;
    const stepEnv = Object.fromEntries(
      Object.entries(actionStep.env).map(([name, value]) => [name, evaluateInputs(value, inputs)]),
    );
    return runBash(['--noprofile', '--norc', '-eo', 'pipefail', '-c', actionStep.run], {
      ...runnerEnv,
      GITHUB_ACTION_PATH: actionDir.replace(/\/$/, ''),
      ...stepEnv,
    });
  },
};

interface Captured {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

interface Reply {
  status: number;
  body: string;
}

interface LocalServer {
  url: string;
  requests: Captured[];
  close: () => Promise<void>;
}

const servers: Server[] = [];

function startServer(reply: (request: Captured) => Reply): Promise<LocalServer> {
  const requests: Captured[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const captured: Captured = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks),
      };
      requests.push(captured);
      const { status, body } = reply(captured);
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(body);
    });
  });
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

interface Part {
  name: string;
  filename: string | undefined;
  contentType: string | undefined;
  body: Buffer;
}

// A minimal multipart/form-data reader (RFC 7578) for what curl -F produces: CRLF line ends,
// a header block per part, and a closing delimiter ending in "--".
function parseMultipart(contentType: string | undefined, body: Buffer): Part[] {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? '');
  const delimiter = Buffer.from(`--${boundary?.[1] ?? boundary?.[2] ?? ''}`);
  if (delimiter.length === 2) throw new Error(`no multipart boundary in ${contentType}`);

  const parts: Part[] = [];
  let cursor = body.indexOf(delimiter);
  while (cursor !== -1) {
    cursor += delimiter.length;
    if (body.subarray(cursor, cursor + 2).toString() === '--') break;
    cursor += 2;
    const headerEnd = body.indexOf('\r\n\r\n', cursor);
    const headers = body.subarray(cursor, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;
    const next = body.indexOf(delimiter, bodyStart);
    parts.push({
      name: /name="([^"]*)"/.exec(headers)?.[1] ?? '',
      filename: /filename="([^"]*)"/.exec(headers)?.[1],
      contentType: /^content-type:\s*(.+?)\s*$/im.exec(headers)?.[1],
      body: body.subarray(bodyStart, next - 2),
    });
    cursor = next;
  }
  return parts;
}

const byName = (parts: Part[], name: string): Part[] => parts.filter((part) => part.name === name);

const only = (parts: Part[], name: string): Part => {
  const matches = byName(parts, name);
  expect(matches, `expected exactly one ${name} part`).toHaveLength(1);
  return matches[0] as Part;
};

const created = (): Reply => ({ status: 201, body: '{"run_id":"r","report_id":"p"}' });

// A posted report says nothing at all, on every bash: the script runs on the stock macOS bash
// 3.2 as well as on the bash 5 of the GitHub-hosted runners.
const success: Outcome = { code: 0, stdout: '', stderr: '' };

const baseEnv = (url: string): Record<string, string> => ({
  ...githubEnv,
  TESTPULSE_URL: url,
  TESTPULSE_TOKEN: token,
});

const junitArgs = ['android', 'shared', 'jvm', 'junit', junitGlob];

const usageWarning =
  '::warning::testpulse: usage: testpulse-report.sh <job> <module> <platform> <format> ' +
  '<results-glob> [coverage-format coverage-file]; skipping\n';

describe.each([scriptEntry, actionEntry])(
  'the reporter through $name (spec Appendix A)',
  (entry) => {
    it('posts meta, one junit part per matched file, and the jacoco report with a bearer token', async () => {
      const server = await startServer(created);

      const outcome = await entry.run([...junitArgs, 'jacoco', jacocoFile], baseEnv(server.url));

      expect(outcome).toEqual(success);
      expect(server.requests).toHaveLength(1);
      const request = server.requests[0] as Captured;
      expect(request.method).toBe('POST');
      expect(request.url).toBe('/api/v1/reports');
      expect(request.headers.authorization).toBe(`Bearer ${token}`);
      expect(request.headers['content-type']).toMatch(/^multipart\/form-data;/);

      const parts = parseMultipart(request.headers['content-type'], request.body);
      expect(new Set(parts.map((part) => part.name))).toEqual(new Set(['meta', 'junit', 'jacoco']));

      const meta = only(parts, 'meta');
      expect(meta.contentType).toBe('application/json');
      expect(ReportMetaSchema.parse(JSON.parse(meta.body.toString('utf8')))).toEqual(expectedMeta);

      const fixtureNames = readdirSync(junitDir).filter((name) => /^TEST-.*\.xml$/.test(name));
      expect(fixtureNames).toHaveLength(10);
      const junit = byName(parts, 'junit');
      expect(junit.map((part) => part.filename).sort()).toEqual([...fixtureNames].sort());
      for (const part of junit) {
        expect(part.body.equals(readFileSync(`${junitDir}${part.filename}`))).toBe(true);
      }

      const jacoco = only(parts, 'jacoco');
      expect(jacoco.filename).toBe(basename(jacocoFile));
      expect(jacoco.body.equals(readFileSync(jacocoFile))).toBe(true);
    });

    it('reports the pull request head ref as the branch when GITHUB_HEAD_REF is set', async () => {
      const server = await startServer(created);

      const outcome = await entry.run(junitArgs, {
        ...baseEnv(server.url),
        GITHUB_HEAD_REF: 'feature/reporter',
        GITHUB_EVENT_NAME: 'pull_request',
      });

      expect(outcome.code).toBe(0);
      const request = server.requests[0] as Captured;
      const parts = parseMultipart(request.headers['content-type'], request.body);
      const meta = ReportMetaSchema.parse(JSON.parse(only(parts, 'meta').body.toString('utf8')));
      expect(meta.branch).toBe('feature/reporter');
      expect(meta.event).toBe('pull_request');
    });

    it('names the parts jest and istanbul for the routeserve formats', async () => {
      const server = await startServer(created);

      const outcome = await entry.run(
        ['test', 'packages/shared', 'node', 'jest', jestFile, 'istanbul', istanbulFile],
        baseEnv(server.url),
      );

      expect(outcome.code).toBe(0);
      const request = server.requests[0] as Captured;
      const parts = parseMultipart(request.headers['content-type'], request.body);
      expect(new Set(parts.map((part) => part.name))).toEqual(
        new Set(['meta', 'jest', 'istanbul']),
      );
      expect(only(parts, 'jest').body.equals(readFileSync(jestFile))).toBe(true);
      expect(only(parts, 'istanbul').body.equals(readFileSync(istanbulFile))).toBe(true);
    });

    it('sends no coverage part when the coverage file does not exist', async () => {
      const server = await startServer(created);

      const outcome = await entry.run(
        [...junitArgs, 'jacoco', `${fixturesDir}ostomate2/jacoco/missing.xml`],
        baseEnv(server.url),
      );

      expect(outcome).toEqual(success);
      const request = server.requests[0] as Captured;
      const parts = parseMultipart(request.headers['content-type'], request.body);
      expect(byName(parts, 'jacoco')).toHaveLength(0);
      expect(byName(parts, 'junit')).toHaveLength(10);
    });

    it('exits 0 with a warning carrying the status and response body on 401', async () => {
      const server = await startServer(() => ({ status: 401, body: '{"error":"unknown key"}' }));

      const outcome = await entry.run(junitArgs, baseEnv(server.url));

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toContain('::warning::');
      expect(outcome.stdout).toContain('HTTP 401');
      expect(outcome.stdout).toContain('{"error":"unknown key"}');
    });

    it('exits 0 with a warning carrying HTTP 000 when the server cannot be reached', async () => {
      const server = await startServer(created);
      await server.close();

      const outcome = await entry.run(junitArgs, baseEnv(server.url));

      expect(outcome.code).toBe(0);
      // curl writes its own 000 on a failed connection: exactly one, never doubled by a default.
      expect(outcome.stdout).toBe('::warning::testpulse report failed (HTTP 000): \n');
      expect(server.requests).toHaveLength(0);
    });

    it.each(['TESTPULSE_TOKEN', 'TESTPULSE_URL'])(
      'exits 0 with a notice and no request when %s is unset',
      async (variable) => {
        const server = await startServer(created);
        const { [variable]: unset, ...env } = baseEnv(server.url);
        void unset;

        const outcome = await entry.run(junitArgs, env);

        expect(outcome.code).toBe(0);
        expect(outcome.stdout).toContain('::notice::');
        expect(outcome.stdout).not.toContain('::warning::');
        expect(server.requests).toHaveLength(0);
      },
    );

    it('retries a transient 503 and treats the following 201 as success', async () => {
      let attempts = 0;
      const server = await startServer(() => {
        attempts += 1;
        return attempts === 1 ? { status: 503, body: 'try again' } : created();
      });

      const outcome = await entry.run(junitArgs, baseEnv(server.url));

      expect(outcome).toEqual(success);
      expect(server.requests).toHaveLength(2);
    });

    it('escapes backslashes and double quotes in the values it interpolates into meta', async () => {
      const server = await startServer(created);
      const branch = String.raw`feat/"quoted"\odd`;

      const outcome = await entry.run(['a"b', String.raw`c\d`, 'jvm', 'junit', junitGlob], {
        ...baseEnv(server.url),
        GITHUB_HEAD_REF: branch,
        GITHUB_EVENT_NAME: 'pull_request',
      });

      expect(outcome).toEqual(success);
      const request = server.requests[0] as Captured;
      const parts = parseMultipart(request.headers['content-type'], request.body);
      const meta = ReportMetaSchema.parse(JSON.parse(only(parts, 'meta').body.toString('utf8')));
      expect(meta.branch).toBe(branch);
      expect(meta.job).toBe('a"b');
      expect(meta.module).toBe(String.raw`c\d`);
    });

    it.each([
      ['GITHUB_RUN_ID', ['GITHUB_RUN_ID'], 'GITHUB_RUN_ID'],
      ['GITHUB_SHA', ['GITHUB_SHA'], 'GITHUB_SHA'],
      ['GITHUB_EVENT_NAME', ['GITHUB_EVENT_NAME'], 'GITHUB_EVENT_NAME'],
      ['the branch', ['GITHUB_REF_NAME'], 'GITHUB_HEAD_REF or GITHUB_REF_NAME'],
    ])('exits 0 with a warning and no request when %s is missing', async (_label, drop, named) => {
      const server = await startServer(created);
      const env = baseEnv(server.url);
      for (const variable of drop) delete env[variable];

      const outcome = await entry.run(junitArgs, env);

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe(`::warning::testpulse: missing ${named}; skipping\n`);
      expect(server.requests).toHaveLength(0);
    });

    it.each([
      ['no arguments at all', []],
      ['the results glob missing', junitArgs.slice(0, 4)],
    ])('exits 0 with the usage warning and no request given %s', async (_label, args) => {
      const server = await startServer(created);

      const outcome = await entry.run(args, baseEnv(server.url));

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe(usageWarning);
      expect(server.requests).toHaveLength(0);
    });

    it('falls back to run attempt 1 when GITHUB_RUN_ATTEMPT is not a positive integer', async () => {
      const server = await startServer(created);

      const outcome = await entry.run(junitArgs, {
        ...baseEnv(server.url),
        GITHUB_RUN_ATTEMPT: 'abc',
      });

      expect(outcome).toEqual(success);
      const request = server.requests[0] as Captured;
      const parts = parseMultipart(request.headers['content-type'], request.body);
      const meta = ReportMetaSchema.parse(JSON.parse(only(parts, 'meta').body.toString('utf8')));
      expect(meta.run_attempt).toBe(1);
    });

    it.each(['GITHUB_SERVER_URL', 'GITHUB_REPOSITORY'])(
      'omits run_url rather than sending an unusable one when %s is missing',
      async (variable) => {
        const server = await startServer(created);
        const env = baseEnv(server.url);
        delete env[variable];

        const outcome = await entry.run(junitArgs, env);

        expect(outcome).toEqual(success);
        const request = server.requests[0] as Captured;
        const parts = parseMultipart(request.headers['content-type'], request.body);
        const json: unknown = JSON.parse(only(parts, 'meta').body.toString('utf8'));
        expect(json).not.toHaveProperty('run_url');
        const meta = ReportMetaSchema.parse(json);
        expect(meta).not.toHaveProperty('run_url');
        expect(meta.ci_run_id).toBe(githubEnv.GITHUB_RUN_ID);
      },
    );

    it('sends run_url when the server URL and the repository are both set', async () => {
      const server = await startServer(created);

      const outcome = await entry.run(junitArgs, baseEnv(server.url));

      expect(outcome).toEqual(success);
      const request = server.requests[0] as Captured;
      const parts = parseMultipart(request.headers['content-type'], request.body);
      const meta = ReportMetaSchema.parse(JSON.parse(only(parts, 'meta').body.toString('utf8')));
      expect(meta.run_url).toBe(expectedMeta.run_url);
    });

    it('keeps each call to its own response file when two run at once', async () => {
      const first = await startServer(() => ({ status: 400, body: 'first body' }));
      const second = await startServer(() => ({ status: 400, body: 'second body' }));

      const [one, two] = await Promise.all([
        entry.run(junitArgs, baseEnv(first.url)),
        entry.run(junitArgs, baseEnv(second.url)),
      ]);

      expect(one.stdout).toBe('::warning::testpulse report failed (HTTP 400): first body\n');
      expect(two.stdout).toBe('::warning::testpulse report failed (HTTP 400): second body\n');
    });

    // Standard section 7: a report that is not sent, or not answered with 200 or 201, also leaves
    // a line in the job summary, since an annotation on a green job is easy to miss.
    describe('job summary', () => {
      let dir = '';
      const summaryFile = (): string => join(dir, 'summary.md');
      const summary = (): string => readFileSync(summaryFile(), 'utf8');

      afterEach(() => {
        if (dir !== '') rmSync(dir, { recursive: true, force: true });
        dir = '';
      });

      const withSummary = (env: Record<string, string>): Record<string, string> => {
        dir = mkdtempSync(join(tmpdir(), 'testpulse-summary-'));
        writeFileSync(summaryFile(), '');
        return { ...env, GITHUB_STEP_SUMMARY: summaryFile() };
      };

      it('stays empty when the report is accepted', async () => {
        const server = await startServer(created);

        const outcome = await entry.run(junitArgs, withSummary(baseEnv(server.url)));

        expect(outcome).toEqual(success);
        expect(summary()).toBe('');
      });

      it('names the report and the status when the report is not accepted', async () => {
        const server = await startServer(() => ({ status: 401, body: '{"error":"unknown key"}' }));

        const outcome = await entry.run(junitArgs, withSummary(baseEnv(server.url)));

        expect(outcome.code).toBe(0);
        expect(summary()).toBe(
          "- testpulse: report `android/shared/jvm` got HTTP 401, not 200 or 201. The step's " +
            'warning has the response.\n',
        );
      });

      it('says the report was not sent when the token is unset', async () => {
        const server = await startServer(created);
        const { TESTPULSE_TOKEN: unset, ...env } = baseEnv(server.url);
        void unset;

        const outcome = await entry.run(junitArgs, withSummary(env));

        expect(outcome.code).toBe(0);
        expect(summary()).toBe(
          '- testpulse: report `android/shared/jvm` not sent: TESTPULSE_TOKEN or TESTPULSE_URL ' +
            'is not set (fork PR or missing secret).\n',
        );
        expect(server.requests).toHaveLength(0);
      });

      it('says the report was not sent when a run variable is missing', async () => {
        const server = await startServer(created);
        const env = withSummary(baseEnv(server.url));
        delete env.GITHUB_SHA;

        const outcome = await entry.run(junitArgs, env);

        expect(outcome.code).toBe(0);
        expect(summary()).toBe(
          '- testpulse: report `android/shared/jvm` not sent: missing GITHUB_SHA.\n',
        );
      });

      it('says the report was not sent when an argument is missing', async () => {
        const server = await startServer(created);

        const outcome = await entry.run(junitArgs.slice(0, 4), withSummary(baseEnv(server.url)));

        expect(outcome.code).toBe(0);
        expect(summary()).toBe(
          '- testpulse: report `android/shared/jvm` not sent: job, module, platform, format and ' +
            'results are all required.\n',
        );
      });

      it('still exits 0 and prints nothing extra when the summary cannot be written', async () => {
        const server = await startServer(() => ({ status: 401, body: 'no' }));
        const env = withSummary(baseEnv(server.url));
        // A directory where the summary file should be: the append fails.
        env.GITHUB_STEP_SUMMARY = dir;

        const outcome = await entry.run(junitArgs, env);

        expect(outcome).toEqual({
          code: 0,
          stdout: '::warning::testpulse report failed (HTTP 401): no\n',
          stderr: '',
        });
      });
    });

    it('never prints the token, whatever the server answers', async () => {
      for (const reply of [created, (): Reply => ({ status: 401, body: 'refused' })]) {
        const server = await startServer(reply);

        const outcome = await entry.run(junitArgs, baseEnv(server.url));

        expect(outcome.stdout + outcome.stderr).not.toContain(token);
      }
    });
  },
);

describe('the reporter source', () => {
  it('bounds each attempt with --max-time and retries twice', () => {
    const script = readFileSync(scriptPath, 'utf8');
    expect(script).toMatch(/--max-time \d+/);
    expect(script).toContain('--retry 2');
  });

  it('writes the response to a private temporary file rather than a fixed path', () => {
    const script = readFileSync(scriptPath, 'utf8');
    expect(script).not.toContain('/tmp/testpulse.out');
    expect(script).toMatch(/out=\$\(mktemp /);
    expect(script).toContain(`trap 'rm -f "$out"' EXIT`);
  });

  it('is the script documented in spec Appendix A, byte for byte', () => {
    const spec = readFileSync(fileURLToPath(new URL('../docs/spec.md', import.meta.url)), 'utf8');
    const appendix = spec.slice(spec.indexOf('## Appendix A'));
    const block = /```bash\n([\s\S]*?)```/.exec(appendix);
    expect(block, 'no bash block found in Appendix A').not.toBeNull();
    expect(block?.[1]).toBe(readFileSync(scriptPath, 'utf8'));
  });

  it('is what the action runs, with its inputs as the arguments in order, url and token', () => {
    expect(Object.keys(action.inputs)).toEqual([...POSITIONAL_INPUTS, 'url', 'token']);
    expect(actionStep.run).toContain('bash "$GITHUB_ACTION_PATH/testpulse-report.sh"');
  });

  // An expression in `run` is spliced into the script before bash reads it, so an input holding
  // shell syntax would run; through env it stays a value.
  it('gives the action step its inputs only through env, never inside run', () => {
    expect(actionStep.run).not.toContain('${{');
  });

  it('is copied byte for byte to scripts/testpulse-report.sh, for repos that copy the script', () => {
    expect(readFileSync(copiedScriptPath).equals(readFileSync(scriptPath))).toBe(true);
  });
});
