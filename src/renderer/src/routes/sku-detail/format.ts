import type { AppCurrency, AppLanguage } from '@shared/inventory';
import {
  formatCurrency,
  formatDecimal,
  formatDurationAuto,
  formatQuantityForDisplay,
  formatWholeNumber,
  localeFor,
} from '@/lib/format';

export function formatSenaUnits(value: number | null, language: AppLanguage) {
  if (value == null) {
    return '—';
  }
  return formatWholeNumber(value, language);
}

export function formatSenaQuantity(value: number | null, language: AppLanguage) {
  if (value == null) {
    return '—';
  }
  return formatQuantityForDisplay(value, language);
}

export function formatSenaPercent(value: number | null, language: AppLanguage) {
  if (value == null) {
    return '—';
  }
  return new Intl.NumberFormat(localeFor(language), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatSenaDays(value: number | null, language: AppLanguage) {
  if (value == null) {
    return '—';
  }
  return formatDurationAuto(value, 'day', language, 'short');
}

export function formatSenaCurrency(value: number | null, currency: AppCurrency, language: AppLanguage) {
  if (value == null) {
    return '—';
  }
  return formatCurrency(value, currency, language);
}

export function formatSenaDecimal(value: number | null, language: AppLanguage, digits = 1) {
  if (value == null) {
    return '—';
  }
  return formatDecimal(value, language, digits);
}

export function formatSenaDate(value: string | null, language: AppLanguage) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '—';
  }
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatSenaDateTime(value: string | null, language: AppLanguage) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '—';
  }
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

const ENGLISH_MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

export function formatSenaCompactIntervalDate(value: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '—';
  }
  const monthInitial = ENGLISH_MONTH_INITIALS[date.getUTCMonth()] ?? '—';
  return `${monthInitial}-${date.getUTCDate()}`;
}
