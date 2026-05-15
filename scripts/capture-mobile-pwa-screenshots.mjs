#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { chromium } from 'playwright';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = join(repoRoot, 'docs/readme');
const publicScreenshotDir = join(repoRoot, 'public/screenshots');
const host = process.env.KAUR_KHOR_MOBILE_SCREENSHOT_HOST ?? '127.0.0.1';
const port = Number(process.env.KAUR_KHOR_MOBILE_SCREENSHOT_PORT ?? 5188);
const origin = `http://${host}:${port}`;
const demoUrl = `${origin}/kaur-khor/demo`;
const execFileAsync = promisify(execFile);
const expectedScreenshotSize = { width: 390, height: 844 };

const captures = [
  {
    file: 'web-current-phone-today.webp',
    name: 'phone Today shell',
    selector: '[data-slot="phone-today-page"]',
    setup: async (page) => {
      await page.getByRole('navigation', { name: 'Phone navigation' }).getByRole('link', { name: 'Today' }).click();
    },
  },
  {
    file: 'web-current-phone-products.webp',
    name: 'phone Products shell',
    selector: '[data-slot="phone-products-page"]',
    setup: async (page) => {
      await page.getByRole('navigation', { name: 'Phone navigation' }).getByRole('link', { name: 'Products' }).click();
    },
  },
  {
    file: 'web-current-phone-more.webp',
    name: 'phone workspace safety',
    selector: '[data-slot="phone-more-page"]',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Workspace safety' }).click();
      await page.getByRole('link', { name: 'Open settings' }).click();
    },
  },
];

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
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

async function verifyWebpDimensions(webpPath, expectedSize) {
  const dimensions = readWebpDimensions(await readFile(webpPath), webpPath);
  if (dimensions.width !== expectedSize.width || dimensions.height !== expectedSize.height) {
    throw new Error(`${webpPath} expected ${expectedSize.width}x${expectedSize.height}, got ${dimensions.width}x${dimensions.height}`);
  }
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

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error(`Timed out waiting for vite preview at ${origin}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function completeOnboardingIfPresent(page) {
  await page.goto(demoUrl, { waitUntil: 'load' });
  await Promise.race([
    page.locator('[data-slot="embedded-phone-shell"]').waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'shell'),
    page.getByRole('heading', { name: 'Set up Kaur Khor' }).waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'onboarding'),
  ]);

  if (await page.locator('[data-slot="embedded-phone-shell"]').isVisible().catch(() => false)) {
    return;
  }

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Choose interface view' }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('[data-slot="embedded-phone-shell"]').waitFor({ state: 'visible', timeout: 15_000 });
}

async function writeWebpScreenshot(pngPath, webpPath) {
  try {
    await execFileAsync('cwebp', ['-quiet', '-q', '82', pngPath, '-o', webpPath]);
    return;
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  await execFileAsync('magick', [pngPath, '-quality', '82', webpPath]);
}

async function captureWebp(page, capture) {
  await capture.setup(page);
  await page.locator(capture.selector).waitFor({ state: 'visible', timeout: 15_000 });
  await page.evaluate(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    document.querySelector('[data-slot="embedded-phone-main"]')?.scrollTo(0, 0);
    document.querySelector('[data-slot="embedded-auto-zoom-viewport"]')?.scrollTo(0, 0);
  });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.waitForTimeout(500);

  const pngPath = join(screenshotDir, capture.file.replace(/\.webp$/, '.png'));
  const webpPath = join(screenshotDir, capture.file);
  const publicWebpPath = join(publicScreenshotDir, capture.file);
  await page.screenshot({ animations: 'disabled', fullPage: true, path: pngPath });
  await writeWebpScreenshot(pngPath, webpPath);
  await mkdir(dirname(publicWebpPath), { recursive: true });
  await cp(webpPath, publicWebpPath);
  await verifyWebpDimensions(webpPath, expectedScreenshotSize);
  await verifyWebpDimensions(publicWebpPath, expectedScreenshotSize);
  await rm(pngPath, { force: true });
  console.log(`${capture.name} -> ${capture.file}`);
}

async function main() {
  const preview = run('pnpm', [
    'exec',
    'vite',
    'preview',
    '--config',
    'vite.web.config.ts',
    '--host',
    host,
    '--port',
    String(port),
  ], {
    cwd: repoRoot,
  });

  preview.stdout.on('data', (chunk) => process.stdout.write(chunk));
  preview.stderr.on('data', (chunk) => process.stderr.write(chunk));

  let browser;
  try {
    await mkdir(screenshotDir, { recursive: true });
    await waitForPreview(preview);

    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await completeOnboardingIfPresent(page);

    for (const capture of captures) {
      await captureWebp(page, capture);
    }
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
