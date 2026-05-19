import { describe, expect, it } from 'vitest';
import {
  calendarDaysBetweenObservedAndDateInput,
  clampDateInputToObservedDate,
  dateInputToIsoOnOrAfterObserved,
  isoStringFromDateInput,
  isDateInputBeforeObservedDate,
  observedLocalDateInputValue,
  parseLocalDateTimeInputIso,
} from './date-input-utils';

describe('expected arrival date input helpers', () => {
  it('derives the observed local date from datetime-local input', () => {
    expect(observedLocalDateInputValue('2026-05-09T08:59')).toBe('2026-05-09');
  });

  it('detects and clamps a date before the observed local date', () => {
    expect(isDateInputBeforeObservedDate('2026-05-08', '2026-05-09T08:59')).toBe(true);
    expect(clampDateInputToObservedDate('2026-05-08', '2026-05-09T08:59')).toBe('2026-05-09');
  });

  it('allows the same observed local date', () => {
    expect(isDateInputBeforeObservedDate('2026-05-09', '2026-05-09T08:59')).toBe(false);
    expect(clampDateInputToObservedDate('2026-05-09', '2026-05-09T08:59')).toBe('2026-05-09');
    expect(calendarDaysBetweenObservedAndDateInput('2026-05-09T08:59', '2026-05-09')).toBe(0);
  });

  it('does not serialize same-day date-only input before observed-at', () => {
    const observedAt = '2026-05-09T08:59';
    const iso = dateInputToIsoOnOrAfterObserved('2026-05-09', observedAt);

    expect(iso).toBe(new Date(observedAt).toISOString());
    expect(new Date(iso ?? '').getTime()).toBeGreaterThanOrEqual(new Date(observedAt).getTime());
  });

  it('serializes future dates normally and keeps calendar days non-negative', () => {
    const observedAt = '2026-05-09T08:59';
    const iso = dateInputToIsoOnOrAfterObserved('2026-05-14', observedAt);

    expect(iso).toBe(new Date('2026-05-14T00:00:00').toISOString());
    expect(calendarDaysBetweenObservedAndDateInput(observedAt, '2026-05-14')).toBe(5);
    expect(calendarDaysBetweenObservedAndDateInput(observedAt, '2026-05-08')).toBe(0);
  });

  it('rejects impossible date-only input values instead of rolling them forward', () => {
    expect(dateInputToIsoOnOrAfterObserved('2026-02-31', '2026-02-01T08:00')).toBeNull();
    expect(calendarDaysBetweenObservedAndDateInput('2026-02-01T08:00', '2026-02-31')).toBeNull();
    expect(isoStringFromDateInput('2026-02-31', 'start')).toBeNull();
  });

  it('rejects impossible datetime-local input values instead of rolling them forward', () => {
    expect(parseLocalDateTimeInputIso('2026-02-28T08:30')).toBe(new Date('2026-02-28T08:30').toISOString());
    expect(parseLocalDateTimeInputIso('2026-02-31T08:30')).toBeNull();
    expect(parseLocalDateTimeInputIso('2026-02-28T24:00')).toBeNull();
  });
});
