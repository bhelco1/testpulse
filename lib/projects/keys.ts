import { createHash, randomBytes } from 'node:crypto';

// Spec section 15: 32 random bytes, shown once, stored as a SHA-256 hash. The prefix makes a
// leaked key recognisable in logs and secret scanners without saying anything about its bytes.
export const API_KEY_PREFIX = 'tp_';
const API_KEY_BYTES = 32;
// 32 bytes in base64url without padding is 43 characters; nothing else was ever issued.
export const API_KEY_PATTERN = /^tp_[A-Za-z0-9_-]{43}$/;

export interface GeneratedApiKey {
  /** The key as presented to the operator exactly once. */
  readonly key: string;
  /** Hex SHA-256 of `key`; the only form the database ever holds. */
  readonly hash: string;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * Takes the random bytes as an argument so the encoding is testable with fixed input; the
 * default draws them from the CSPRNG.
 */
export function generateApiKey(bytes: Uint8Array = randomBytes(API_KEY_BYTES)): GeneratedApiKey {
  if (bytes.length !== API_KEY_BYTES) {
    throw new Error(`an API key needs exactly ${API_KEY_BYTES} bytes, got ${bytes.length}`);
  }
  const key = `${API_KEY_PREFIX}${Buffer.from(bytes).toString('base64url')}`;
  return { key, hash: hashApiKey(key) };
}

/** The one place a key is ever written out; both issuing scripts print exactly this. */
export function describeIssuedKey(slug: string, key: string): string {
  return [
    `API key for "${slug}" (add it to that repo's CI secrets as TESTPULSE_TOKEN):`,
    '',
    `  ${key}`,
    '',
    'This key is stored only as a hash and will not be shown again.',
    `If it is lost, issue a new one with: npm run project:rotate-key ${slug}`,
  ].join('\n');
}
