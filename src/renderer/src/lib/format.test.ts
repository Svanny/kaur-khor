import {
  formatDurationAuto,
  displayMoneyFromUsd,
  formatCurrency,
  formatCompactQuantityPill,
  formatEditableDecimal,
  formatEditableMoneyFromUsd,
  formatEditableNumberWithCommas,
  parseEditableNumberWithCommas,
  formatNumber,
  sanitizeEditableWholeNumber,
  sanitizeEditableNumberDraft,
  formatEditableWholeNumber,
  formatEditableMoney,
  formatQuantityForDisplay,
  formatWholeNumber,
  reformatMoneyDraftValue,
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

  it('falls back from dirty exchange rates before money conversion', () => {
    expect(displayMoneyFromUsd(2, 'KHR', Number.POSITIVE_INFINITY)).toBe(displayMoneyFromUsd(2, 'KHR'));
    expect(displayMoneyFromUsd(2, 'KHR', Number.NaN)).toBe(displayMoneyFromUsd(2, 'KHR'));
    expect(usdMoneyFromDisplay(8000, 'KHR', 0)).toBe(usdMoneyFromDisplay(8000, 'KHR'));
    expect(formatCurrency(2, 'KHR', 'en', Number.POSITIVE_INFINITY)).toBe(formatCurrency(2, 'KHR', 'en'));
    expect(formatEditableMoneyFromUsd(2, 'KHR', Number.NaN)).toBe(formatEditableMoneyFromUsd(2, 'KHR'));
  });

  it('does not divide KHR drafts by dirty exchange rates during currency reformatting', () => {
    expect(
      reformatMoneyDraftValue({
        value: '8,000',
        previousCurrency: 'KHR',
        previousUsdToKhrExchangeRate: 0,
        nextCurrency: 'USD',
      }),
    ).toBe(formatEditableMoneyFromUsd(usdMoneyFromDisplay(8000, 'KHR'), 'USD'));
  });

  it('contains non-finite display numbers before they reach route copy', () => {
    expect(formatCurrency(Number.NaN, 'USD', 'en', 4000)).toBe('$0.00');
    expect(formatNumber(Number.POSITIVE_INFINITY, 'en')).toBe('0');
    expect(formatWholeNumber(Number.NaN, 'en')).toBe('0');
    expect(formatQuantityForDisplay(Number.NaN, 'en')).toBe('0');
    expect(formatCompactQuantityPill(Number.POSITIVE_INFINITY)).toBe('0');
  });

  it('leaves non-finite money drafts unchanged during currency reformatting', () => {
    expect(
      reformatMoneyDraftValue({
        value: 'Infinity',
        previousCurrency: 'USD',
        nextCurrency: 'KHR',
        nextUsdToKhrExchangeRate: 4000,
      }),
    ).toBe('Infinity');
  });

  it('reformats comma-formatted money drafts between currencies', () => {
    expect(parseEditableNumberWithCommas('1,234.50')).toBe(1234.5);
    expect(
      reformatMoneyDraftValue({
        value: '1,234.50',
        previousCurrency: 'USD',
        nextCurrency: 'KHR',
        nextUsdToKhrExchangeRate: 4000,
      }),
    ).toBe('4938000');
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
    expect(parseEditableNumberWithCommas('-1,234.5')).toBe(-1234.5);
    expect(parseEditableNumberWithCommas('0x10')).toBeNaN();
    expect(parseEditableNumberWithCommas('1e3')).toBeNaN();
    expect(parseEditableNumberWithCommas('Infinity')).toBeNaN();
    expect(parseEditableNumberWithCommas('12,34')).toBeNaN();
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
    expect(sanitizeEditableWholeNumber('Infinity')).toBe('Infinity');
  });

  it('preserves sub-unit quantity precision without collapsing to zero', () => {
    expect(formatQuantityForDisplay(0.6, 'en')).toBe('0.6');
    expect(formatQuantityForDisplay(0.0001, 'en')).toBe('0.0001');
    expect(formatQuantityForDisplay(2.2, 'en')).toBe('2');
  });

  it('formats compact quantity pill labels', () => {
    expect(formatCompactQuantityPill(0)).toBe('0');
    expect(formatCompactQuantityPill(2)).toBe('2');
    expect(formatCompactQuantityPill(999)).toBe('999');
    expect(formatCompactQuantityPill(1000)).toBe('1k');
    expect(formatCompactQuantityPill(1200)).toBe('1.2k');
    expect(formatCompactQuantityPill(6376.7223)).toBe('6.4k');
    expect(formatCompactQuantityPill(12500)).toBe('12.5k');
    expect(formatCompactQuantityPill(999950)).toBe('1M');
    expect(formatCompactQuantityPill(1000000)).toBe('1M');
    expect(formatCompactQuantityPill(1250000)).toBe('1.3M');
    expect(formatCompactQuantityPill(3500000000)).toBe('3.5B');
    expect(formatCompactQuantityPill(1000000000000)).toBe('1T');
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
