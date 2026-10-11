import { expect, test, type Page } from '@playwright/test';
import { UI_MATRIX_CASES } from '../matrix-cases';
import {
  closeDesktopUiMatrix,
  desktopWindowGeometry,
  desktopWorkspaceCounts,
  firstActiveCatalogTargets,
  launchDesktopUiMatrix,
  resizeDesktopWindow,
  type LaunchedUiMatrixDesktop,
} from '../helpers/desktop';
import {
  assertUiStable,
  captureUi,
  navigateHashRoute,
  scrollMainSurface,
  verifyBackForward,
} from '../helpers/runtime-guards';

const generatedFixtureSizes = ['minimal', 'medium', 'heavy'] as const;

type GeneratedFixtureSize = typeof generatedFixtureSizes[number];

function generatedCaptureName(fixtureSize: GeneratedFixtureSize, capture: string) {
  return `generated-${fixtureSize}-${capture}`;
}

async function tradingChartWindowMetrics(page: Page) {
  return page.getByTestId('sku-trading-chart').evaluate((chart) => {
    const ledger = chart.closest('section');
    const controls = ledger?.querySelector<HTMLElement>('[data-testid="trading-chart-controls"]') ?? null;
    const chartRect = chart.getBoundingClientRect();
    const ledgerRect = ledger?.getBoundingClientRect();
    const controlsRect = controls?.getBoundingClientRect();
    const ledgerStyle = ledger ? window.getComputedStyle(ledger) : null;
    const rect = (element: Element) => {
      const { top, bottom, left, right, height, width } = element.getBoundingClientRect();
      return { top, bottom, left, right, height, width };
    };
    return {
      chartHeight: chartRect.height,
      ledgerHeight: ledgerRect?.height ?? 0,
      controlsBottom: controlsRect?.bottom ?? 0,
      ledgerBottom: ledgerRect?.bottom ?? 0,
      ledgerScrollTop: ledger?.scrollTop ?? 0,
      ledgerMinHeight: Number.parseFloat(ledgerStyle?.minHeight ?? '0'),
      ledgerOverflowY: ledgerStyle?.overflowY ?? '',
      rootRem: Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize),
      ledgerRect: ledger ? rect(ledger) : null,
      headerRect: ledger?.firstElementChild ? rect(ledger.firstElementChild) : null,
      chartRect: rect(chart),
      controlsRect: controls ? rect(controls) : null,
      controlRects: controls ? Array.from(controls.querySelectorAll('button')).map(rect) : [],
      viewportHeight: window.innerHeight,
    };
  });
}

async function captureTradingChartGeometry(launched: LaunchedUiMatrixDesktop, surface: string) {
  const window = await desktopWindowGeometry(launched);
  const metrics = await tradingChartWindowMetrics(launched.page);
  console.log('[ui-matrix:chart]', JSON.stringify({ surface, window, metrics }));
  return metrics;
}

function expectSharedTradingChartWindow(metrics: Awaited<ReturnType<typeof tradingChartWindowMetrics>>, surface: string, fixedGeometry = true) {
  const minimumWindowHeight = metrics.viewportHeight * 0.84 + metrics.rootRem * 16;
  expect(metrics.chartHeight, `${surface} chart should consume the shared chart window after ledger controls`).toBeGreaterThanOrEqual(metrics.viewportHeight * 0.84 - 120);
  expect(metrics.chartHeight, `${surface} chart should not exceed the shared chart-window plot target`).toBeLessThanOrEqual(metrics.viewportHeight * 0.84 + 12);
  if (fixedGeometry) {
    expect(metrics.ledgerHeight, `${surface} default chart and controls should fit the fixed shared window`).toBeLessThanOrEqual(minimumWindowHeight + 4);
  }
  expect(metrics.ledgerHeight, `${surface} chart window should reserve space for its controls`).toBeGreaterThanOrEqual(metrics.viewportHeight * 0.84 + 192 - 4);
  expect(metrics.ledgerMinHeight, `${surface} chart window should own the viewport minimum`).toBeGreaterThanOrEqual(minimumWindowHeight - 4);
  expect(metrics.ledgerMinHeight, `${surface} chart window should own the viewport minimum`).toBeLessThanOrEqual(minimumWindowHeight + 4);
  expect(metrics.ledgerHeight, `${surface} rendered ledger should satisfy its minimum height`).toBeGreaterThanOrEqual(metrics.ledgerMinHeight - 1);
  expect(metrics.ledgerOverflowY, `${surface} chart window should leave its header and controls unclipped`).toBe('visible');
  expect(metrics.ledgerScrollTop, `${surface} chart window should not retain internal scroll state`).toBe(0);
  expect(metrics.controlsBottom, `${surface} chart controls should not be clipped by the ledger window`).toBeLessThanOrEqual(metrics.ledgerBottom + 1);
  expect(metrics.ledgerRect).not.toBeNull();
  expect(metrics.headerRect).not.toBeNull();
  expect(metrics.controlsRect).not.toBeNull();
  for (const rect of [metrics.headerRect!, metrics.chartRect, metrics.controlsRect!]) {
    expect(rect.left, `${surface} chart content should stay inside the ledger's left edge`).toBeGreaterThanOrEqual(metrics.ledgerRect!.left - 1);
    expect(rect.right, `${surface} chart content should stay inside the ledger's right edge`).toBeLessThanOrEqual(metrics.ledgerRect!.right + 1);
    expect(rect.top, `${surface} chart content should stay below the ledger's top edge`).toBeGreaterThanOrEqual(metrics.ledgerRect!.top - 1);
    expect(rect.bottom, `${surface} chart content should stay above the ledger's bottom edge`).toBeLessThanOrEqual(metrics.ledgerRect!.bottom + 1);
  }
  expect(metrics.controlRects.length, `${surface} should retain chart controls`).toBeGreaterThan(0);
  for (const rect of metrics.controlRects) {
    expect(rect.left).toBeGreaterThanOrEqual(metrics.controlsRect!.left - 1);
    expect(rect.right).toBeLessThanOrEqual(metrics.controlsRect!.right + 1);
    expect(rect.top).toBeGreaterThanOrEqual(metrics.controlsRect!.top - 1);
    expect(rect.bottom).toBeLessThanOrEqual(metrics.controlsRect!.bottom + 1);
  }
}

async function expectReachableTradingChartControls(page: Page) {
  const controls = page.getByTestId('trading-chart-controls');
  await controls.scrollIntoViewIfNeeded();
  await expect(controls).toBeInViewport({ ratio: 1 });
}

async function assertGeneratedRoute(page: Page, route: `/${string}`, hasObservations: boolean) {
  if (route === '/') {
    await expect(page.getByText('Command home')).toBeVisible();
    await expect(page.getByRole('link', { name: /Open Products/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Open Inventory/i })).toHaveAttribute('href', /#\/insights\/inventory/);
    await expect(page.getByRole('link', { name: /Open Insights/i })).toHaveCount(0);
    return;
  }
  if (route === '/work/queue') {
    if (hasObservations) {
      await expect(page.getByRole('heading', { name: 'Task queue' })).toBeVisible();
      await expect(page.getByRole('searchbox', { name: 'Search queue' })).toBeVisible();
    } else {
      await expect(page.getByText('Work needs your first update')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Start update' })).toBeVisible();
    }
    return;
  }
  if (route === '/work/capture') {
    await expect(page.getByRole('link', { name: 'Products Update' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Supplier Order' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Customer Order' })).toBeVisible();
    return;
  }
  if (route === '/catalog') {
    await expect(page.getByText('Offered Selections')).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search products' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Filter by supplier' })).toBeVisible();
    return;
  }
  if (route === '/insights') {
    await expect(page.getByText('Understand what needs attention')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Inventory' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Money' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explain' })).toBeVisible();
    return;
  }
  if (route === '/insights/inventory') {
    await expect(page.getByRole('heading', { name: hasObservations ? 'Inventory' : 'Inventory analysis is not ready yet.' })).toBeVisible();
    if (hasObservations) {
      await expect(page.getByText('Inventory health grid')).toBeVisible();
    }
    return;
  }
  if (route === '/insights/money') {
    await expect(page.getByText(hasObservations ? 'Money' : 'Money needs the first SENA run', { exact: true }).first()).toBeVisible();
    if (hasObservations) {
      await expect(page.getByRole('combobox', { name: 'Select financials time range' })).toBeVisible();
    }
    return;
  }
  if (route === '/insights/explain') {
    await expect(page.getByText(hasObservations ? 'Explain' : 'Explain needs the first SENA run', { exact: true }).first()).toBeVisible();
    return;
  }
  if (route.startsWith('/settings/history')) {
    await expect(page.getByText('History', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search observations' })).toBeVisible();
    if (!hasObservations) {
      await expect(page.getByText('No observations match the current filters.')).toBeVisible();
    }
    return;
  }
  if (route === '/settings/automation') {
    await expect(page.getByText(/Automated Telegram Bot|Automations and intake/).first()).toBeVisible();
  }
}

test.describe('UI matrix: desktop autogenerated state', () => {
  for (const fixtureSize of generatedFixtureSizes) {
    test(`generated ${fixtureSize} workspace route sweep and controls stay stable`, async ({}, testInfo) => {
      testInfo.annotations.push({
        type: 'ui-matrix',
        description: UI_MATRIX_CASES.find((entry) => entry.id === 'desktop-generated-route-and-control-sweep')?.expectedUi ?? '',
      });

      const launched = await launchDesktopUiMatrix({
        fixtureSize,
        name: `desktop-generated-${fixtureSize}`,
        testInfo,
      });

      try {
        await launched.page.waitForLoadState('domcontentloaded');
        // Keep the fixed geometry contract independent of the host display.
        await resizeDesktopWindow(launched, { width: 1760, height: 1000 }, 'content');
        expect((await desktopWindowGeometry(launched)).viewport).toEqual({ width: 1760, height: 1000 });
        const counts = await desktopWorkspaceCounts(launched.page);
        expect(counts.skuCount, 'generated fixture should include SKUs').toBeGreaterThan(0);
        expect(counts.serviceCount, 'generated fixture should include services').toBeGreaterThan(0);
        expect(counts.observationCount, `${fixtureSize} generated fixture should include observations`).toBeGreaterThan(0);
        if (fixtureSize !== 'minimal') {
          expect(counts.summaryIntervalCount, `${fixtureSize} generated fixture should include summary intervals`).toBeGreaterThan(0);
        }

        const targets = await firstActiveCatalogTargets(launched.page);
        expect(targets.skuId, 'generated fixture should expose an active SKU detail target').toBeTruthy();
        expect(targets.serviceId, 'generated fixture should expose an active service detail target').toBeTruthy();
        const hasObservations = counts.observationCount > 0;

        const routes: Array<{ capture: string; route: `/${string}` }> = [
          { route: '/', capture: 'home' },
          { route: '/work/capture', capture: 'capture-hub' },
          { route: '/catalog', capture: 'catalog' },
          { route: '/insights', capture: 'insights' },
          { route: '/insights/money', capture: 'insights-money' },
          { route: '/settings/history?view=all', capture: 'history' },
          { route: '/settings/automation', capture: 'automation-settings' },
          { route: '/insights/inventory', capture: 'insights-inventory' },
          { route: '/work/queue', capture: 'work-queue' },
          { route: '/insights/explain', capture: 'insights-explain' },
        ];

        for (const routeCase of routes) {
          await navigateHashRoute(launched.page, routeCase.route);
          await assertGeneratedRoute(launched.page, routeCase.route, hasObservations);
          await scrollMainSurface(launched.page);
          await assertUiStable(launched.page, `generated route ${routeCase.route}`);
          await captureUi(launched.page, testInfo, generatedCaptureName(fixtureSize, routeCase.capture));
        }

        await navigateHashRoute(launched.page, '/catalog');
        await launched.page.getByRole('searchbox', { name: 'Search products' }).fill('krama');
        await expect(launched.page.getByRole('searchbox', { name: 'Search products' })).toHaveValue('krama');
        await launched.page.getByRole('combobox', { name: 'Filter by supplier' }).click();
        await launched.page.keyboard.press('Escape');
        await assertUiStable(launched.page, 'generated catalog search and supplier controls');

        await navigateHashRoute(launched.page, `/catalog/skus/${targets.skuId}`);
        await expect(launched.page.getByRole('heading').first()).toBeVisible();
        await expect(launched.page.getByRole('button', { name: 'Record' })).toBeVisible();
        await expect(launched.page.getByText('Chart View')).toBeVisible();
        await expect(launched.page.getByText('កខ')).toHaveCount(0);
        expectSharedTradingChartWindow(await captureTradingChartGeometry(launched, 'generated SKU detail'), 'generated SKU detail');
        const outOfBoundsChartFlags = await launched.page.getByTestId('sku-trading-chart').evaluate((chart) => {
          const rect = chart.getBoundingClientRect();
          return Array.from(chart.querySelectorAll<HTMLButtonElement>('button[aria-label^="Select "]'))
            .map((button) => {
              const buttonRect = button.getBoundingClientRect();
              return {
                label: button.getAttribute('aria-label') ?? '',
                left: buttonRect.left - rect.left,
                right: buttonRect.right - rect.left,
              };
            })
            .filter((button) => button.right < 0 || button.left > rect.width);
        });
        expect(outOfBoundsChartFlags, 'generated SKU detail should not render chart flag buttons outside the visible plot area').toEqual([]);
        await assertUiStable(launched.page, 'generated SKU detail');
        await captureUi(launched.page, testInfo, generatedCaptureName(fixtureSize, 'sku-detail-chart'));
        await expectReachableTradingChartControls(launched.page);
        await captureUi(launched.page, testInfo, generatedCaptureName(fixtureSize, 'sku-chart-controls'));

        await navigateHashRoute(launched.page, `/catalog/services/${targets.serviceId}`);
        await expect(launched.page.getByRole('heading').first()).toBeVisible();
        await expect(launched.page.getByRole('button', { name: 'Record' })).toBeVisible();
        expectSharedTradingChartWindow(await captureTradingChartGeometry(launched, 'generated service detail'), 'generated service detail');
        await assertUiStable(launched.page, 'generated service detail');
        await captureUi(launched.page, testInfo, generatedCaptureName(fixtureSize, 'service-detail'));
        await expectReachableTradingChartControls(launched.page);
        await captureUi(launched.page, testInfo, generatedCaptureName(fixtureSize, 'service-chart-controls'));

        await navigateHashRoute(launched.page, '/insights/explain');
        await expect(launched.page.getByRole('heading', { name: 'System timeline' })).toBeVisible();
        expectSharedTradingChartWindow(await captureTradingChartGeometry(launched, 'generated Explain timeline'), 'generated Explain timeline');
        await assertUiStable(launched.page, 'generated explain timeline chart');
        await captureUi(launched.page, testInfo, generatedCaptureName(fixtureSize, 'explain-timeline-chart'));
        await expectReachableTradingChartControls(launched.page);
        await captureUi(launched.page, testInfo, generatedCaptureName(fixtureSize, 'explain-chart-controls'));

        await verifyBackForward(launched.page, '/catalog', '/insights/explain');
        for (const size of [{ width: 1280, height: 800 }, { width: 1600, height: 1000 }]) {
          await resizeDesktopWindow(launched, size);
          for (const { route, capture } of [
            { route: `/catalog/skus/${targets.skuId}`, capture: 'sku' },
            { route: `/catalog/services/${targets.serviceId}`, capture: 'service' },
            { route: '/insights/explain', capture: 'explain' },
          ] as const) {
            await navigateHashRoute(launched.page, route);
            await expect(launched.page.getByTestId('sku-trading-chart')).toBeVisible();
            const surface = `generated ${capture} at native ${size.width}x${size.height}`;
            // The minimum-height ledger grows naturally when controls wrap.
            expectSharedTradingChartWindow(await captureTradingChartGeometry(launched, surface), surface, false);
            await expectReachableTradingChartControls(launched.page);
            await assertUiStable(launched.page, surface);
            await captureUi(launched.page, testInfo, generatedCaptureName(fixtureSize, `${capture}-controls-${size.width}x${size.height}`));
          }
        }
        launched.issues.assertNoIssues(`generated ${fixtureSize} desktop matrix`);
      } finally {
        await closeDesktopUiMatrix(launched);
      }
    });
  }
});
