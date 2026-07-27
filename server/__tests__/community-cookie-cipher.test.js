import { describe, expect, it } from 'vitest';
import {
  encrypt,
  decrypt,
  roundTrip,
  deriveKey,
  toKeyBuffer,
  createCookieCipher,
} from '../infrastructure/netease/CookieCipher.js';

const KEY = deriveKey('community-secret-passphrase', 'fixed-salt-for-tests');

describe('community cookie cipher', () => {
  it('roundTrip_recoversOriginalCookie', () => {
    const cookie = 'MUSIC_U=abcdef12345; __csrf=xyz;';
    expect(roundTrip(cookie, KEY)).toBe(cookie);
  });

  it('encrypt_producesV1PrefixedFormat', () => {
    const serialized = encrypt('hello', KEY);
    expect(serialized.startsWith('v1:')).toBe(true);
    expect(serialized.split(':').length).toBe(4);
  });

  it('encrypt_usesRandomIvSoCiphertextDiffers', () => {
    const a = encrypt('same-cookie', KEY);
    const b = encrypt('same-cookie', KEY);
    expect(a).not.toBe(b);
    expect(decrypt(a, KEY)).toBe('same-cookie');
    expect(decrypt(b, KEY)).toBe('same-cookie');
  });

  it('decrypt_throwsOnTamperedCiphertext', () => {
    const serialized = encrypt('secret', KEY);
    const parts = serialized.split(':');
    // flip a char in ciphertext
    const tampered = parts.slice();
    tampered[3] = tampered[3].slice(0, -2) + (tampered[3].slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(() => decrypt(tampered.join(':'), KEY)).toThrow();
  });

  it('decrypt_throwsOnWrongKey', () => {
    const serialized = encrypt('secret', KEY);
    const otherKey = deriveKey('different-passphrase', 'fixed-salt-for-tests');
    expect(() => decrypt(serialized, otherKey)).toThrow();
  });

  it('decrypt_throwsOnInvalidFormat', () => {
    expect(() => decrypt('not-valid', KEY)).toThrow();
    expect(() => decrypt('v2:a:b:c', KEY)).toThrow();
  });

  it('toKeyBuffer_rejectsBadKeyLength', () => {
    expect(() => toKeyBuffer('tooshort')).toThrow();
    expect(() => toKeyBuffer(Buffer.alloc(16))).toThrow();
  });

  it('toKeyBuffer_acceptsBufferAndHex', () => {
    const buf = Buffer.alloc(32, 7);
    expect(toKeyBuffer(buf).length).toBe(32);
    const hex = buf.toString('hex');
    expect(toKeyBuffer(hex).equals(buf)).toBe(true);
  });

  it('deriveKey_isDeterministicForSamePassphraseSalt', () => {
    expect(deriveKey('p', 's')).toBe(deriveKey('p', 's'));
    expect(deriveKey('p', 's')).not.toBe(deriveKey('p', 'other-salt'));
  });

  it('createCookieCipher_bindsKeyForEncryptDecrypt', () => {
    const cipher = createCookieCipher(KEY);
    const cookie = 'MUSIC_U=xyz; __csrf=abc;';
    const serialized = cipher.encrypt(cookie);
    expect(serialized.startsWith('v1:')).toBe(true);
    expect(cipher.decrypt(serialized)).toBe(cookie);
  });

  it('createCookieCipher_decryptFailsWithDifferentKey', () => {
    const a = createCookieCipher(KEY);
    const b = createCookieCipher(deriveKey('other', 'salt'));
    const serialized = a.encrypt('secret');
    expect(() => b.decrypt(serialized)).toThrow();
  });
});
