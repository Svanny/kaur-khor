const ONE_DIGIT_COUNTRY_CODES = new Set(['1', '7']);
const TWO_DIGIT_COUNTRY_CODES = new Set([
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
]);

const THREE_DIGIT_COUNTRY_CODES = new Set([
  '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229',
  '230', '231', '232', '233', '234', '235', '236', '237', '238', '239',
  '240', '241', '242', '243', '244', '245', '246', '248', '249',
  '250', '251', '252', '253', '254', '255', '256', '257', '258',
  '260', '261', '262', '263', '264', '265', '266', '267', '268', '269',
  '290', '291', '297', '298', '299',
  '350', '351', '352', '353', '354', '355', '356', '357', '358', '359',
  '370', '371', '372', '373', '374', '375', '376', '377', '378', '380', '381', '382', '383', '385', '386', '387', '389',
  '420', '421', '423',
  '500', '501', '502', '503', '504', '505', '506', '507', '508', '509',
  '590', '591', '592', '593', '594', '595', '596', '597', '598', '599',
  '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692',
  '850', '852', '853', '855', '856', '880', '886',
  '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998',
]);

export const DEFAULT_PHONE_COUNTRY_CODE = '855';
const MAX_SANITIZED_PHONE_LENGTH = 32;

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

function normalizeDefaultCountryCode(value: string | null | undefined) {
  return digitsOnly(typeof value === 'string' ? value : '') || DEFAULT_PHONE_COUNTRY_CODE;
}

function splitExplicitCountryCode(value: string) {
  if (!value) {
    return null;
  }
  for (let index = 3; index >= 1; index -= 1) {
    const countryCode = value.slice(0, index);
    if (!countryCode) {
      continue;
    }
    if (
      (index === 1 && ONE_DIGIT_COUNTRY_CODES.has(countryCode))
      || (index === 2 && TWO_DIGIT_COUNTRY_CODES.has(countryCode))
      || (index === 3 && THREE_DIGIT_COUNTRY_CODES.has(countryCode))
    ) {
      return {
        countryCode,
        nationalNumber: value.slice(index),
      };
    }
  }
  return null;
}

export function sanitizePhoneInput(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return '';
  }
  const normalizedInternationalPrefix = trimmed.replace(/^00/, '+');
  const hasLeadingPlus = normalizedInternationalPrefix.startsWith('+');
  const digits = digitsOnly(normalizedInternationalPrefix);
  if (!digits) {
    return '';
  }
  const cappedDigits = digits.slice(0, MAX_SANITIZED_PHONE_LENGTH);
  return hasLeadingPlus ? `+${cappedDigits}` : cappedDigits;
}

export function normalizePhoneNumber(
  value: string | null | undefined,
  options?: { defaultCountryCode?: string | null | undefined },
) {
  const sanitized = sanitizePhoneInput(value);
  if (!sanitized) {
    return '';
  }

  const defaultCountryCode = normalizeDefaultCountryCode(options?.defaultCountryCode);
  if (sanitized.startsWith('+')) {
    const explicitDigits = sanitized.slice(1);
    const split = splitExplicitCountryCode(explicitDigits);
    if (!split) {
      return `+${explicitDigits}`;
    }
    return split.nationalNumber ? `+${split.countryCode} ${split.nationalNumber}` : `+${split.countryCode}`;
  }

  if (sanitized.startsWith('0')) {
    const nationalNumber = sanitized.replace(/^0+/, '');
    return nationalNumber ? `+${defaultCountryCode} ${nationalNumber}` : `+${defaultCountryCode}`;
  }

  if (sanitized.startsWith(defaultCountryCode) && sanitized.length > defaultCountryCode.length) {
    return `+${defaultCountryCode} ${sanitized.slice(defaultCountryCode.length)}`;
  }

  const explicitSplit = sanitized.length >= 11 ? splitExplicitCountryCode(sanitized) : null;
  if (explicitSplit) {
    return explicitSplit.nationalNumber
      ? `+${explicitSplit.countryCode} ${explicitSplit.nationalNumber}`
      : `+${explicitSplit.countryCode}`;
  }

  return `+${defaultCountryCode} ${sanitized}`;
}

export function normalizePhoneLookupKey(value: string | null | undefined) {
  const normalized = normalizePhoneNumber(value);
  const fallback = sanitizePhoneInput(value);
  return (normalized || fallback).replace(/[^\d+]/g, '').toLowerCase();
}

export function formatPhoneForDisplay(value: string | null | undefined) {
  return normalizePhoneNumber(value) || sanitizePhoneInput(value);
}
