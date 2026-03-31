import {
  formatDurationAuto,
  formatEditableDecimal,
  sanitizeEditableWholeNumber,
  formatEditableWholeNumber,
  formatEditableMoney,
  formatQuantityForDisplay,
  formatWholeNumber,
  sanitizeWholeNumberForDisplay,
} from './format';

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

  it('sanitizes display-only whole numbers consistently', () => {
    expect(sanitizeWholeNumberForDisplay(12.2)).toBe(12);
    expect(sanitizeWholeNumberForDisplay(12.5)).toBe(13);
    expect(formatWholeNumber(1234.8, 'en')).toBe('1,235');
    expect(formatEditableWholeNumber(9.6)).toBe('10');
    expect(sanitizeEditableWholeNumber('9.6')).toBe('10');
    expect(sanitizeEditableWholeNumber('')).toBe('');
  });

  it('preserves sub-unit quantity precision without collapsing to zero', () => {
    expect(formatQuantityForDisplay(0.6, 'en')).toBe('0.6');
    expect(formatQuantityForDisplay(0.0001, 'en')).toBe('0.0001');
    expect(formatQuantityForDisplay(2.2, 'en')).toBe('2');
  });

  it('steps down duration units when rounding would collapse to zero', () => {
    expect(formatDurationAuto(0.2, 'day', 'en')).toBe('5 hours');
    expect(formatDurationAuto(0.01, 'hour', 'en')).toBe('0.6 minutes');
    expect(formatDurationAuto(0.2, 'week', 'en', 'short')).toBe('1d');
    expect(formatDurationAuto(2, 'day', 'en')).toBe('2 days');
    expect(formatDurationAuto(0.000001, 'hour', 'en')).toBe('0.0001 minutes');
  });
});
