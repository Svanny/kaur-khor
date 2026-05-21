import {
  limits,
  normalizeText,
  validateNonNegativeDecimal,
  validatePositiveDecimal,
  validateRequiredText,
} from '../ui/validation';

describe('validation helpers', () => {
  it('normalizes repeated whitespace', () => {
    expect(normalizeText('  Fresh    stock item  ')).toBe('Fresh stock item');
  });

  it('rejects missing and unsafe text', () => {
    expect(validateRequiredText('   ', limits.skuNameMaxLength)).toBe('required');
    expect(validateRequiredText('abc\u202E', limits.skuNameMaxLength)).toBe('unsafe');
  });

  it('rejects invalid decimal values', () => {
    expect(validateNonNegativeDecimal('-1', limits.inventoryUnitsMax)).toBe('invalid');
    expect(validateNonNegativeDecimal('1000000001', limits.monetaryAmountMax)).toBe('too-large');
    expect(validateNonNegativeDecimal('0', limits.monetaryAmountMax)).toBeNull();
    expect(validateNonNegativeDecimal('10.5', limits.inventoryUnitsMax)).toBeNull();
  });

  it('rejects non-decimal numeric syntax', () => {
    for (const value of ['0x10', '1e3', '+1', '-1', '.5', '1.', '1.2.3']) {
      expect(validateNonNegativeDecimal(value, limits.inventoryUnitsMax)).toBe('invalid');
      expect(validatePositiveDecimal(value, limits.inventoryUnitsMax)).toBe('invalid');
    }
  });

  it('preserves ordinary decimal validation behavior', () => {
    expect(validateNonNegativeDecimal('000.50', limits.inventoryUnitsMax)).toBeNull();
    expect(validatePositiveDecimal('0', limits.inventoryUnitsMax)).toBe('invalid');
    expect(validatePositiveDecimal('0.01', limits.inventoryUnitsMax)).toBeNull();
  });
});
