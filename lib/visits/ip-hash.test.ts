import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  clientIpFromHeaders,
  hashClientIp,
  IP_HASH_SALT_MIN_LENGTH,
  IP_HASH_SALT_VAR,
  normalizeIp,
  readIpHashSalt,
} from './ip-hash';

// Spec sections 5.10, 14 and 15, Phase 6 criterion 5: visitors are counted by a salted hash of
// the address, and no raw address is stored anywhere. Addresses are from the documentation
// ranges (RFC 5737 for IPv4, RFC 3849 for IPv6), so none of them is anyone's.

const SALT = 'k3Jq9vXr0Lw8Zp2Hs6Tn4Bf1Mc7Gd5Ya';

describe('hashClientIp', () => {
  it('is HMAC-SHA-256 of the normalized address keyed by the salt, as 64 hex characters', () => {
    const expected = createHmac('sha256', SALT).update('192.0.2.10', 'utf8').digest('hex');
    expect(hashClientIp('192.0.2.10', SALT)).toBe(expected);
    expect(hashClientIp('192.0.2.10', SALT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never contains the address it was given', () => {
    const hash = hashClientIp('192.0.2.10', SALT);
    expect(hash).not.toContain('192.0.2.10');
    expect(hash).not.toContain('c000020a');
  });

  it('gives the same client the same hash, and a different client or salt a different one', () => {
    expect(hashClientIp('192.0.2.10', SALT)).toBe(hashClientIp('192.0.2.10', SALT));
    expect(hashClientIp('192.0.2.11', SALT)).not.toBe(hashClientIp('192.0.2.10', SALT));
    expect(hashClientIp('192.0.2.10', `${SALT}x`)).not.toBe(hashClientIp('192.0.2.10', SALT));
  });

  it('hashes an IPv4-mapped IPv6 address as the IPv4 address it carries', () => {
    const v4 = hashClientIp('192.0.2.10', SALT);
    expect(hashClientIp('::ffff:192.0.2.10', SALT)).toBe(v4);
    expect(hashClientIp('::FFFF:192.0.2.10', SALT)).toBe(v4);
    expect(hashClientIp('::ffff:c000:20a', SALT)).toBe(v4);
    expect(hashClientIp('0:0:0:0:0:ffff:c000:020a', SALT)).toBe(v4);
  });

  it('hashes every spelling of one IPv6 address alike', () => {
    const short = hashClientIp('2001:db8::1', SALT);
    expect(hashClientIp('2001:DB8::1', SALT)).toBe(short);
    expect(hashClientIp('2001:0db8:0000:0000:0000:0000:0000:0001', SALT)).toBe(short);
    expect(hashClientIp('2001:db8:0:0::1', SALT)).toBe(short);
  });

  it.each([undefined, null, '', '   '])('refuses a missing or blank salt (%j)', (salt) => {
    expect(() => hashClientIp('192.0.2.10', salt as unknown as string)).toThrow(IP_HASH_SALT_VAR);
  });

  it('refuses a salt shorter than the minimum', () => {
    expect(() => hashClientIp('192.0.2.10', 'a'.repeat(IP_HASH_SALT_MIN_LENGTH - 1))).toThrow(
      `at least ${String(IP_HASH_SALT_MIN_LENGTH)} characters`,
    );
    expect(hashClientIp('192.0.2.10', 'a'.repeat(IP_HASH_SALT_MIN_LENGTH))).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('refuses a malformed address without repeating it', () => {
    let message = '';
    try {
      hashClientIp('192.0.2.999', SALT);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/not an IP address/);
    expect(message).not.toContain('192.0.2.999');
  });
});

describe('normalizeIp', () => {
  it.each([
    ['192.0.2.10', '192.0.2.10'],
    [' 192.0.2.10 ', '192.0.2.10'],
    ['::ffff:192.0.2.10', '192.0.2.10'],
    ['::ffff:c000:20a', '192.0.2.10'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:db8::1', '2001:db8::1'],
    ['::1', '::1'],
  ])('reads %j as %j', (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });

  it.each([
    '',
    'not-an-ip',
    '192.0.2',
    '192.0.2.256',
    '192.0.2.010',
    '192.0.2.10:443',
    '[2001:db8::1]',
    '[2001:db8::1]:443',
    '2001:db8::1::2',
    'fe80::1%eth0',
    '192.0.2.10, 198.51.100.7',
    'unknown',
  ])('refuses %j', (input) => {
    expect(normalizeIp(input)).toBeNull();
  });
});

describe('clientIpFromHeaders', () => {
  const headers = (entries: Record<string, string>): Headers => new Headers(entries);

  // Vercel, "Request headers" (https://vercel.com/docs/headers/request-headers): x-forwarded-for
  // is "the public IP address of the client", which Vercel overwrites and does not forward from
  // an outside proxy; x-vercel-forwarded-for is identical but cannot be overwritten by a proxy in
  // front of Vercel; x-real-ip is identical too.
  it('reads x-vercel-forwarded-for first', () => {
    expect(
      clientIpFromHeaders(
        headers({
          'x-vercel-forwarded-for': '192.0.2.10',
          'x-forwarded-for': '198.51.100.7',
          'x-real-ip': '203.0.113.5',
        }),
      ),
    ).toBe('192.0.2.10');
  });

  it('falls back to x-forwarded-for, then x-real-ip, when the earlier header is absent', () => {
    expect(
      clientIpFromHeaders(
        headers({ 'x-forwarded-for': '198.51.100.7', 'x-real-ip': '203.0.113.5' }),
      ),
    ).toBe('198.51.100.7');
    expect(clientIpFromHeaders(headers({ 'x-real-ip': '203.0.113.5' }))).toBe('203.0.113.5');
  });

  it('normalizes what it reads', () => {
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '::ffff:192.0.2.10' }))).toBe(
      '192.0.2.10',
    );
    expect(clientIpFromHeaders(headers({ 'x-real-ip': '2001:DB8:0:0::1' }))).toBe('2001:db8::1');
  });

  it('refuses a malformed value rather than trying a later header', () => {
    // Vercel sets all three to the same address, so a bad first one means the request did not
    // come through Vercel as documented; a later header is no more trustworthy.
    expect(
      clientIpFromHeaders(
        headers({ 'x-vercel-forwarded-for': 'garbage', 'x-forwarded-for': '198.51.100.7' }),
      ),
    ).toBeNull();
  });

  it('refuses a list of addresses, which Vercel never sends', () => {
    expect(
      clientIpFromHeaders(headers({ 'x-forwarded-for': '192.0.2.10, 198.51.100.7' })),
    ).toBeNull();
  });

  it('answers null when no header is present or the value is blank', () => {
    expect(clientIpFromHeaders(headers({}))).toBeNull();
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '   ' }))).toBeNull();
  });

  it('ignores headers that are not Vercel’s', () => {
    expect(clientIpFromHeaders(headers({ forwarded: 'for=192.0.2.10' }))).toBeNull();
    expect(clientIpFromHeaders(headers({ 'cf-connecting-ip': '192.0.2.10' }))).toBeNull();
  });
});

describe('readIpHashSalt', () => {
  it('reads IP_HASH_SALT from the environment given', () => {
    expect(IP_HASH_SALT_VAR).toBe('IP_HASH_SALT');
    expect(readIpHashSalt({ IP_HASH_SALT: SALT })).toBe(SALT);
  });

  it.each([{}, { IP_HASH_SALT: '' }, { IP_HASH_SALT: '  ' }])(
    'refuses a missing or blank value (%j), naming the variable only',
    (env) => {
      expect(() => readIpHashSalt(env)).toThrow(/IP_HASH_SALT/);
    },
  );

  it('refuses a short value without printing it', () => {
    let message = '';
    try {
      readIpHashSalt({ IP_HASH_SALT: 'short-secret' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/at least/);
    expect(message).not.toContain('short-secret');
  });
});
