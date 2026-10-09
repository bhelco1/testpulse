import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

// Spec sections 5.10, 14 and 15: a visit stores a salted hash of the client's address, used only
// to count distinct visitors per link, and never the address itself. Pure: the salt and headers
// are passed in. Nothing here logs, and no error message repeats an address or the salt.

export const IP_HASH_SALT_VAR = 'IP_HASH_SALT';

/**
 * The whole IPv4 space is 2^32 addresses, so a hash is only as private as its salt is secret and
 * unguessable: 32 characters is at least 192 bits from `openssl rand -base64 32` (44 characters).
 */
export const IP_HASH_SALT_MIN_LENGTH = 32;

type Env = Readonly<Record<string, string | undefined>>;

function checkSalt(salt: string | null | undefined): string {
  if (typeof salt !== 'string' || salt.trim() === '') {
    throw new Error(`${IP_HASH_SALT_VAR} is not set; refusing to hash an address without it`);
  }
  if (salt.length < IP_HASH_SALT_MIN_LENGTH) {
    throw new Error(
      `${IP_HASH_SALT_VAR} must be at least ${String(IP_HASH_SALT_MIN_LENGTH)} characters`,
    );
  }
  return salt;
}

/** The salt from the environment, refused when missing, blank or short. */
export function readIpHashSalt(env: Env = process.env): string {
  return checkSalt(env[IP_HASH_SALT_VAR]);
}

const MAPPED_V4 = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

/**
 * One spelling per address, so one client always hashes alike: IPv4 as Node reads it (no leading
 * zeros, no port), IPv6 in the WHATWG URL serializer's compressed lower-case form (RFC 5952), and
 * an IPv4-mapped IPv6 address (::ffff:a.b.c.d, as a dual-stack server reports an IPv4 client) as
 * the IPv4 address it carries. Anything else, including a zone ID, brackets, a port or a list,
 * is null.
 */
export function normalizeIp(value: string): string | null {
  const candidate = value.trim();
  const family = isIP(candidate);
  if (family === 4) return candidate;
  if (family !== 6 || candidate.includes('%')) return null;

  const host = new URL(`http://[${candidate}]/`).hostname.slice(1, -1);
  const mapped = MAPPED_V4.exec(host);
  if (mapped === null) return host;
  const [high, low] = [mapped[1], mapped[2]].map((part) => Number.parseInt(part ?? '', 16));
  return [(high ?? 0) >> 8, (high ?? 0) & 255, (low ?? 0) >> 8, (low ?? 0) & 255].join('.');
}

/**
 * HMAC-SHA-256 of the normalized address, keyed by the salt, as hex. The salt is one secret for
 * every visit (it must be, or the same visitor would not hash alike), which makes it a key, and
 * HMAC is the construction made for a keyed hash; a bare SHA-256 of salt and address joined
 * together depends on how they are joined and is open to length extension.
 */
export function hashClientIp(ip: string, salt: string): string {
  const key = checkSalt(salt);
  const normalized = normalizeIp(ip);
  if (normalized === null) throw new Error('refusing to hash a value that is not an IP address');
  return createHmac('sha256', key).update(normalized, 'utf8').digest('hex');
}

// Vercel, "Request headers" (https://vercel.com/docs/headers/request-headers): x-forwarded-for
// is "the public IP address of the client"; Vercel overwrites it and does not forward an outside
// proxy's value, to prevent spoofing. x-vercel-forwarded-for is identical but is not overwritten
// by a proxy placed in front of Vercel, so it is read first; x-real-ip is identical too.
const CLIENT_IP_HEADERS = ['x-vercel-forwarded-for', 'x-forwarded-for', 'x-real-ip'] as const;

/**
 * The client's address as Vercel reports it, normalized, or null. The first of Vercel's headers
 * that is present decides: a malformed or listed value there is refused rather than passed over
 * for a later header, because Vercel sets all three to one address.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  for (const name of CLIENT_IP_HEADERS) {
    const value = headers.get(name);
    if (value === null) continue;
    return normalizeIp(value);
  }
  return null;
}
