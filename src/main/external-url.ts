const ALLOWED_HTTPS_HOSTS = new Set([
  'github.com',
  't.me',
  'telegram.me',
]);
const TELEGRAM_DOMAIN_PATTERN = /^[A-Za-z0-9_]{5,32}$/;

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

export function normalizeAllowedExternalUrl(targetUrl: string): string {
  if (typeof targetUrl !== 'string' || targetUrl.trim().length === 0) {
    throw new Error('A URL is required.');
  }

  const normalizedUrl = targetUrl.trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    throw new Error('A valid URL is required.');
  }

  if (parsedUrl.protocol === 'https:') {
    if (!ALLOWED_HTTPS_HOSTS.has(parsedUrl.hostname)) {
      throw new Error('Only Kaur Khor GitHub and Telegram links can be opened.');
    }
    if (parsedUrl.username !== '' || parsedUrl.password !== '') {
      throw new Error('Only Kaur Khor GitHub and Telegram links can be opened.');
    }
    return normalizedUrl;
  }

  if (isAllowedTelegramDeepLink(parsedUrl)) {
    return normalizedUrl;
  }

  throw new Error('Only Kaur Khor GitHub and Telegram links can be opened.');
}
