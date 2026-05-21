import type { AppCurrency, AppLanguage } from '@shared/inventory';
import {
  formatCurrency,
  formatDecimal,
  formatDurationAuto,
  formatQuantityForDisplay,
  formatWholeNumber,
  localeFor,
} from '@/lib/formatting/format';

const KHMER_MONTH_SHORT = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ',
] as const;

const KHMER_WEEKDAY_SHORT = ['អា', 'ច', 'អ', 'ពុ', 'ព្រ', 'សុ', 'ស'] as const;

function formatKhmerMonthDay(date: Date) {
  return `${formatWholeNumber(date.getDate(), 'km')} ${KHMER_MONTH_SHORT[date.getMonth()] ?? '—'}`;
}

function formatKhmerMonthDayYear(date: Date) {
  const year = new Intl.NumberFormat(localeFor('km'), {
    maximumFractionDigits: 0,
    useGrouping: false,
  }).format(date.getFullYear());
  return `${formatWholeNumber(date.getDate(), 'km')} ${KHMER_MONTH_SHORT[date.getMonth()] ?? '—'} ${year}`;
}

function formatKhmerTime(date: Date) {
  return new Intl.DateTimeFormat(localeFor('km'), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(/\s+/g, ' ')
    .trim();
}

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
  if (value == null || !Number.isFinite(value)) {
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

export function formatSenaCurrency(
  value: number | null,
  currency: AppCurrency,
  language: AppLanguage,
  usdToKhrExchangeRate: number,
) {
  if (value == null) {
    return '—';
  }
  return formatCurrency(value, currency, language, usdToKhrExchangeRate);
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
  if (language === 'km') {
    return formatKhmerMonthDay(date);
  }
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatSenaLongDate(value: string | null, language: AppLanguage) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '—';
  }
  if (language === 'km') {
    return formatKhmerMonthDayYear(date);
  }
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatSenaLongDateTime24(value: string | null, language: AppLanguage) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '—';
  }
  if (language === 'km') {
    return `${formatKhmerMonthDayYear(date)} ${formatKhmerTime(date)}`;
  }
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatSenaDateTime(value: string | null, language: AppLanguage) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '—';
  }
  if (language === 'km') {
    return `${formatKhmerMonthDay(date)} ${formatKhmerTime(date)}`;
  }
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatSenaWeekdayShort(value: string | null, language: AppLanguage) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '—';
  }
  if (language === 'km') {
    return KHMER_WEEKDAY_SHORT[date.getDay()] ?? '—';
  }
  return new Intl.DateTimeFormat(localeFor(language), {
    weekday: 'short',
  }).format(date);
}

const ENGLISH_MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;
const ENGLISH_MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function formatSenaWideIntervalDate(value: string | null) {
  return formatSenaWideIntervalDateLocalized(value, 'en');
}

export function formatSenaWideIntervalDateLocalized(value: string | null, language: AppLanguage) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '—';
  }
  if (language === 'km') {
    return formatKhmerMonthDay(date);
  }
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'short',
    day: 'numeric',
  })
    .format(date)
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatSenaCompactIntervalDate(value: string | null, language: AppLanguage = 'en') {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '—';
  }
  if (language !== 'en') {
    return formatSenaWideIntervalDateLocalized(value, language);
  }
  const monthInitial = ENGLISH_MONTH_INITIALS[date.getMonth()] ?? '—';
  return `${monthInitial}-${date.getDate()}`;
}

export function formatSenaCompactIntervalDay(value: string | null, language: AppLanguage = 'en') {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '—';
  }
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: 0,
  }).format(date.getDate());
}
