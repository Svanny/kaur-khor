function padLocalDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateFromInputValue(value: string | Date | null | undefined): Date {
  if (value instanceof Date) {
    return value;
  }
  if (!value) {
    return new Date();
  }
  return DATE_INPUT_PATTERN.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

export function formatLocalDateInputValue(value?: string | Date | null): string {
  const date = dateFromInputValue(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return [
    date.getFullYear(),
    padLocalDatePart(date.getMonth() + 1),
    padLocalDatePart(date.getDate()),
  ].join('-');
}

export function formatLocalDateTimeInputValue(value?: string | Date | null): string {
  const date = dateFromInputValue(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${formatLocalDateInputValue(date)}T${padLocalDatePart(date.getHours())}:${padLocalDatePart(date.getMinutes())}`;
}

export function observedLocalDateInputValue(value?: string | Date | null): string {
  if (value == null || value === '') {
    return '';
  }
  return formatLocalDateInputValue(value);
}

function dateInputToLocalDate(value: string): Date | null {
  if (!DATE_INPUT_PATTERN.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isDateInputBeforeObservedDate(value: string, observedAt?: string | Date | null): boolean {
  const observedDate = observedLocalDateInputValue(observedAt);
  if (!value || !observedDate || !DATE_INPUT_PATTERN.test(value)) {
    return false;
  }
  return value < observedDate;
}

export function clampDateInputToObservedDate(value: string, observedAt?: string | Date | null): string {
  const observedDate = observedLocalDateInputValue(observedAt);
  if (!value || !observedDate || !DATE_INPUT_PATTERN.test(value)) {
    return value;
  }
  return value < observedDate ? observedDate : value;
}

export function dateInputToIsoOnOrAfterObserved(value: string, observedAt?: string | Date | null): string | null {
  const clampedValue = clampDateInputToObservedDate(value, observedAt);
  const expectedDate = dateInputToLocalDate(clampedValue);
  if (!expectedDate) {
    return null;
  }

  const observed = observedAt ? dateFromInputValue(observedAt) : null;
  if (observed && !Number.isNaN(observed.getTime())) {
    const observedDate = observedLocalDateInputValue(observed);
    if (clampedValue === observedDate && expectedDate.getTime() < observed.getTime()) {
      return observed.toISOString();
    }
  }

  return expectedDate.toISOString();
}

export function calendarDaysBetweenObservedAndDateInput(observedAt: string | Date | null | undefined, value: string): number | null {
  const observedDateValue = observedLocalDateInputValue(observedAt);
  const observedDate = dateInputToLocalDate(observedDateValue);
  const expectedDate = dateInputToLocalDate(clampDateInputToObservedDate(value, observedAt));
  if (!observedDate || !expectedDate) {
    return null;
  }
  return Math.max(0, Math.round((expectedDate.getTime() - observedDate.getTime()) / 86_400_000));
}

export function dateInputValueFromIsoString(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function isoStringFromDateInput(value: string, boundary: 'start' | 'end'): string | null {
  if (!value) {
    return null;
  }
  const suffix = boundary === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';
  const timestamp = Date.parse(`${value}${suffix}`);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

export function daysBetween(startAt: string, endAt: string): number {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }
  return Math.ceil((end - start) / (24 * 60 * 60 * 1000));
}

export function shiftDateByDays(isoString: string, days: number): string {
  const timestamp = Date.parse(isoString);
  if (!Number.isFinite(timestamp)) {
    return isoString;
  }
  return new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString();
}
