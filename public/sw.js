const CACHE_NAME = 'kaur-khor-web-v2';
const SHELL_URL = './';
const STATIC_ASSETS = [
  SHELL_URL,
  './manifest.webmanifest',
  './icons/kaur-khor-browser-icon.svg',
  './icons/apple-touch-icon.png',
  './icons/kaur-khor-icon-192.png',
  './icons/kaur-khor-icon-512.png',
];

function isStaticAssetRequest(requestUrl) {
  return requestUrl.pathname.includes('/assets/')
    || requestUrl.pathname.includes('/icons/')
    || requestUrl.pathname.includes('/screenshots/')
    || requestUrl.pathname.endsWith('/manifest.webmanifest')
    || requestUrl.pathname.endsWith('/sw.js');
}

function cacheResponse(request, response) {
  if (!response || !response.ok) {
    return response;
  }

  const responseClone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
  return response;
}

function fetchAndCache(request) {
  return fetch(request).then((response) => cacheResponse(request, response));
}

function cachedShellOrError(request) {
  return caches.match(SHELL_URL).then((cachedShell) => {
    if (cachedShell) {
      return cachedShell;
    }

    throw new Error(`Kaur Khor offline shell unavailable: ${request.url}`);
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetchAndCache(event.request).catch(() => cachedShellOrError(event.request)));
    return;
  }

  if (!isStaticAssetRequest(requestUrl)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => cachedResponse || fetchAndCache(event.request)),
  );
});
