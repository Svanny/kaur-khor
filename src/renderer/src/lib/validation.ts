const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const BIDI_CONTROL_CHARS = /[\u202A-\u202E\u2066-\u2069]/;
const DECIMAL_NUMBER = /^\d+(?:\.\d+)?$/;

export const limits = {
  skuNameMaxLength: 80,
  skuDescriptionMaxLength: 250,
  serviceNameMaxLength: 80,
  serviceDescriptionMaxLength: 250,
  inventoryUnitsMax: 1_000_000,
  monetaryAmountMax: 1_000_000_000,
};

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function validateRequiredText(value: string, maxLength: number): string | null {
  if (CONTROL_CHARS.test(value) || BIDI_CONTROL_CHARS.test(value)) {
    return 'unsafe';
  }
  const normalized = normalizeText(value);
  if (!normalized) {
    return 'required';
  }
  if (normalized.length > maxLength) {
    return 'too-long';
  }
  return null;
}

export function validateEntryId(value: string): 'required' | 'invalid' | null {
  const normalized = value.trim();
  if (!normalized) {
    return 'required';
  }
  if (normalized.length < 3 || normalized.length > 64) {
    return 'invalid';
  }
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    return 'invalid';
  }
  return null;
}

export function validateNonNegativeDecimal(value: string, maxValue: number): string | null {
  const raw = value.trim();
  if (!raw) {
    return 'required';
  }
  if (!DECIMAL_NUMBER.test(raw)) {
    return 'invalid';
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 'invalid';
  }
  if (parsed > maxValue) {
    return 'too-large';
  }
  return null;
}

export function validatePositiveDecimal(value: string, maxValue: number): string | null {
  const raw = value.trim();
  if (!raw) {
    return 'required';
  }
  if (!DECIMAL_NUMBER.test(raw)) {
    return 'invalid';
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 'invalid';
  }
  if (parsed > maxValue) {
    return 'too-large';
  }
  return null;
}
