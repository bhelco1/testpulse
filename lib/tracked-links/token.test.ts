import { describe, expect, it } from 'vitest';

import { generateToken, TOKEN_ALPHABET, TOKEN_LENGTH, TOKEN_PATTERN, tokenSymbol } from './token';

// Spec sections 5.10 and 14, Phase 6 criterion 3: a tracked link is an opaque 12-character
// random token (the column's check constraint is char_length = 12).

describe('the token alphabet', () => {
  it('is the 62 ASCII letters and digits, each once, which need no escaping in a URL', () => {
    expect(TOKEN_ALPHABET).toHaveLength(62);
    expect(new Set(TOKEN_ALPHABET).size).toBe(62);
    expect(TOKEN_ALPHABET).toMatch(/^[A-Za-z0-9]+$/);
    expect(encodeURIComponent(TOKEN_ALPHABET)).toBe(TOKEN_ALPHABET);
  });
});

describe('tokenSymbol', () => {
  it('maps the bytes 0 to 247 onto each symbol exactly 4 times, so no symbol is favoured', () => {
    const counts = new Map<string, number>();
    for (let byte = 0; byte < 248; byte += 1) {
      const symbol = tokenSymbol(byte);
      expect(symbol).not.toBeNull();
      counts.set(symbol ?? '', (counts.get(symbol ?? '') ?? 0) + 1);
    }
    expect(counts.size).toBe(62);
    expect([...counts.values()].every((count) => count === 4)).toBe(true);
  });

  it('rejects the bytes 248 to 255, which a plain modulo would give to the first 8 symbols', () => {
    for (let byte = 248; byte < 256; byte += 1) {
      expect(tokenSymbol(byte)).toBeNull();
    }
  });
});

describe('generateToken', () => {
  it('draws from the CSPRNG by default: 12 characters of the alphabet, different each time', () => {
    const tokens = Array.from({ length: 200 }, () => generateToken());
    for (const token of tokens) {
      expect(token).toHaveLength(TOKEN_LENGTH);
      expect(token).toMatch(TOKEN_PATTERN);
    }
    expect(new Set(tokens).size).toBe(200);
  });

  it('skips rejected bytes and draws again until it has 12 symbols', () => {
    const draws: number[] = [];
    // First draw: 12 bytes of which 8 are rejected; second: enough to finish.
    const scripted = [
      [255, 0, 248, 1, 249, 61, 250, 62, 251, 247, 252, 253],
      [254, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    ];
    const token = generateToken((size) => {
      draws.push(size);
      return Buffer.from(scripted[draws.length - 1] ?? []);
    });
    // 0, 1, 61, 62, 247 then 2 to 8 from the second draw.
    const expected = [0, 1, 61, 62, 247, 2, 3, 4, 5, 6, 7, 8]
      .map((byte) => TOKEN_ALPHABET[byte % 62])
      .join('');
    expect(token).toBe(expected);
    expect(draws).toEqual([12, 12]);
  });

  it('refuses a source that keeps returning nothing usable', () => {
    expect(() => generateToken((size) => Buffer.alloc(size, 255))).toThrow(/random/);
  });
});
