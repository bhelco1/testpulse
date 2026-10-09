import { randomBytes } from 'node:crypto';

// Spec sections 5.10 and 14: a tracked link is an opaque 12-character random token. Letters and
// digits only, so a token needs no escaping in a URL, survives a double-click selection whole,
// and reads like the design's samples ("Qm8r2LxT0aZe"). 12 symbols of 62 carry about 71 bits.

export const TOKEN_LENGTH = 12;
export const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const TOKEN_PATTERN = /^[A-Za-z0-9]{12}$/;

// 256 is not a multiple of 62, so `byte % 62` would give the first 8 symbols one more byte each
// (5 against 4). Bytes from 248, the largest multiple of 62 under 256, are rejected instead,
// which leaves every symbol exactly 4 bytes.
const ACCEPT_BELOW = 256 - (256 % TOKEN_ALPHABET.length);

// Each draw keeps 248/256 of its bytes, so failing to fill a token in this many draws means the
// source is broken, not unlucky.
const MAX_DRAWS = 100;

export type RandomSource = (size: number) => Uint8Array;

/** The symbol for one random byte, or null for a byte that must be rejected. */
export function tokenSymbol(byte: number): string | null {
  return byte < ACCEPT_BELOW ? (TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length] ?? null) : null;
}

/** A new token from the CSPRNG; the source is a parameter so the method is testable. */
export function generateToken(random: RandomSource = randomBytes): string {
  let token = '';
  for (let draw = 0; draw < MAX_DRAWS; draw += 1) {
    for (const byte of random(TOKEN_LENGTH)) {
      const symbol = tokenSymbol(byte);
      if (symbol !== null) token += symbol;
      if (token.length === TOKEN_LENGTH) return token;
    }
  }
  throw new Error('the random source gave too few usable bytes for a token');
}
