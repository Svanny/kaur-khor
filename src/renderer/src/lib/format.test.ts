import {
  formatDurationAuto,
  displayMoneyFromUsd,
  formatCurrency,
  formatEditableDecimal,
  formatEditableMoneyFromUsd,
  formatEditableNumberWithCommas,
  parseEditableNumberWithCommas,
  sanitizeEditableWholeNumber,
  sanitizeEditableNumberDraft,
  formatEditableWholeNumber,
  formatEditableMoney,
  formatQuantityForDisplay,
  formatWholeNumber,
  sanitizeWholeNumberForDisplay,
  usdMoneyFromDisplay,
  currencyInputSymbol,
} from './format';

describe('format helpers', () => {
  it('rounds editable money values to two decimals', () => {
    expect(formatEditableMoney(5.159090909090909)).toBe('5.16');
    expect(formatEditableMoney(12)).toBe('12');
    expect(formatEditableMoney(7.5)).toBe('7.5');
  });

  it('converts USD-backed money for KHR display and inputs', () => {
    expect(formatCurrency(2, 'USD', 'en', 4000)).toBe('$2.00');
    expect(formatCurrency(2, 'KHR', 'en', 4000)).toBe('KHR 8,000');
    expect(currencyInputSymbol('USD')).toBe('$');
    expect(currencyInputSymbol('KHR')).toBe('៛');
    expect(displayMoneyFromUsd(2, 'KHR', 4100)).toBe(8200);
    expect(formatEditableMoneyFromUsd(2, 'KHR', 4000)).toBe('8000');
    expect(usdMoneyFromDisplay(8000, 'KHR', 4000)).toBe(2);
  });

  it('trims trailing zeros after rounding editable decimals', () => {
    expect(formatEditableDecimal(3.4567, 2)).toBe('3.46');
    expect(formatEditableDecimal(8.0, 2)).toBe('8');
    expect(formatEditableDecimal(1.25, 3)).toBe('1.25');
  });

  it('formats editable number drafts with live thousands separators', () => {
    expect(formatEditableNumberWithCommas('1000')).toBe('1,000');
    expect(formatEditableNumberWithCommas('1000000')).toBe('1,000,000');
    expect(formatEditableNumberWithCommas('7960000.12345')).toBe('7,960,000.12345');
    expect(formatEditableNumberWithCommas('12.')).toBe('12.');
    expect(formatEditableNumberWithCommas('12.0')).toBe('12.0');
    expect(formatEditableNumberWithCommas('')).toBe('');
  });

  it('parses and sanitizes editable number drafts', () => {
    expect(parseEditableNumberWithCommas('7,960,000.12345')).toBe(7960000.12345);
    expect(sanitizeEditableNumberDraft('7,960,000.12345')).toBe('7960000.12345');
    expect(sanitizeEditableNumberDraft('12.34.56')).toBe('12.3456');
    expect(sanitizeEditableNumberDraft('12.34', 'integer')).toBe('1234');
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

  it('steps down sub-unit durations and rounds them to whole numbers', () => {
    expect(formatDurationAuto(0.2, 'day', 'en')).toBe('5 hours');
    expect(formatDurationAuto(0.999, 'day', 'en')).toBe('24 hours');
    expect(formatDurationAuto(0.01, 'hour', 'en')).toBe('1 minute');
    expect(formatDurationAuto(0.2, 'week', 'en', 'short')).toBe('1D');
    expect(formatDurationAuto(0.01, 'hour', 'en', 'short')).toBe('1m');
    expect(formatDurationAuto(2, 'month', 'en', 'short')).toBe('2M');
    expect(formatDurationAuto(3, 'year', 'en', 'short')).toBe('3Y');
    expect(formatDurationAuto(2, 'day', 'en')).toBe('2 days');
    expect(formatDurationAuto(0.000001, 'hour', 'en')).toBe('1 minute');
  });

  it('uses Khmer-safe short duration labels instead of English abbreviations', () => {
    expect(formatDurationAuto(0.2, 'week', 'km', 'short')).toBe('1 ថ្ងៃ');
    expect(formatDurationAuto(0.01, 'hour', 'km', 'short')).toBe('1 នាទី');
    expect(formatDurationAuto(2, 'month', 'km', 'short')).toBe('2 ខែ');
    expect(formatDurationAuto(3, 'year', 'km', 'short')).toBe('3 ឆ្នាំ');
  });
});
