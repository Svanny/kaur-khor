#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const host = process.env.KAUR_KHOR_PWA_HOST ?? '127.0.0.1';
const port = Number(process.env.KAUR_KHOR_PWA_PORT ?? 5187);
const origin = `http://${host}:${port}`;
const appUrl = `${origin}/kaur-khor/app`;
const manifestUrl = `${origin}/kaur-khor/manifest.webmanifest`;

function readPngDimensions(data, label) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  if (!data.subarray(0, 8).equals(signature)) {
    throw new Error(`${label} is not a PNG file`);
  }
  return {
    height: data.readUInt32BE(20),
    width: data.readUInt32BE(16),
  };
}

function readWebpDimensions(data, label) {
  if (data.subarray(0, 4).toString('ascii') !== 'RIFF' || data.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error(`${label} is not a WebP file`);
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

  throw new Error(`${label} does not contain a supported WebP image chunk`);
}

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

async function waitForPreview(child) {
  const deadline = Date.now() + 60_000;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`vite preview exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${origin}/kaur-khor/`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`preview returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for vite preview at ${origin}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function expectVisible(page, selector, label) {
  await page.locator(selector).waitFor({ state: 'visible', timeout: 15_000 }).catch((error) => {
    return page.evaluate(() => ({
      bodyText: document.body.innerText.slice(0, 800),
      hash: window.location.hash,
      pathname: window.location.pathname,
      slots: Array.from(document.querySelectorAll('[data-slot]'))
        .slice(0, 40)
        .map((element) => element.getAttribute('data-slot')),
    })).then((snapshot) => {
      throw new Error(
        `Expected ${label} to be visible: ${error instanceof Error ? error.message : String(error)}\n`
        + `Current route: ${snapshot.pathname}${snapshot.hash}\n`
        + `Visible text: ${snapshot.bodyText}\n`
        + `Data slots: ${snapshot.slots.join(', ')}`,
      );
    });
  });
}

async function completeOnboardingIfPresent(page) {
  await Promise.race([
    page.locator('[data-slot="embedded-phone-shell"]').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'shell'),
    page.getByRole('heading', { name: 'Set up Kaur Khor' }).waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'onboarding'),
  ]).catch(() => undefined);

  if (await page.locator('[data-slot="embedded-phone-shell"]').isVisible().catch(() => false)) {
    return;
  }

  await page.getByRole('heading', { name: 'Set up Kaur Khor' }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Choose interface view' }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(() => window.location.hash === '#/' || window.location.hash === '', undefined, { timeout: 10_000 });
}

async function verifyManifestAssets() {
  const shellResponse = await fetch(`${origin}/kaur-khor/`);
  if (!shellResponse.ok) {
    throw new Error(`HTML shell request failed with ${shellResponse.status}`);
  }
  const html = await shellResponse.text();
  const requiredHtmlSnippets = [
    'content="width=device-width, initial-scale=1.0, viewport-fit=cover"',
    '<meta name="theme-color" content="#F8F1EB"',
    '<meta name="mobile-web-app-capable" content="yes"',
    '<meta name="apple-mobile-web-app-capable" content="yes"',
    '<meta name="apple-mobile-web-app-title" content="Kaur Khor"',
    '<link rel="manifest" href="./manifest.webmanifest"',
    '<link rel="apple-touch-icon" sizes="180x180" href="./icons/apple-touch-icon.png"',
  ];
  for (const snippet of requiredHtmlSnippets) {
    if (!html.includes(snippet)) {
      throw new Error(`HTML shell is missing required mobile install metadata: ${snippet}`);
    }
  }
  const appleTouchResponse = await fetch(`${origin}/kaur-khor/icons/apple-touch-icon.png`);
  if (!appleTouchResponse.ok) {
    throw new Error(`Apple touch icon failed with ${appleTouchResponse.status}`);
  }
  const appleTouchIcon = Buffer.from(await appleTouchResponse.arrayBuffer());
  const appleTouchDimensions = readPngDimensions(appleTouchIcon, './icons/apple-touch-icon.png');
  if (appleTouchDimensions.width !== 180 || appleTouchDimensions.height !== 180) {
    throw new Error(`Apple touch icon expected 180x180, got ${appleTouchDimensions.width}x${appleTouchDimensions.height}`);
  }

  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) {
    throw new Error(`Manifest request failed with ${manifestResponse.status}`);
  }

  const manifest = await manifestResponse.json();
  const expectedManifest = {
    display: 'standalone',
    orientation: 'any',
    scope: './',
    start_url: './app',
  };
  for (const [key, value] of Object.entries(expectedManifest)) {
    if (manifest[key] !== value) {
      throw new Error(`Manifest ${key} expected ${value}, got ${manifest[key] ?? 'missing'}`);
    }
  }

  for (const icon of manifest.icons ?? []) {
    const response = await fetch(new URL(icon.src, manifestUrl));
    if (!response.ok) {
      throw new Error(`Manifest icon ${icon.src} failed with ${response.status}`);
    }
    if (icon.type === 'image/png') {
      const [width, height] = icon.sizes.split('x').map(Number);
      const data = Buffer.from(await response.arrayBuffer());
      const dimensions = readPngDimensions(data, icon.src);
      if (dimensions.width !== width || dimensions.height !== height) {
        throw new Error(`Manifest icon ${icon.src} expected ${icon.sizes}, got ${dimensions.width}x${dimensions.height}`);
      }
    }
  }

  for (const screenshot of manifest.screenshots ?? []) {
    const response = await fetch(new URL(screenshot.src, manifestUrl));
    if (!response.ok) {
      throw new Error(`Manifest screenshot ${screenshot.src} failed with ${response.status}`);
    }
    if (screenshot.type === 'image/webp') {
      const [width, height] = screenshot.sizes.split('x').map(Number);
      const data = Buffer.from(await response.arrayBuffer());
      const dimensions = readWebpDimensions(data, screenshot.src);
      if (dimensions.width !== width || dimensions.height !== height) {
        throw new Error(`Manifest screenshot ${screenshot.src} expected ${screenshot.sizes}, got ${dimensions.width}x${dimensions.height}`);
      }
    }
  }
}

async function verifyPhoneShell(page) {
  await completeOnboardingIfPresent(page);
  await expectVisible(page, '[data-slot="embedded-phone-shell"]', 'phone shell');
  await expectVisible(page, '[data-slot="phone-today-page"]', 'phone Today route');

  const phoneNav = page.getByRole('navigation', { name: 'Phone navigation' });
  await phoneNav.getByRole('link', { name: 'Products' }).click();
  await expectVisible(page, '[data-slot="phone-products-page"]', 'phone Products route');
  const sampleSku = page.locator('[data-slot="phone-list-item"][href="#/catalog/skus/sku-001"]');
  if (await sampleSku.isVisible().catch(() => false)) {
    await sampleSku.click();
    await expectVisible(page, '[data-slot="phone-product-detail-page"]', 'phone product detail route');
  } else {
    await expectVisible(page, '[data-slot="phone-products-search"]', 'phone product search');
    await page.getByText('No products yet. Create your first SKU or service to start tracking stock and sellability.').waitFor({ state: 'visible', timeout: 15_000 });
  }

  await phoneNav.getByRole('link', { name: 'Capture' }).click();
  await expectVisible(page, '[data-slot="phone-capture-page"]', 'phone Capture route');
  const stockCountLink = page.getByRole('link', { name: 'Products Update' });
  if (await stockCountLink.isVisible().catch(() => false)) {
    await stockCountLink.click();
    await Promise.all([
      page.locator('[data-slot="phone-capture-session-header"]').waitFor({ state: 'visible', timeout: 15_000 }),
      page.locator('[data-slot="phone-capture-lane-summary"]').waitFor({ state: 'visible', timeout: 15_000 }),
    ]);
  } else {
    await page.getByText('Create a SKU or service before recording updates.').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByRole('link', { name: 'Open products' }).waitFor({ state: 'visible', timeout: 15_000 });
  }

  await page.evaluate(() => {
    window.location.hash = '#/';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await expectVisible(page, '[data-slot="phone-today-page"]', 'phone Today route');
  await page.getByRole('button', { name: 'Workspace safety' }).click();
  await page.getByRole('link', { name: 'Open settings' }).click();
  await expectVisible(page, '[data-slot="phone-more-page"]', 'phone More route');
  await expectVisible(page, '[data-slot="phone-workspace-safety"]', 'phone workspace safety controls');
}

async function main() {
  const preview = run('pnpm', [
    'exec',
    'vite',
    'preview',
    '--config',
    'config/build/vite.web.config.ts',
    '--host',
    host,
    '--port',
    String(port),
  ]);

  preview.stdout.on('data', (chunk) => process.stdout.write(chunk));
  preview.stderr.on('data', (chunk) => process.stderr.write(chunk));

  let browser;
  try {
    await waitForPreview(preview);
    await verifyManifestAssets();

    browser = await chromium.launch();
    const context = await browser.newContext({
      serviceWorkers: 'allow',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();

    await page.goto(appUrl, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        });
      }
    });

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await verifyPhoneShell(page);

    await context.setOffline(true);
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await verifyPhoneShell(page);

    const serviceWorkerUrl = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
    if (!serviceWorkerUrl?.endsWith('/kaur-khor/sw.js')) {
      throw new Error(`Unexpected service worker controller: ${serviceWorkerUrl ?? 'none'}`);
    }

    console.log(`[pwa] manifest assets and offline phone shell verified at ${appUrl}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    preview.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
