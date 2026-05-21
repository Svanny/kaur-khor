export function stringifyExportJson(value: unknown, space?: number) {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, nextValue) => {
      if (typeof nextValue === 'bigint') {
        return nextValue.toString();
      }
      if (nextValue && typeof nextValue === 'object') {
        if (seen.has(nextValue)) {
          return '[Circular]';
        }
        seen.add(nextValue);
      }
      return nextValue;
    },
    space,
  );
}

export function serializeExportCell(value: unknown) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return stringifyExportJson(value) ?? '';
}

export function sanitizeSpreadsheetFormulaText(value: string) {
  return /^[\s\x00-\x1f\x7f]*[=+\-@]/.test(value) ? `'${value}` : value;
}
