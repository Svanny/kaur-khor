import {
  limits,
  normalizeText,
  validateNonNegativeDecimal,
  validateRequiredText,
} from './validation';

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
});
