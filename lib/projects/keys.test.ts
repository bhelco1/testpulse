import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  API_KEY_PATTERN,
  API_KEY_PREFIX,
  describeIssuedKey,
  generateApiKey,
  hashApiKey,
} from './keys.ts';

const BYTES_A = Uint8Array.from({ length: 32 }, (_, index) => index);
const BYTES_B = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);

// 32 bytes in base64url without padding is 43 characters (spec section 15).
const ENCODED_LENGTH = 43;
const KEY_PATTERN = /^tp_[A-Za-z0-9_-]{43}$/;

describe('generateApiKey (spec section 15)', () => {
  it('is deterministic for fixed bytes and presents tp_ + base64url without padding', () => {
    const first = generateApiKey(BYTES_A);
    const second = generateApiKey(BYTES_A);

    expect(first).toEqual(second);
    expect(first.key).toMatch(KEY_PATTERN);
    expect(first.key).toHaveLength(API_KEY_PREFIX.length + ENCODED_LENGTH);
    expect(first.key).toBe(`${API_KEY_PREFIX}${Buffer.from(BYTES_A).toString('base64url')}`);
  });

  it('stores the hex SHA-256 of the full presented key', () => {
    const { key, hash } = generateApiKey(BYTES_A);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash('sha256').update(key).digest('hex'));
    expect(hash).toBe(hashApiKey(key));
  });

  it('gives different bytes different keys and hashes', () => {
    const a = generateApiKey(BYTES_A);
    const b = generateApiKey(BYTES_B);

    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it('draws fresh random bytes when none are given', () => {
    const a = generateApiKey();
    const b = generateApiKey();

    expect(a.key).toMatch(KEY_PATTERN);
    expect(a.key).not.toBe(b.key);
  });

  it('refuses anything but 32 bytes', () => {
    expect(() => generateApiKey(new Uint8Array(16))).toThrow(/32 bytes/);
    expect(() => generateApiKey(new Uint8Array(33))).toThrow(/32 bytes/);
  });
});

describe('API_KEY_PATTERN', () => {
  it('matches every issued key and nothing shorter, longer, or outside base64url', () => {
    expect(API_KEY_PATTERN.test(generateApiKey(BYTES_A).key)).toBe(true);
    expect(API_KEY_PATTERN.test(generateApiKey().key)).toBe(true);
    const body = 'A'.repeat(ENCODED_LENGTH);
    expect(API_KEY_PATTERN.test(`tp_${body}`)).toBe(true);
    for (const wrong of [
      body,
      `tp_${body.slice(1)}`,
      `tp_${body}A`,
      `tp_${body.slice(1)}+`,
      `tp_${body.slice(1)}=`,
      `TP_${body}`,
      ` tp_${body}`,
      `tp_${body}\n`,
    ]) {
      expect(API_KEY_PATTERN.test(wrong), JSON.stringify(wrong)).toBe(false);
    }
  });
});

describe('describeIssuedKey', () => {
  it('prints the key once with a warning that it will not be shown again', () => {
    const { key } = generateApiKey(BYTES_A);
    const text = describeIssuedKey('example', key);

    expect(text.split(key)).toHaveLength(2);
    expect(text).toContain('example');
    expect(text).toContain('TESTPULSE_TOKEN');
    expect(text).toMatch(/not be shown again/i);
    expect(text).toContain('project:rotate-key');
  });
});
