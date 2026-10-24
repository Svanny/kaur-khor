import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  closeKaurKhorBenchmarkSession,
  launchKaurKhorForBenchmark,
  waitForPersistedBenchmarkEventCount,
  type LaunchedKaurKhorBenchmarkApp,
} from '../../bench/helpers/electron-app';
import { benchmarkDataDirectory, benchmarkOutputDirectory, benchmarkRunId } from '../../bench/helpers/artifact-paths';
import { prepareBenchmarkWorkspace, type BenchmarkWorkspaceSize } from '../../bench/helpers/workspace-seed';
import { attachPageIssueCollector, type PageIssueCollector } from './runtime-guards';

export type LaunchedUiMatrixDesktop = LaunchedKaurKhorBenchmarkApp & {
  issues: PageIssueCollector;
};

interface LaunchDesktopOptions {
  dataDirectory?: string;
  fixtureSize?: BenchmarkWorkspaceSize;
  fresh?: boolean;
  name: string;
  outputDirectory?: string;
  testInfo: TestInfo;
}

export async function launchDesktopUiMatrix({
  fixtureSize = 'medium',
  fresh = false,
  dataDirectory: existingDataDirectory,
  name,
  outputDirectory: existingOutputDirectory,
  testInfo,
}: LaunchDesktopOptions): Promise<LaunchedUiMatrixDesktop> {
  const runId = benchmarkRunId(`ui-matrix-${name}-${testInfo.retry}`);
  const dataDirectory = existingDataDirectory ?? await benchmarkDataDirectory(runId);
  const outputDirectory = existingOutputDirectory ?? await benchmarkOutputDirectory(runId);
  if (!fresh && !existingDataDirectory) {
    await prepareBenchmarkWorkspace({ dataDirectory, size: fixtureSize });
    await copyBundledCatalogAssets(dataDirectory);
  }
  const launched = await launchKaurKhorForBenchmark(`ui-matrix-${name}`, testInfo, {
    backgroundWindow: true,
    dataDirectory,
    fixtureSize,
    outputDirectory,
    prepareWorkspace: false,
    runId,
  });
  if (process.platform === 'win32') {
    // Hidden Windows windows can stop producing frames for capturePage.
    await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  }
  const issues = attachPageIssueCollector(launched.page);
  return { ...launched, issues };
}

async function copyBundledCatalogAssets(dataDirectory: string) {
  const sourceDirectory = join(process.cwd(), 'src/renderer/src/assets/dev-catalog');
  const targetDirectory = join(dataDirectory, 'assets');
  await mkdir(targetDirectory, { recursive: true });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
      .map((entry) => copyFile(join(sourceDirectory, entry.name), join(targetDirectory, entry.name))),
  );
}

export async function closeDesktopUiMatrix(launched: LaunchedUiMatrixDesktop) {
  await closeKaurKhorBenchmarkSession(launched);
}

export async function seedCompletedDesktopPreferences(dataDirectory: string) {
  await writeFile(
    join(dataDirectory, 'desktop-preferences.json'),
    `${JSON.stringify({
      currency: 'USD',
      customShowAnalysisPage: true,
      customShowAutomationsPage: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowHeartbeatRibbons: true,
      customShowLogsViewToggle: true,
      customShowOverviewTaskTabs: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowRightRailCards: true,
      displayViewMode: 'maximal',
      language: 'en',
      onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
      seenUnlockedNavItems: {
        catalog: true,
        insights: true,
        work: true,
      },
      showAnalysisPage: true,
      showAutomationsPage: true,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showHeartbeatRibbons: true,
      showLogsViewToggle: true,
      showOverviewTaskTabs: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showRightRailCards: true,
    }, null, 2)}\n`,
    'utf8',
  );
}

export async function completeOnboardingThroughUi(page: Page) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(() => window.location.hash === '#/' || window.location.hash === '');
  await waitForPersistedBenchmarkEventCount({ page, outputDirectory: '' }, 'renderer.workspace.ready').catch(() => undefined);
}

export async function saveAllVisibilityPreferences(page: Page) {
  await page.evaluate(async () => {
    await window.kaurKhorDesktop.preferences.save({
      customShowAnalysisPage: true,
      customShowAutomationsPage: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowHeartbeatRibbons: true,
      customShowLogsViewToggle: true,
      customShowOverviewTaskTabs: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowRightRailCards: true,
      displayViewMode: 'maximal',
      onboardingCompletedAt: new Date().toISOString(),
      seenUnlockedNavItems: {
        catalog: true,
        insights: true,
        work: true,
      },
      showAnalysisPage: true,
      showAutomationsPage: true,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showHeartbeatRibbons: true,
      showLogsViewToggle: true,
      showOverviewTaskTabs: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showRightRailCards: true,
    });
  });
}

export async function desktopWorkspaceCounts(page: Page) {
  return page.evaluate(async () => {
    const [catalog, observations, orderBatches, summary] = await Promise.all([
      window.kaurKhorDesktop.sena.getCatalog(),
      window.kaurKhorDesktop.sena.listObservations(),
      window.kaurKhorDesktop.sena.listOrderBatches(),
      window.kaurKhorDesktop.sena.getWorkspaceSummary(),
    ]);
    return {
      observationCount: observations.length,
      orderBatchCount: orderBatches.length,
      serviceCount: catalog?.services.length ?? 0,
      skuCount: catalog?.skus.length ?? 0,
      summaryIntervalCount: summary?.intervalCount ?? 0,
    };
  });
}

export async function firstActiveCatalogTargets(page: Page) {
  return page.evaluate(async () => {
    const catalog = await window.kaurKhorDesktop.sena.getCatalog();
    return {
      serviceId: catalog?.services.find((service) => !service.archived)?.serviceId ?? null,
      skuId: catalog?.skus.find((sku) => !sku.archived)?.skuId ?? null,
    };
  });
}

export async function resizeDesktopWindow(
  launched: LaunchedUiMatrixDesktop,
  size: { height: number; width: number },
  coordinateSpace: 'outer' | 'content' = 'outer',
) {
  const nativeWindow = await launched.app.browserWindow(launched.page);
  await nativeWindow.evaluate((browserWindow, { nextSize, coordinateSpace }) => {
    if (coordinateSpace === 'content') {
      browserWindow.setContentSize(nextSize.width, nextSize.height);
    } else {
      browserWindow.setSize(nextSize.width, nextSize.height);
    }
  }, { nextSize: size, coordinateSpace });
  await expect.poll(
    () => nativeWindow.evaluate((browserWindow, space) => (
      space === 'content' ? browserWindow.getContentSize() : browserWindow.getSize()
    ), coordinateSpace),
    { message: `native ${coordinateSpace} window should resize to ${size.width}x${size.height}` },
  ).toEqual([size.width, size.height]);

  // Native content dimensions are DIPs; renderer dimensions are CSS pixels.
  // Chromium rounds innerWidth/innerHeight after applying the managed zoom.
  await expect.poll(async () => {
    const { contentSize, viewport, zoomFactor } = await desktopWindowGeometry(launched);
    return Math.max(
      Math.abs(viewport.width - contentSize[0] / zoomFactor),
      Math.abs(viewport.height - contentSize[1] / zoomFactor),
    );
  }, { message: 'renderer viewport should match native content size divided by zoom' }).toBeLessThanOrEqual(1);
  console.log('[ui-matrix:window]', JSON.stringify(await desktopWindowGeometry(launched)));
}

export async function desktopWindowGeometry(launched: LaunchedUiMatrixDesktop) {
  const nativeWindow = await launched.app.browserWindow(launched.page);
  const native = await nativeWindow.evaluate((browserWindow) => ({
    outerSize: browserWindow.getSize(),
    contentSize: browserWindow.getContentSize(),
    zoomFactor: browserWindow.webContents.getZoomFactor(),
    zoomLevel: browserWindow.webContents.getZoomLevel(),
  }));
  const renderer = await launched.page.evaluate(() => ({
    viewport: { height: window.innerHeight, width: window.innerWidth },
    rootRem: Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize),
  }));
  return { ...native, ...renderer };
}
