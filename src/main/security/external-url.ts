const ALLOWED_TELEGRAM_HTTPS_HOSTS = new Set([
  't.me',
  'telegram.me',
]);
const TELEGRAM_DOMAIN_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const KAUR_KHOR_GITHUB_PATH_PATTERN = /^\/Svanny\/kaur-khor(?:\/|$)/;
const URL_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

function isAllowedTelegramDeepLink(parsedUrl: URL) {
  const searchParamKeys = Array.from(parsedUrl.searchParams.keys());
  return parsedUrl.protocol === 'tg:'
    && parsedUrl.hostname === 'resolve'
    && parsedUrl.username === ''
    && parsedUrl.password === ''
    && parsedUrl.pathname === ''
    && parsedUrl.hash === ''
    && searchParamKeys.length === 1
    && searchParamKeys[0] === 'domain'
    && TELEGRAM_DOMAIN_PATTERN.test(parsedUrl.searchParams.get('domain') ?? '');
}

function isAllowedTelegramHttpsLink(parsedUrl: URL) {
  const usernameFromPath = parsedUrl.pathname.slice(1).replace(/\/$/, '');
  return ALLOWED_TELEGRAM_HTTPS_HOSTS.has(parsedUrl.hostname)
    && parsedUrl.username === ''
    && parsedUrl.password === ''
    && parsedUrl.search === ''
    && parsedUrl.hash === ''
    && TELEGRAM_DOMAIN_PATTERN.test(usernameFromPath);
}

export function normalizeAllowedExternalUrl(targetUrl: string): string {
  if (typeof targetUrl !== 'string' || targetUrl.trim().length === 0) {
    throw new Error('A URL is required.');
  }

  const normalizedUrl = targetUrl.trim();
  if (URL_CONTROL_CHARACTER_PATTERN.test(normalizedUrl)) {
    throw new Error('A valid URL is required.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    throw new Error('A valid URL is required.');
  }

  if (parsedUrl.protocol === 'https:') {
    if (
      parsedUrl.hostname !== 'github.com' &&
      !isAllowedTelegramHttpsLink(parsedUrl)
    ) {
      throw new Error('Only Kaur Khor GitHub and Telegram links can be opened.');
    }
    if (parsedUrl.username !== '' || parsedUrl.password !== '') {
      throw new Error('Only Kaur Khor GitHub and Telegram links can be opened.');
    }
    if (parsedUrl.hostname === 'github.com' && !KAUR_KHOR_GITHUB_PATH_PATTERN.test(parsedUrl.pathname)) {
      throw new Error('Only Kaur Khor GitHub and Telegram links can be opened.');
    }
    return normalizedUrl;
  }

  if (isAllowedTelegramDeepLink(parsedUrl)) {
    return normalizedUrl;
  }

  throw new Error('Only Kaur Khor GitHub and Telegram links can be opened.');
}
