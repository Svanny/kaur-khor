import { describe, expect, test } from 'vitest';
import { regimeInitials } from './detail-regime-overlay';

describe('detail regime overlay labels', () => {
  test('uses localized short labels for Khmer narrow slots', () => {
    expect(regimeInitials('promo')).toBe('P');
    expect(regimeInitials('stockout-constrained')).toBe('SC');
    expect(regimeInitials('promo', 'km')).toBe('ប្រូ');
    expect(regimeInitials('stockout-constrained', 'km')).toBe('អស់');
    expect(/[A-Za-z]/.test(regimeInitials('normal', 'km'))).toBe(false);
  });
});
