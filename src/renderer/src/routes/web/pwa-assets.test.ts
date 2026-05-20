import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';

const projectRoot = process.cwd();

type ImageDimensions = {
  height: number;
  width: number;
};

type ServiceWorkerEventHandler = (event: {
  request: {
    method: string;
    mode?: string;
    url: string;
  };
  respondWith: (response: Promise<unknown>) => void;
  waitUntil: (promise: Promise<unknown>) => void;
}) => void;

function readPngDimensions(filePath: string): ImageDimensions {
  const data = readFileSync(filePath);
  const pngSignature = '89504e470d0a1a0a';
  if (data.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`${filePath} is not a PNG file.`);
  }
  return {
    height: data.readUInt32BE(20),
    width: data.readUInt32BE(16),
  };
}

function readWebpDimensions(filePath: string): ImageDimensions {
  const data = readFileSync(filePath);
  if (data.subarray(0, 4).toString('ascii') !== 'RIFF' || data.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error(`${filePath} is not a WebP file.`);
  }

  let offset = 12;
  while (offset + 8 <= data.length) {
    const chunkType = data.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = data.readUInt32LE(offset + 4);
    const chunkOffset = offset + 8;

    if (chunkType === 'VP8 ') {
      return {
        height: data.readUInt16LE(chunkOffset + 8) & 0x3fff,
        width: data.readUInt16LE(chunkOffset + 6) & 0x3fff,
      };
    }
    if (chunkType === 'VP8L') {
      const bits = data.readUInt32LE(chunkOffset + 1);
      return {
        height: ((bits >> 14) & 0x3fff) + 1,
        width: (bits & 0x3fff) + 1,
      };
    }
    if (chunkType === 'VP8X') {
      return {
        height: data.readUIntLE(chunkOffset + 7, 3) + 1,
        width: data.readUIntLE(chunkOffset + 4, 3) + 1,
      };
    }

    offset = chunkOffset + chunkSize + (chunkSize % 2);
  }

  throw new Error(`${filePath} does not contain a supported WebP image chunk.`);
}

function loadServiceWorker(options: {
  fetch?: (request: { url: string }) => Promise<unknown>;
} = {}) {
  const handlers = new Map<string, ServiceWorkerEventHandler>();
  const cachedShell = { body: 'app shell' };
  const cacheWrites: Array<{ requestUrl: string; response: unknown }> = [];
  const cachedAssets = new Map<string, unknown>([
    ['https://svanny.github.io/kaur-khor/', cachedShell],
    ['./', cachedShell],
  ]);
  const cache = {
    addAll: async (assets: string[]) => {
      for (const asset of assets) {
        cachedAssets.set(asset, { body: asset });
      }
    },
    put: async (request: Request, response: unknown) => {
      cachedAssets.set(request.url, response);
      cacheWrites.push({ requestUrl: request.url, response });
    },
  };
  const context = {
    URL,
    caches: {
      delete: async () => true,
      keys: async () => ['kaur-khor-web-v1'],
      match: async (request: { url: string } | string) => cachedAssets.get(typeof request === 'string' ? request : request.url),
      open: async () => cache,
    },
    fetch: options.fetch ?? (async () => {
      throw new Error('offline');
    }),
    self: {
      addEventListener: (eventName: string, handler: ServiceWorkerEventHandler) => {
        handlers.set(eventName, handler);
      },
      clients: {
        claim: async () => undefined,
      },
      location: {
        origin: 'https://svanny.github.io',
      },
      skipWaiting: async () => undefined,
    },
  };

  runInNewContext(readFileSync(resolve(projectRoot, 'public/sw.js'), 'utf8'), context);

  return { cachedAssets, cachedShell, cacheWrites, handlers };
}

describe('web PWA install assets', () => {
  test('links the manifest and mobile install metadata from the web HTML shell', () => {
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');

    expect(html).toContain('content="width=device-width, initial-scale=1.0, viewport-fit=cover"');
    expect(html).toContain('<meta name="theme-color" content="#F8F1EB" />');
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="./icons/apple-touch-icon.png" />');
    expect(html).not.toContain("frame-ancestors");
  });

  test('defines installable app routes and icon assets in the web manifest', () => {
    const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'public/manifest.webmanifest'), 'utf8')) as {
      display?: string;
      icons?: Array<{ purpose?: string; src?: string }>;
      orientation?: string;
      screenshots?: Array<{ form_factor?: string; label?: string; sizes?: string; src?: string; type?: string }>;
      scope?: string;
      shortcuts?: Array<{ url?: string }>;
      start_url?: string;
    };

    expect(manifest).toMatchObject({
      display: 'standalone',
      orientation: 'any',
      scope: './',
      start_url: './app',
    });
    expect(manifest.icons).toContainEqual(expect.objectContaining({
      purpose: 'any maskable',
      sizes: '192x192',
      src: './icons/kaur-khor-icon-192.png',
      type: 'image/png',
    }));
    expect(manifest.icons).toContainEqual(expect.objectContaining({
      purpose: 'any maskable',
      sizes: '512x512',
      src: './icons/kaur-khor-icon-512.png',
      type: 'image/png',
    }));
    expect(manifest.icons).toContainEqual(expect.objectContaining({
      purpose: 'any',
      src: './icons/kaur-khor-browser-icon.svg',
    }));
    expect(manifest.screenshots).toContainEqual(expect.objectContaining({
      form_factor: 'wide',
      sizes: '1600x919',
      src: './screenshots/web-current-overview.webp',
      type: 'image/webp',
    }));
    expect(manifest.screenshots).toContainEqual(expect.objectContaining({
      form_factor: 'wide',
      sizes: '1600x919',
      src: './screenshots/web-current-catalog.webp',
      type: 'image/webp',
    }));
    expect(manifest.screenshots).toContainEqual(expect.objectContaining({
      form_factor: 'wide',
      sizes: '1600x919',
      src: './screenshots/web-current-stock-count.webp',
      type: 'image/webp',
    }));
    expect(manifest.screenshots).toContainEqual(expect.objectContaining({
      form_factor: 'narrow',
      sizes: '390x844',
      src: './screenshots/web-current-phone-today.webp',
      type: 'image/webp',
    }));
    expect(manifest.screenshots).toContainEqual(expect.objectContaining({
      form_factor: 'narrow',
      sizes: '390x844',
      src: './screenshots/web-current-phone-products.webp',
      type: 'image/webp',
    }));
    expect(manifest.screenshots).toContainEqual(expect.objectContaining({
      form_factor: 'narrow',
      sizes: '390x844',
      src: './screenshots/web-current-phone-more.webp',
      type: 'image/webp',
    }));
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(['./app', './demo']);
    expect(existsSync(resolve(projectRoot, 'public/icons/apple-touch-icon.png'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'public/icons/kaur-khor-icon-192.png'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'public/icons/kaur-khor-icon-512.png'))).toBe(true);
    expect(readPngDimensions(resolve(projectRoot, 'public/icons/apple-touch-icon.png'))).toEqual({ height: 180, width: 180 });
    expect(readPngDimensions(resolve(projectRoot, 'public/icons/kaur-khor-icon-192.png'))).toEqual({ height: 192, width: 192 });
    expect(readPngDimensions(resolve(projectRoot, 'public/icons/kaur-khor-icon-512.png'))).toEqual({ height: 512, width: 512 });
    expect(existsSync(resolve(projectRoot, 'public/screenshots/web-current-overview.webp'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'public/screenshots/web-current-catalog.webp'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'public/screenshots/web-current-stock-count.webp'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'public/screenshots/web-current-phone-today.webp'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'public/screenshots/web-current-phone-products.webp'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'public/screenshots/web-current-phone-more.webp'))).toBe(true);
    for (const screenshot of manifest.screenshots ?? []) {
      if (screenshot.src?.startsWith('./screenshots/')) {
        const screenshotFileName = screenshot.src.replace('./screenshots/', '');
        const publicScreenshot = resolve(projectRoot, 'public/screenshots', screenshotFileName);
        const docsScreenshot = resolve(projectRoot, 'docs/readme', screenshotFileName);
        const [width, height] = screenshot.sizes?.split('x').map(Number) ?? [];
        expect(existsSync(docsScreenshot)).toBe(true);
        expect(readWebpDimensions(publicScreenshot)).toEqual({ height, width });
        expect(readWebpDimensions(docsScreenshot)).toEqual({ height, width });
      }
    }
  });

  test('ships a service worker with app-shell and static-asset cache strategies only', () => {
    const serviceWorker = readFileSync(resolve(projectRoot, 'public/sw.js'), 'utf8');

    expect(serviceWorker).toContain("const CACHE_NAME = 'kaur-khor-web-v2';");
    expect(serviceWorker).toContain("const SHELL_URL = './';");
    expect(serviceWorker).toContain("'./manifest.webmanifest'");
    expect(serviceWorker).toContain("'./icons/apple-touch-icon.png'");
    expect(serviceWorker).toContain("'./icons/kaur-khor-icon-192.png'");
    expect(serviceWorker).toContain("'./icons/kaur-khor-icon-512.png'");
    expect(serviceWorker).toContain("event.request.mode === 'navigate'");
    expect(serviceWorker).toContain('cachedShellOrError(event.request)');
    expect(serviceWorker).toContain('isStaticAssetRequest(requestUrl)');
    expect(serviceWorker).toContain("requestUrl.pathname.includes('/screenshots/')");
    expect(serviceWorker).toContain('requestUrl.origin !== self.location.origin');
  });

  test('registers the service worker only for production under the deployed base path', () => {
    const entry = readFileSync(resolve(projectRoot, 'src/renderer/src/main.web.tsx'), 'utf8');

    expect(entry).toContain("const basePath = import.meta.env.BASE_URL.replace(/\\/$/, '');");
    expect(entry).toContain("if (!('serviceWorker' in navigator) || import.meta.env.DEV)");
    expect(entry).toContain('const serviceWorkerPath = `${basePath}/sw.js`;');
    expect(entry).toContain('const scope = `${basePath}/`;');
    expect(entry).toContain('navigator.serviceWorker.register(serviceWorkerPath, { scope })');
  });

  test('uses the workspace loading screen for the embedded mobile shell fallback', () => {
    const entry = readFileSync(resolve(projectRoot, 'src/renderer/src/main.web.tsx'), 'utf8');
    const embeddedApp = readFileSync(resolve(projectRoot, 'src/renderer/src/routes/web/embedded-app.tsx'), 'utf8');

    expect(entry).toContain('KAUR KHOR');
    expect(entry).toContain("embeddedMode ? 'Loading workspace…' : 'Loading preferences…'");
    expect(entry).toContain('Loading preferences…');
    expect(embeddedApp).toContain('grid min-h-svh place-items-center bg-background px-6 text-center text-foreground');
    expect(embeddedApp).toContain('Loading workspace…');
    expect(embeddedApp).not.toContain('Preparing phone workspace');
    expect(entry).not.toContain('Loading Kaur Khor');
  });

  test('keeps phone install screenshot generation aligned with the manifest', () => {
    const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const screenshotScript = readFileSync(resolve(projectRoot, 'scripts/capture-mobile-pwa-screenshots.mjs'), 'utf8');

    expect(packageJson.scripts?.['screenshots:mobile']).toBe('pnpm run build:web && node ./scripts/capture-mobile-pwa-screenshots.mjs');
    expect(screenshotScript).toContain("const screenshotDir = join(repoRoot, 'docs/readme');");
    expect(screenshotScript).toContain("const publicScreenshotDir = join(repoRoot, 'public/screenshots');");
    expect(screenshotScript).toContain("const demoUrl = `${origin}/kaur-khor/demo`;");
    expect(screenshotScript).toContain("file: 'web-current-phone-today.webp'");
    expect(screenshotScript).toContain("file: 'web-current-phone-products.webp'");
    expect(screenshotScript).toContain("file: 'web-current-phone-more.webp'");
    expect(screenshotScript).toContain('viewport: { width: 390, height: 844 }');
    expect(screenshotScript).toContain('const expectedScreenshotSize = { width: 390, height: 844 };');
    expect(screenshotScript).toContain("await execFileAsync('cwebp', ['-quiet', '-q', '82', pngPath, '-o', webpPath]);");
    expect(screenshotScript).toContain("await execFileAsync('magick', [pngPath, '-quality', '82', webpPath]);");
    expect(screenshotScript).toContain('await cp(webpPath, publicWebpPath);');
    expect(screenshotScript).toContain('await verifyWebpDimensions(webpPath, expectedScreenshotSize);');
    expect(screenshotScript).toContain('await verifyWebpDimensions(publicWebpPath, expectedScreenshotSize);');
  });

  test('refreshes online navigations before using the cached shell fallback', async () => {
    const freshShell = {
      body: 'fresh shell',
      clone: () => ({ body: 'fresh shell clone' }),
      ok: true,
    };
    const { cacheWrites, handlers } = loadServiceWorker({
      fetch: async () => freshShell,
    });
    const fetchHandler = handlers.get('fetch');
    let responsePromise: Promise<unknown> | null = null;

    fetchHandler?.({
      request: {
        method: 'GET',
        mode: 'navigate',
        url: 'https://svanny.github.io/kaur-khor/app',
      },
      respondWith: (response) => {
        responsePromise = response;
      },
      waitUntil: async () => undefined,
    });

    await expect(responsePromise).resolves.toBe(freshShell);
    expect(cacheWrites).toContainEqual({
      requestUrl: 'https://svanny.github.io/kaur-khor/app',
      response: { body: 'fresh shell clone' },
    });
  });

  test('falls back to the cached shell for offline app navigations', async () => {
    const { cachedShell, handlers } = loadServiceWorker();
    const fetchHandler = handlers.get('fetch');
    let responsePromise: Promise<unknown> | null = null;

    fetchHandler?.({
      request: {
        method: 'GET',
        mode: 'navigate',
        url: 'https://svanny.github.io/kaur-khor/app',
      },
      respondWith: (response) => {
        responsePromise = response;
      },
      waitUntil: async () => undefined,
    });

    await expect(responsePromise).resolves.toBe(cachedShell);
  });

  test('serves static app assets from cache before hitting the network', async () => {
    const cachedChunk = { body: 'cached chunk' };
    const { cachedAssets, handlers } = loadServiceWorker({
      fetch: async () => {
        throw new Error('should not fetch cached assets');
      },
    });
    cachedAssets.set('https://svanny.github.io/kaur-khor/assets/index.js', cachedChunk);
    const fetchHandler = handlers.get('fetch');
    let responsePromise: Promise<unknown> | null = null;

    fetchHandler?.({
      request: {
        method: 'GET',
        url: 'https://svanny.github.io/kaur-khor/assets/index.js',
      },
      respondWith: (response) => {
        responsePromise = response;
      },
      waitUntil: async () => undefined,
    });

    await expect(responsePromise).resolves.toBe(cachedChunk);
  });

  test('ignores same-origin non-static fetches instead of caching workspace data', () => {
    const { handlers } = loadServiceWorker();
    const fetchHandler = handlers.get('fetch');
    let responsePromise: Promise<unknown> | null = null;

    fetchHandler?.({
      request: {
        method: 'GET',
        url: 'https://svanny.github.io/kaur-khor/workspace/export.json',
      },
      respondWith: (response) => {
        responsePromise = response;
      },
      waitUntil: async () => undefined,
    });

    expect(responsePromise).toBeNull();
  });

  test('ignores cross-origin fetches instead of proxying them through the cache', () => {
    const { handlers } = loadServiceWorker();
    const fetchHandler = handlers.get('fetch');
    let responsePromise: Promise<unknown> | null = null;

    fetchHandler?.({
      request: {
        method: 'GET',
        url: 'https://api.github.com/repos/Svanny/kaur-khor/releases/latest',
      },
      respondWith: (response) => {
        responsePromise = response;
      },
      waitUntil: async () => undefined,
    });

    expect(responsePromise).toBeNull();
  });
});
