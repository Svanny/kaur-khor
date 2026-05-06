export type EmbeddedAppMode = 'app' | 'demo';
export type WebLandingMount = 'main' | null;

function normalizePath(pathname: string) {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

export function embeddedModeForPath(pathname: string, basePath = ''): EmbeddedAppMode | null {
  const normalizedPath = normalizePath(pathname);
  const normalizedBase = basePath ? normalizePath(basePath) : '';
  const candidates = new Set<string>([normalizedPath]);

  if (normalizedBase && normalizedPath === normalizedBase) {
    candidates.add('/');
  }

  if (normalizedBase && normalizedPath.startsWith(`${normalizedBase}/`)) {
    candidates.add(normalizePath(normalizedPath.slice(normalizedBase.length)));
  }

  if (normalizedPath === '/kaur-khor') {
    candidates.add('/');
  }

  if (normalizedPath.startsWith('/kaur-khor/')) {
    candidates.add(normalizePath(normalizedPath.slice('/kaur-khor'.length)));
  }

  if (candidates.has('/demo')) {
    return 'demo';
  }

  if (candidates.has('/app')) {
    return 'app';
  }

  return null;
}

export function webLandingMountForPath(pathname: string): WebLandingMount {
  return normalizePath(pathname) === '/main' ? 'main' : null;
}
