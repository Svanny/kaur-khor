import type { Page, TestInfo } from '@playwright/test';
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
  fixtureSize?: BenchmarkWorkspaceSize;
  fresh?: boolean;
  name: string;
  testInfo: TestInfo;
}

export async function launchDesktopUiMatrix({
  fixtureSize = 'medium',
  fresh = false,
  name,
  testInfo,
}: LaunchDesktopOptions): Promise<LaunchedUiMatrixDesktop> {
  const runId = benchmarkRunId(`ui-matrix-${name}-${testInfo.retry}`);
  const dataDirectory = await benchmarkDataDirectory(runId);
  const outputDirectory = await benchmarkOutputDirectory(runId);
  if (!fresh) {
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
