// The form a cached public read is stored in (decision 2026-11-17). Next.js keeps an
// unstable_cache value as JSON and returns JSON.parse of it on a hit but the value itself on a
// miss, so a Date would be a Date on one request and a string on the next. Every cached read is
// encoded here inside the cache and decoded outside it, so a hit and a miss give the same value.
// Dates become {"$date": iso}; a key of the value's own that starts with $ gains another, so no
// row text can pass for a Date. Anything JSON would change silently is refused instead.

export type Json =
  null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

declare const encoded: unique symbol;

/** A value of type T in its cached form. */
export interface CacheJson<T> {
  readonly json: Json;
  readonly [encoded]?: T;
}

const DATE_TAG = '$date';

const escapeKey = (key: string) => (key.startsWith('$') ? `$${key}` : key);

function encode(value: unknown, path: string): Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`cannot cache ${path}: ${String(value)}`);
    return value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`cannot cache ${path}: an invalid Date`);
    return { [DATE_TAG]: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown, index) => {
      const at = `${path}[${String(index)}]`;
      if (item === undefined) throw new Error(`cannot cache ${at}: undefined`);
      return encode(item, at);
    });
  }
  if (typeof value === 'object') {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`cannot cache ${path}: a ${value.constructor.name}`);
    }
    const out: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[escapeKey(key)] = encode(item, `${path}.${key}`);
    }
    return out;
  }
  throw new Error(`cannot cache ${path}: a ${typeof value}`);
}

function decode(json: Json): unknown {
  if (json === null || typeof json !== 'object') return json;
  if (Array.isArray(json)) return json.map(decode);
  const entries = Object.entries(json);
  const [only] = entries;
  if (entries.length === 1 && only?.[0] === DATE_TAG && typeof only[1] === 'string') {
    return new Date(only[1]);
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    if (key.startsWith('$$')) out[key.slice(1)] = decode(item);
    else if (key.startsWith('$')) throw new Error(`not a cached value: unexpected key ${key}`);
    else out[key] = decode(item);
  }
  return out;
}

export function toCacheJson<T>(value: T): CacheJson<T> {
  return { json: encode(value, 'value') };
}

export function fromCacheJson<T>(cached: CacheJson<T>): T {
  // The one cast: what comes back is what toCacheJson<T> stored, walked back by decode.
  return decode(cached.json) as T;
}
