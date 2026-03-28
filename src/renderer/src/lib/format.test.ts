import { formatEditableDecimal, formatEditableMoney } from './format';

describe('format helpers', () => {
  it('rounds editable money values to two decimals', () => {
    expect(formatEditableMoney(5.159090909090909)).toBe('5.16');
    expect(formatEditableMoney(12)).toBe('12');
    expect(formatEditableMoney(7.5)).toBe('7.5');
  });

  it('trims trailing zeros after rounding editable decimals', () => {
    expect(formatEditableDecimal(3.4567, 2)).toBe('3.46');
    expect(formatEditableDecimal(8.0, 2)).toBe('8');
    expect(formatEditableDecimal(1.25, 3)).toBe('1.25');
  });
});
