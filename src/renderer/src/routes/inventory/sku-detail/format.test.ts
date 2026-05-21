import { describe, expect, it } from 'vitest';
import {
  formatSenaCompactIntervalDate,
  formatSenaDate,
  formatSenaDateTime,
  formatSenaLongDate,
  formatSenaWeekdayShort,
  formatSenaWideIntervalDateLocalized,
} from './format';

describe('sku detail Khmer date formatting', () => {
  it('uses Khmer month names instead of English abbreviations', () => {
    expect(formatSenaDate('2026-03-28T09:00:00Z', 'km')).toBe('28 មីនា');
    expect(formatSenaLongDate('2026-04-07T09:00:00Z', 'km')).toBe('7 មេសា 2026');
    expect(formatSenaWideIntervalDateLocalized('2026-04-11T09:00:00Z', 'km')).toBe('11 មេសា');
    expect(formatSenaCompactIntervalDate('2026-04-11T09:00:00Z', 'km')).toBe('11 មេសា');
  });

  it('uses Khmer-safe weekday and datetime output', () => {
    expect(formatSenaWeekdayShort('2026-04-12T09:00:00Z', 'km')).toBe('អា');
    expect(formatSenaDateTime('2026-04-07T09:05:00Z', 'km')).toContain('7 មេសា');
    expect(formatSenaDateTime('2026-04-07T09:05:00Z', 'km')).not.toContain('Apr');
  });
});
