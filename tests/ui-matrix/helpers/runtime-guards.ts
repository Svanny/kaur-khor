import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface PageIssueCollector {
  assertNoIssues: (context: string) => void;
  clear: () => void;
  issues: string[];
}

const IGNORED_CONSOLE_PATTERNS = [
  /\[browser-mock\] installed mock kaurKhorDesktop bridge/i,
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'capture';
}

export function attachPageIssueCollector(page: Page): PageIssueCollector {
  const issues: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    const text = message.text();
    if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) {
      return;
    }
    issues.push(`console.error: ${text}`);
  });

  page.on('pageerror', (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!/^https?:/i.test(url)) {
      return;
    }
    if (request.failure()?.errorText === 'net::ERR_ABORTED' && /\/(?:kaur-khor\/)?src\//.test(url)) {
      return;
    }
    issues.push(`requestfailed: ${request.method()} ${url} ${request.failure()?.errorText ?? ''}`.trim());
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) {
      return;
    }
    issues.push(`response: ${status} ${response.url()}`);
  });

  return {
    issues,
    clear() {
      issues.splice(0, issues.length);
    },
    assertNoIssues(context: string) {
      expect(issues, `${context} should not emit runtime errors`).toEqual([]);
    },
  };
}

export async function captureUi(page: Page, testInfo: TestInfo, name: string) {
  const directory = join(testInfo.outputDir, 'captures');
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${slugify(name)}.png`);
  const screenshot = await page.screenshot({ animations: 'disabled', fullPage: true, path });
  expect(screenshot.length, `${name} capture should contain rendered image data`).toBeGreaterThan(1_000);
  await testInfo.attach(`${slugify(name)}.png`, {
    contentType: 'image/png',
    path,
  });
  return path;
}

export async function assertNoDocumentOverflow(page: Page, context: string) {
  const overflow = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    const widthOverflow = Math.max(
      0,
      documentElement.scrollWidth - documentElement.clientWidth,
      body ? body.scrollWidth - window.innerWidth : 0,
    );
    const visibleWideElements = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > window.innerWidth + 2 && rect.left < window.innerWidth && rect.right > 0;
      })
      .slice(0, 5)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        slot: element.getAttribute('data-slot'),
        testId: element.getAttribute('data-testid'),
        role: element.getAttribute('role'),
        width: Math.round(element.getBoundingClientRect().width),
      }));
    return {
      widthOverflow,
      visibleWideElements,
    };
  });

  expect(
    overflow.widthOverflow,
    `${context} should not create document-level horizontal overflow: ${JSON.stringify(overflow.visibleWideElements)}`,
  ).toBeLessThanOrEqual(3);
}

export async function assertNoBrokenNumericText(page: Page, context: string) {
  const brokenText = await page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    return /\bNaN\b|Invalid Date|Infinity|undefined/.test(text) ? text.match(/\bNaN\b|Invalid Date|Infinity|undefined/)?.[0] ?? null : null;
  });
  expect(brokenText, `${context} should not show broken numeric/date placeholder text`).toBeNull();
}

export async function assertRenderedContent(page: Page, context: string) {
  await page.waitForFunction(() => {
    const bodyTextLength = (document.body?.innerText.trim() || document.body?.textContent?.trim() || '').length;
    return bodyTextLength > 0;
  }, undefined, { timeout: 5_000 });

  const content = await page.evaluate(() => {
    const body = document.body;
    const visibleText = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 1
          && rect.height > 1
          && rect.bottom > 0
          && rect.right > 0
          && rect.left < window.innerWidth
          && rect.top < window.innerHeight;
      })
      .map((element) => element.innerText?.trim() || element.textContent?.trim() || element.getAttribute('aria-label')?.trim() || '')
      .filter(Boolean)
      .slice(0, 20);

    return {
      bodyTextLength: (body?.innerText.trim() || body?.textContent?.trim() || '').length,
      title: document.title,
      visibleText,
    };
  });
  expect(
    content.bodyTextLength,
    `${context} should render visible textual content: ${JSON.stringify(content.visibleText)}`,
  ).toBeGreaterThan(0);
}

export async function assertInteractiveControlsStable(page: Page, context: string) {
  const collectUnstableControls = () => page.evaluate(() => {
    const selectors = [
      'button',
      'a[href]',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="combobox"]',
      '[role="textbox"]',
      '[role="checkbox"]',
      '[role="tab"]',
      '[role="menuitem"]',
    ].join(',');

    return Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && element.dataset.uiMatrixAllowClipped !== 'true'
          && !element.matches('[data-slot="skip-link"], .sr-only, .sr-only-focusable, [class*="sr-only"]')
          && !(element.tagName.toLowerCase() === 'select' && rect.width <= 1 && rect.height <= 1)
          && !element.className.toString().includes('-translate-y-')
          && rect.width > 0
          && rect.height > 0
          && rect.bottom > 0
          && rect.right > 0
          && rect.left < window.innerWidth
          && rect.top < window.innerHeight;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = element.innerText?.trim() || element.getAttribute('aria-label') || element.getAttribute('placeholder') || '';
        const ariaLabel = element.getAttribute('aria-label');
        const role = element.getAttribute('role');
        const clipsText = text.length > 0
          && role !== 'combobox'
          && role !== 'tab'
          && (element.scrollWidth - element.clientWidth > 4 || element.scrollHeight - element.clientHeight > 4);
        const isIconMarker = element.tagName.toLowerCase() === 'button' && text.length <= 3 && (ariaLabel?.startsWith('Select ') ?? false);
        const isHelpTrigger = element.tagName.toLowerCase() === 'button' && /\bhelp$/i.test(ariaLabel ?? '');
        const isCompactSwitch = role === 'switch';
        const tooSmall = !isIconMarker && !isHelpTrigger && !isCompactSwitch && (rect.width < 6 || rect.height < 6);
        return {
          ariaLabel,
          clipsText,
          height: Math.round(rect.height),
          role,
          tag: element.tagName.toLowerCase(),
          testId: element.getAttribute('data-testid'),
          text: text.slice(0, 80),
          tooSmall,
          width: Math.round(rect.width),
        };
      })
      .filter((entry) => entry.clipsText || entry.tooSmall)
      .slice(0, 8);
  });
  const unstableControls = await collectUnstableControls().catch(async (error: unknown) => {
    if (error instanceof Error && /Execution context was destroyed/i.test(error.message)) {
      await page.waitForLoadState('domcontentloaded');
      return collectUnstableControls();
    }
    throw error;
  });

  expect(
    unstableControls,
    `${context} should not expose clipped or collapsed interactive controls`,
  ).toEqual([]);
}

export async function assertViewportSizeStable(page: Page, context: string) {
  const first = page.viewportSize();
  await page.waitForTimeout(100);
  const second = page.viewportSize();
  expect(second, `${context} should not mutate the Playwright viewport unexpectedly`).toEqual(first);
}

export async function assertUiStable(page: Page, context: string) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(250);
  await assertRenderedContent(page, context);
  await assertNoDocumentOverflow(page, context);
  await assertNoBrokenNumericText(page, context);
  await assertInteractiveControlsStable(page, context);
  await assertViewportSizeStable(page, context);
}

export async function scrollMainSurface(page: Page) {
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(150);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('main *, [role="dialog"] *, [data-radix-scroll-area-viewport]'))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const canScrollY = element.scrollHeight - element.clientHeight > 12;
        const canScrollX = element.scrollWidth - element.clientWidth > 12;
        return (canScrollY || canScrollX)
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 16
          && rect.height > 16
          && rect.bottom > 0
          && rect.right > 0
          && rect.left < window.innerWidth
          && rect.top < window.innerHeight;
      })
      .slice(0, 8);

    for (const element of candidates) {
      const originalTop = element.scrollTop;
      const originalLeft = element.scrollLeft;
      element.scrollTop = element.scrollHeight;
      element.scrollLeft = element.scrollWidth;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
      element.scrollTop = originalTop;
      element.scrollLeft = originalLeft;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
  });
  await page.waitForTimeout(150);
}

export async function navigateHashRoute(page: Page, route: `/${string}`) {
  const setRouteHash = () =>
    page.evaluate((nextRoute) => {
      window.location.hash = `#${nextRoute}`;
    }, route);
  await setRouteHash();
  let reachedRoute = await page.waitForFunction((expectedRoute) => window.location.hash.slice(1) === expectedRoute, route, { timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!reachedRoute) {
    const leaveDialog = page.getByRole('dialog', { name: 'Leave record update?' });
    if (await leaveDialog.isVisible().catch(() => false)) {
      await leaveDialog.getByRole('button', { name: 'Discard changes' }).click();
      await leaveDialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
      await setRouteHash();
    } else {
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      await setRouteHash();
    }
    reachedRoute = await page.waitForFunction((expectedRoute) => window.location.hash.slice(1) === expectedRoute, route, { timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!reachedRoute) {
    await setRouteHash();
  }
  await page.waitForFunction((expectedRoute) => window.location.hash.slice(1) === expectedRoute, route);
  await page.waitForTimeout(300);
}

export async function verifyBackForward(page: Page, firstRoute: `/${string}`, secondRoute: `/${string}`) {
  await navigateHashRoute(page, firstRoute);
  await navigateHashRoute(page, secondRoute);
  await page.goBack();
  await page.waitForFunction((expectedRoute) => window.location.hash.slice(1) === expectedRoute, firstRoute);
  await page.goForward();
  await page.waitForFunction((expectedRoute) => window.location.hash.slice(1) === expectedRoute, secondRoute);
}
