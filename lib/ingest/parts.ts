// Spec section 6.5: 4 MB per request, under Vercel's 4.5 MB function body limit.
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

// Spec section 6.2, in the order the error messages list them.
export const PART_NAMES = ['meta', 'junit', 'jest', 'jacoco', 'istanbul'] as const;
export type PartName = (typeof PART_NAMES)[number];

export type ResultsPart =
  | { readonly format: 'junit'; readonly files: readonly string[] }
  | { readonly format: 'jest'; readonly file: string };

export interface ReportParts {
  /** The meta part decoded from JSON; ReportMetaSchema validates it. */
  readonly meta: unknown;
  readonly results: ResultsPart;
  readonly jacoco?: string;
  readonly istanbul?: string;
}

/**
 * A request whose multipart body is refused; `part` is what the error body names and `status`
 * is 400 for a wrong shape or 413 when the parts read exceed the size limit (spec 6.3).
 */
export class PartsError extends Error {
  readonly part: string;
  readonly status: 400 | 413;

  constructor(part: string, message: string, status: 400 | 413 = 400) {
    super(message);
    this.name = 'PartsError';
    this.part = part;
    this.status = status;
  }
}

const isPartName = (name: string): name is PartName =>
  (PART_NAMES as readonly string[]).includes(name);

// A part name is the client's to choose, and it is reflected in the error body.
const MAX_REFLECTED_NAME_LENGTH = 100;
const reflectedName = (name: string): string =>
  name === '' ? '(unnamed)' : name.slice(0, MAX_REFLECTED_NAME_LENGTH);

// curl sends `-F meta=...` as a plain field and `-F junit=@file` as a file; both are accepted
// for every part so a client is never wrong about which to use.
const sizeOf = (value: FormDataEntryValue): number =>
  typeof value === 'string' ? new Blob([value]).size : value.size;

const textOf = (value: FormDataEntryValue): Promise<string> =>
  typeof value === 'string' ? Promise.resolve(value) : value.text();

function decodeMeta(texts: readonly string[]): unknown {
  const [text, ...extra] = texts;
  if (text === undefined) {
    throw new PartsError('meta', 'meta part is required');
  }
  if (extra.length > 0) {
    throw new PartsError('meta', 'meta must be sent once');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PartsError('meta', `meta is not valid JSON: ${reason}`);
  }
}

function chooseResults(junit: readonly string[], jest: readonly string[]): ResultsPart {
  if (junit.length > 0 && jest.length > 0) {
    throw new PartsError(
      'junit',
      'junit and jest were both sent; a report has exactly one results format',
    );
  }
  if (jest.length > 1) {
    throw new PartsError('jest', `jest accepts exactly one file; ${jest.length} were sent`);
  }
  const [jestFile] = jest;
  if (jestFile !== undefined) {
    return { format: 'jest', file: jestFile };
  }
  if (junit.length === 0) {
    throw new PartsError('junit', 'one of junit or jest is required');
  }
  return { format: 'junit', files: junit };
}

function atMostOne(part: 'jacoco' | 'istanbul', texts: readonly string[]): string | undefined {
  if (texts.length > 1) {
    throw new PartsError(part, `${part} accepts at most one file; ${texts.length} were sent`);
  }
  return texts[0];
}

/**
 * Checks the multipart shape of a report request (spec 6.2) and reads every part into memory,
 * refusing the request as soon as the parts seen so far exceed the size limit. Pure apart from
 * reading the already-received body: nothing here touches the network or the database.
 */
export async function readParts(formData: FormData): Promise<ReportParts> {
  const texts: Record<PartName, string[]> = {
    meta: [],
    junit: [],
    jest: [],
    jacoco: [],
    istanbul: [],
  };
  let bytes = 0;

  for (const [name, value] of formData.entries()) {
    if (!isPartName(name)) {
      const shown = reflectedName(name);
      throw new PartsError(shown, `unknown part "${shown}"; expected ${PART_NAMES.join(', ')}`);
    }
    const size = sizeOf(value);
    bytes += size;
    if (bytes > MAX_BODY_BYTES) {
      throw new PartsError(
        name,
        `part "${name}" is ${size} bytes, which takes the request over the ` +
          `${MAX_BODY_BYTES} byte limit`,
        413,
      );
    }
    texts[name].push(await textOf(value));
  }

  const parts: { -readonly [K in keyof ReportParts]: ReportParts[K] } = {
    meta: decodeMeta(texts.meta),
    results: chooseResults(texts.junit, texts.jest),
  };
  const jacoco = atMostOne('jacoco', texts.jacoco);
  if (jacoco !== undefined) parts.jacoco = jacoco;
  const istanbul = atMostOne('istanbul', texts.istanbul);
  if (istanbul !== undefined) parts.istanbul = istanbul;
  return parts;
}
