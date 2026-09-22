import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MAX_BODY_BYTES, PartsError, readParts } from './parts';

const fixturesDir = fileURLToPath(new URL('../../fixtures/', import.meta.url));
const readFixture = (relativePath: string): string =>
  readFileSync(`${fixturesDir}${relativePath}`, 'utf8');

const gradle = readFixture(
  'ostomate2/junit/jvm/shared/TEST-com.ostomate.app.data.RepositoryTest.xml',
);
const jacoco = readFixture('ostomate2/jacoco/shared.xml');
const jest = readFixture('routeserve/jest/shared.json');
const istanbul = readFixture('routeserve/istanbul/shared.json');

const meta = { ci_run_id: '1', job: 'android', module: 'shared', platform: 'jvm' };

type Entry = [name: string, value: string | Blob, filename?: string];

const form = (...entries: Entry[]): FormData => {
  const data = new FormData();
  for (const [name, value, filename] of entries) {
    if (typeof value === 'string') data.append(name, value);
    else data.append(name, value, filename ?? `${name}.file`);
  }
  return data;
};

const file = (text: string, type = 'application/octet-stream'): Blob => new Blob([text], { type });

async function rejection(data: FormData): Promise<PartsError> {
  try {
    await readParts(data);
  } catch (error) {
    if (error instanceof PartsError) return error;
    throw error;
  }
  throw new Error('expected readParts to reject');
}

describe('readParts (spec section 6.2)', () => {
  it('reads meta as a string part with repeated junit files and a jacoco report', async () => {
    const parts = await readParts(
      form(
        ['meta', JSON.stringify(meta)],
        ['junit', file(gradle, 'application/xml'), 'TEST-a.xml'],
        ['junit', file(gradle, 'application/xml'), 'TEST-b.xml'],
        ['jacoco', file(jacoco, 'application/xml'), 'jacocoHostTestReport.xml'],
      ),
    );

    expect(parts).toEqual({
      meta,
      results: { format: 'junit', files: [gradle, gradle] },
      jacoco,
    });
  });

  it('reads meta uploaded as a file, one jest file and an istanbul summary', async () => {
    const parts = await readParts(
      form(
        ['meta', file(JSON.stringify(meta), 'application/json'), 'meta.json'],
        ['jest', file(jest, 'application/json'), 'test-results.json'],
        ['istanbul', file(istanbul, 'application/json'), 'coverage-summary.json'],
      ),
    );

    expect(parts).toEqual({ meta, results: { format: 'jest', file: jest }, istanbul });
  });

  it('accepts a results file sent as a plain field value', async () => {
    const parts = await readParts(form(['meta', JSON.stringify(meta)], ['junit', gradle]));
    expect(parts.results).toEqual({ format: 'junit', files: [gradle] });
  });

  it('rejects a request without meta', async () => {
    const error = await rejection(form(['junit', file(gradle)]));
    expect(error.part).toBe('meta');
    expect(error.message).toMatch(/meta.*required/);
  });

  it('rejects meta sent twice', async () => {
    const error = await rejection(
      form(['meta', JSON.stringify(meta)], ['meta', JSON.stringify(meta)], ['junit', file(gradle)]),
    );
    expect(error.part).toBe('meta');
    expect(error.message).toMatch(/once/);
  });

  it('rejects meta that is not JSON, quoting the JSON error', async () => {
    const error = await rejection(form(['meta', '{"ci_run_id": '], ['junit', file(gradle)]));
    expect(error.part).toBe('meta');
    expect(error.message).toMatch(/not valid JSON/);
  });

  it('rejects a request with no results part, naming both accepted formats', async () => {
    const error = await rejection(form(['meta', JSON.stringify(meta)], ['jacoco', file(jacoco)]));
    expect(error.part).toBe('junit');
    expect(error.message).toMatch(/junit/);
    expect(error.message).toMatch(/jest/);
  });

  it('rejects junit and jest in the same request, naming both', async () => {
    const error = await rejection(
      form(['meta', JSON.stringify(meta)], ['junit', file(gradle)], ['jest', file(jest)]),
    );
    expect(error.part).toBe('junit');
    expect(error.message).toMatch(/junit/);
    expect(error.message).toMatch(/jest/);
    expect(error.message).toMatch(/both/);
  });

  it('rejects more than one jest file', async () => {
    const error = await rejection(
      form(['meta', JSON.stringify(meta)], ['jest', file(jest)], ['jest', file(jest)]),
    );
    expect(error.part).toBe('jest');
    expect(error.message).toMatch(/exactly one.*2 were sent/);
  });

  it.each(['jacoco', 'istanbul'])('rejects more than one %s file', async (part) => {
    const error = await rejection(
      form(
        ['meta', JSON.stringify(meta)],
        ['junit', file(gradle)],
        [part, file('a')],
        [part, file('b')],
      ),
    );
    expect(error.part).toBe(part);
    expect(error.message).toMatch(/at most one.*2 were sent/);
  });

  it('rejects an unknown part by name and lists the accepted ones', async () => {
    const error = await rejection(
      form(['meta', JSON.stringify(meta)], ['junit', file(gradle)], ['coverage', file(jacoco)]),
    );
    expect(error.part).toBe('coverage');
    expect(error.message).toMatch(/unknown part "coverage"/);
    expect(error.message).toMatch(/meta, junit, jest, jacoco, istanbul/);
  });

  it('truncates a reflected unknown part name to 100 characters', async () => {
    const long = 'x'.repeat(500);
    const error = await rejection(
      form(['meta', JSON.stringify(meta)], ['junit', file(gradle)], [long, file('y')]),
    );
    expect(error.part).toBe('x'.repeat(100));
    expect(error.message).toContain(`unknown part "${'x'.repeat(100)}"`);
    expect(error.message).not.toContain('x'.repeat(101));
    expect(error.status).toBe(400);
  });

  it('renders an empty part name as (unnamed)', async () => {
    const error = await rejection(
      form(['meta', JSON.stringify(meta)], ['junit', file(gradle)], ['', file('y')]),
    );
    expect(error.part).toBe('(unnamed)');
    expect(error.message).toContain('unknown part "(unnamed)"');
  });

  it('gives multipart shape errors status 400', async () => {
    const error = await rejection(form(['junit', file(gradle)]));
    expect(error.status).toBe(400);
  });

  it('rejects a single file over the request limit before reading it, with status 413', async () => {
    const oversized = new Blob([new Uint8Array(MAX_BODY_BYTES + 1)]);
    const error = await rejection(
      form(['meta', JSON.stringify(meta)], ['junit', oversized, 'huge.xml']),
    );
    expect(error.part).toBe('junit');
    expect(error.status).toBe(413);
    expect(error.message).toMatch(new RegExp(`${MAX_BODY_BYTES + 1}.*bytes`));
  });

  it('rejects parts whose combined size exceeds the limit, naming the part that crossed it', async () => {
    const half = new Blob([new Uint8Array(MAX_BODY_BYTES / 2 + 1)]);
    const error = await rejection(
      form(['meta', JSON.stringify(meta)], ['junit', half, 'a.xml'], ['jacoco', half, 'b.xml']),
    );
    expect(error.part).toBe('jacoco');
    expect(error.status).toBe(413);
    expect(error.message).toMatch(/bytes/);
  });
});
