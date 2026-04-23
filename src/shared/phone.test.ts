import { describe, expect, test } from 'vitest';
import {
  formatPhoneForDisplay,
  normalizePhoneLookupKey,
  normalizePhoneNumber,
  sanitizePhoneInput,
} from './phone';

describe('phone formatting', () => {
  test('sanitizes separators while preserving international intent', () => {
    expect(sanitizePhoneInput('(012) 345-678')).toBe('012345678');
    expect(sanitizePhoneInput('00 44 1234 567890')).toBe('+441234567890');
    expect(sanitizePhoneInput('+855 12 345 678')).toBe('+85512345678');
  });

  test('normalizes local and Cambodia-default inputs into spaced international format', () => {
    expect(normalizePhoneNumber('+85512345678')).toBe('+855 12345678');
    expect(normalizePhoneNumber('85512345678')).toBe('+855 12345678');
    expect(normalizePhoneNumber('012345678')).toBe('+855 12345678');
    expect(normalizePhoneNumber('12345678')).toBe('+855 12345678');
    expect(normalizePhoneNumber('(012) 345-678')).toBe('+855 12345678');
  });

  test('preserves explicit non-cambodia country codes', () => {
    expect(normalizePhoneNumber('+441234567890')).toBe('+44 1234567890');
    expect(normalizePhoneNumber('00441234567890')).toBe('+44 1234567890');
    expect(normalizePhoneNumber('0012345678')).toBe('+1 2345678');
  });

  test('builds stable lookup keys from equivalent representations', () => {
    expect(normalizePhoneLookupKey('+855 12345678')).toBe('+85512345678');
    expect(normalizePhoneLookupKey('012345678')).toBe('+85512345678');
    expect(normalizePhoneLookupKey('85512345678')).toBe('+85512345678');
  });

  test('formats display values with normalized spacing and leaves blank values blank', () => {
    expect(formatPhoneForDisplay('+85512345678')).toBe('+855 12345678');
    expect(formatPhoneForDisplay('')).toBe('');
  });
});
