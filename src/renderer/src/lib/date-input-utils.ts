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
