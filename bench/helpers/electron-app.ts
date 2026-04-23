import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright';
import electronPath from 'electron';
import type { TestInfo } from '@playwright/test';
import { benchmarkDataDirectory, benchmarkOutputDirectory, benchmarkRunId } from './artifact-paths';
import {
  buildScenarioSummary,
  readBenchmarkEvents,
  writeScenarioSummary,
  type BenchmarkScenarioSummary,
} from './bench-metrics';
import { prepareBenchmarkWorkspace } from './workspace-seed';
import type {
  BanjiBenchmarkCategory,
  BanjiBenchmarkEventInput,
  BanjiBenchmarkScenarioId,
} from '../../src/shared/benchmark';

export interface LaunchedBanjiBenchmarkApp {
  app: ElectronApplication;
  dataDirectory: string;
  outputDirectory: string;
  page: Page;
  runId: string;
}

interface LaunchBanjiBenchmarkOptions {
  dataDirectory?: string;
  fixtureSize?: 'minimal' | 'medium' | 'heavy' | 'power-user';
  outputDirectory?: string;
  prepareWorkspace?: boolean;
  runId?: string;
}

export async function launchBanjiForBenchmark(
  scenarioName: string,
  testInfo: TestInfo,
  options?: LaunchBanjiBenchmarkOptions,
): Promise<LaunchedBanjiBenchmarkApp> {
  const runId = options?.runId ?? benchmarkRunId(`${scenarioName}-${testInfo.retry}`);
  const outputDirectory = options?.outputDirectory ?? await benchmarkOutputDirectory(runId);
  const dataDirectory = options?.dataDirectory ?? await benchmarkDataDirectory(runId);
  if (options?.prepareWorkspace !== false) {
    await prepareBenchmarkWorkspace({ dataDirectory, size: options?.fixtureSize ?? 'medium' });
  }
  let app: ElectronApplication | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      app = await electron.launch({
        executablePath: electronPath as string,
        args: ['.'],
        env: {
          ...process.env,
          BANJI_BENCHMARK: '1',
          BANJI_BENCHMARK_BACKGROUND: '1',
          BANJI_BENCHMARK_RUN_ID: runId,
          BANJI_BENCHMARK_OUTPUT_DIR: outputDirectory,
          BANJI_BENCHMARK_DATA_DIR: dataDirectory,
          BANJI_BENCHMARK_DISABLE_DEV_SEED: '1',
          BANJI_DESKTOP_TRACE_IPC: '1',
        },
      });
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  if (!app) {
    throw lastError;
  }
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, dataDirectory, outputDirectory, page, runId };
}

export async function closeBanjiBenchmarkSession(
  launched: Pick<LaunchedBanjiBenchmarkApp, 'app'>,
) {
  await launched.app.close();
}

export async function finalizeBanjiBenchmarkScenario({
  outputDirectory,
  runId,
  scenario,
}: {
  outputDirectory: string;
  runId: string;
  scenario: BanjiBenchmarkScenarioId;
}): Promise<BenchmarkScenarioSummary> {
  const events = await readBenchmarkEvents(outputDirectory);
  const summary = buildScenarioSummary({
    events,
    runId,
    scenario,
  });
  await writeScenarioSummary(outputDirectory, summary);
  return summary;
}

export async function closeBanjiBenchmarkApp(
  launched: LaunchedBanjiBenchmarkApp,
  scenarioName: BanjiBenchmarkScenarioId,
): Promise<BenchmarkScenarioSummary> {
  await closeBanjiBenchmarkSession(launched);
  return finalizeBanjiBenchmarkScenario({
    outputDirectory: launched.outputDirectory,
    runId: launched.runId,
    scenario: scenarioName,
  });
}

export async function persistedBenchmarkEventCount(
  launched: Pick<LaunchedBanjiBenchmarkApp, 'outputDirectory'>,
  name: string,
) {
  const events = await readBenchmarkEvents(launched.outputDirectory);
  return events.filter((event) => event.name === name).length;
}

export async function waitForPersistedBenchmarkEventCount(
  launched: Pick<LaunchedBanjiBenchmarkApp, 'outputDirectory'>,
  name: string,
  minimumCount = 1,
  options?: { timeoutMs?: number },
) {
  const startedAt = Date.now();
  const timeoutMs = options?.timeoutMs ?? 60_000;
  while (Date.now() - startedAt < timeoutMs) {
    const count = await persistedBenchmarkEventCount(launched, name);
    if (count >= minimumCount) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for benchmark event "${name}" count >= ${minimumCount}`);
}

export async function assertLocatorCountAtLeast(
  locator: Locator,
  minimumCount: number,
  label: string,
) {
  const count = await locator.count();
  if (count < minimumCount) {
    throw new Error(`Expected at least ${minimumCount} ${label}, found ${count}.`);
  }
  return count;
}

export async function clickWaitReadyAndRecordDuration(
  launched: Pick<LaunchedBanjiBenchmarkApp, 'outputDirectory' | 'page'>,
  {
    action,
    readyEvent,
    metricName,
    route,
    category = 'interaction',
    detail,
    timeoutMs,
    waitFor,
  }: {
    action: () => Promise<void>;
    readyEvent?: string;
    metricName?: string;
    route: `/${string}`;
    category?: BanjiBenchmarkCategory;
    detail?: Record<string, unknown>;
    timeoutMs?: number;
    waitFor?: () => Promise<void>;
  },
) {
  const previousCount = readyEvent
    ? await persistedBenchmarkEventCount(launched, readyEvent)
    : null;
  const startedAt = Date.now();
  await action();
  if (readyEvent && previousCount != null) {
    await waitForPersistedBenchmarkEventCount(launched, readyEvent, previousCount + 1, { timeoutMs });
  }
  await waitFor?.();
  const durationMs = Date.now() - startedAt;
  if (metricName) {
    await recordPlaywrightDuration(launched.page, {
      metricName,
      durationMs,
      route,
      category,
      detail,
    });
  }
  return durationMs;
}

export async function clickSidebarNavigationAndMeasureDuration(
  launched: Pick<LaunchedBanjiBenchmarkApp, 'outputDirectory' | 'page'>,
  {
    category = 'navigation',
    detail,
    label,
    metricName,
    readyEvent,
    route,
    timeoutMs,
    waitFor,
  }: {
    label: string;
    readyEvent: string;
    route: `/${string}`;
    metricName?: string;
    category?: BanjiBenchmarkCategory;
    detail?: Record<string, unknown>;
    timeoutMs?: number;
    waitFor?: () => Promise<void>;
  },
) {
  return clickWaitReadyAndRecordDuration(launched, {
    action: async () => clickSidebarNavigation(launched.page, label),
    readyEvent,
    metricName,
    route,
    category,
    detail,
    timeoutMs,
    waitFor,
  });
}

export async function navigateBenchmarkRouteAndMeasureDuration(
  launched: Pick<LaunchedBanjiBenchmarkApp, 'outputDirectory' | 'page'>,
  {
    category = 'interaction',
    detail,
    metricName,
    readyEvent,
    route,
    timeoutMs,
    waitFor,
  }: {
    route: `/${string}`;
    readyEvent: string;
    metricName?: string;
    category?: BanjiBenchmarkCategory;
    detail?: Record<string, unknown>;
    timeoutMs?: number;
    waitFor?: () => Promise<void>;
  },
) {
  return clickWaitReadyAndRecordDuration(launched, {
    action: async () => navigateBenchmarkRoute(launched.page, route),
    readyEvent,
    metricName,
    route,
    category,
    detail,
    timeoutMs,
    waitFor,
  });
}

export async function navigateBenchmarkRoute(page: Page, route: `/${string}`) {
  await page.evaluate((nextRoute) => {
    window.location.hash = `#${nextRoute}`;
  }, route);
  await page.waitForFunction(
    (expectedRoute) => window.location.hash.slice(1) === expectedRoute,
    route,
  );
}

export async function clickSidebarNavigation(page: Page, label: string) {
  await page.getByRole('link', { name: label, exact: true }).click();
}

export async function currentBenchmarkRoute(page: Page) {
  return page.evaluate(() => {
    if (window.location.hash.startsWith('#/')) {
      return window.location.hash.slice(1) || '/';
    }
    return `${window.location.pathname}${window.location.search}` || '/';
  });
}

export async function closeVisibleDialog(page: Page) {
  const dialog = page.getByRole('dialog').last();
  if (!(await dialog.isVisible().catch(() => false))) {
    return;
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 30_000 });
}

export async function openOverviewSupplierDrawerAndRecordDuration(
  launched: Pick<LaunchedBanjiBenchmarkApp, 'outputDirectory' | 'page'>,
  metricName = 'interaction.open_overview_supplier_drawer_ms',
) {
  const actionButtons = launched.page.locator('[data-slot="overview-task-row"] button[type="button"]');
  await assertLocatorCountAtLeast(actionButtons, 1, 'overview supplier drawer action button(s)');
  const startedAt = Date.now();
  await actionButtons.first().click();
  await launched.page.getByRole('dialog').waitFor({ state: 'visible', timeout: 30_000 });
  const durationMs = Date.now() - startedAt;
  await recordPlaywrightDuration(launched.page, {
    metricName,
    durationMs,
    route: '/?workflow=supplier&filter=all',
    category: 'interaction',
  });
  return durationMs;
}

export async function openOverviewCustomerIntakeDrawerAndRecordDuration(
  launched: Pick<LaunchedBanjiBenchmarkApp, 'outputDirectory' | 'page'>,
  metricName = 'interaction.open_overview_customer_intake_drawer_ms',
) {
  const intakeButtons = launched.page.locator('[data-customer-task-id] button');
  await assertLocatorCountAtLeast(intakeButtons, 1, 'overview customer intake action button(s)');
  const startedAt = Date.now();
  await intakeButtons.first().click();
  await launched.page.getByRole('dialog').filter({ hasText: 'Telegram intake' }).waitFor({ state: 'visible', timeout: 30_000 });
  const durationMs = Date.now() - startedAt;
  await recordPlaywrightDuration(launched.page, {
    metricName,
    durationMs,
    route: '/?workflow=customer&customerFilter=review',
    category: 'interaction',
  });
  return durationMs;
}

export async function openAutomationIntakeDrawerAndRecordDuration(
  launched: Pick<LaunchedBanjiBenchmarkApp, 'outputDirectory' | 'page'>,
  metricName = 'interaction.open_automation_intake_drawer_ms',
) {
  const intakeButtons = launched.page.getByRole('button', { name: /Open intake/i });
  await assertLocatorCountAtLeast(intakeButtons, 1, 'automation intake action button(s)');
  const startedAt = Date.now();
  await intakeButtons.first().click();
  await launched.page.getByRole('dialog').filter({ hasText: 'Telegram intake' }).waitFor({ state: 'visible', timeout: 30_000 });
  const durationMs = Date.now() - startedAt;
  await recordPlaywrightDuration(launched.page, {
    metricName,
    durationMs,
    route: '/automations',
    category: 'interaction',
  });
  return durationMs;
}

export async function ensureAutomationBenchmarkSeed(
  launched: Pick<LaunchedBanjiBenchmarkApp, 'outputDirectory' | 'page'>,
  {
    minimumExposedRows = 2,
    minimumIntakes = 2,
  }: {
    minimumExposedRows?: number;
    minimumIntakes?: number;
  } = {},
) {
  const seedSummary = await launched.page.evaluate(async ({ minimumExposedRows: nextMinimumExposedRows, minimumIntakes: nextMinimumIntakes }) => {
    const benchmarkWindow = window as Window & {
      banjiDesktop?: {
        automation?: {
          getWorkspace: () => Promise<{
            exposures: Array<{
              archived: boolean;
              availabilityStatus: string;
              entityId: string;
              entityType: 'sku' | 'service';
              exposed: boolean;
              price: number | null;
              supplierName?: string | null;
            }>;
            intakes: Array<{
              intakeId: string;
              status: string;
            }>;
          }>;
          patchExposureRow: (payload: {
            entityType: 'sku' | 'service';
            entityId: string;
            exposed: boolean;
          }) => Promise<unknown>;
          resolveIntake: (payload: {
            intakeId: string;
            status: string;
            note: string;
          }) => Promise<unknown>;
          saveConnection: (payload: {
            channel: 'telegram';
            status: 'connected' | 'disconnected' | 'paused' | 'error';
            botDisplayName: string;
            botToken: string;
            botUsername: string;
            externalLink: string;
          }) => Promise<unknown>;
          testTelegramConnection: () => Promise<unknown>;
        };
        sena?: {
          createOrderBatch: (payload: {
            supplierName?: string | null;
            shared: {
              orderedQuantity: number;
              receivedQuantity: number;
              placementTimestamp: string;
              expectedArrivalAt: string;
              costPerUnit: number;
            };
            children: Array<{
              skuId: string;
              overrides: {
                orderedQuantity: number;
                receivedQuantity: number;
                costPerUnit: number;
                placementTimestamp: string;
                expectedArrivalAt: string;
              };
            }>;
          }) => Promise<unknown>;
        };
      };
    };
    const automation = benchmarkWindow.banjiDesktop?.automation;
    if (!automation) {
      throw new Error('Automations bridge is unavailable in benchmark mode.');
    }

    await automation.saveConnection({
      channel: 'telegram',
      status: 'disconnected',
      botDisplayName: 'banji benchmark bot',
      botToken: 'bench-token:offline',
      botUsername: 'banji_benchmark_bot',
      externalLink: 'https://t.me/banji_benchmark_bot',
    });

    let workspace = await automation.getWorkspace();
    const eligibleExposureRows = workspace.exposures.filter((row) =>
      !row.archived && row.availabilityStatus !== 'hidden' && row.price != null);
    if (eligibleExposureRows.length < nextMinimumExposedRows) {
      throw new Error(
        `Benchmark fixture is missing required automations exposure rows (needed ${nextMinimumExposedRows}, found ${eligibleExposureRows.length}).`,
      );
    }

    for (const row of eligibleExposureRows.slice(0, nextMinimumExposedRows)) {
      await automation.patchExposureRow({
        entityType: row.entityType,
        entityId: row.entityId,
        exposed: true,
      });
    }

    const supplierSkuRow = eligibleExposureRows.find((row) => row.entityType === 'sku');
    if (!supplierSkuRow) {
      throw new Error('Benchmark fixture is missing an eligible SKU row for supplier task seeding.');
    }
    const nowIso = new Date().toISOString();
    const expectedArrivalAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await benchmarkWindow.banjiDesktop?.sena?.createOrderBatch({
      supplierName: supplierSkuRow.supplierName ?? null,
      shared: {
        orderedQuantity: 6,
        receivedQuantity: 0,
        placementTimestamp: nowIso,
        expectedArrivalAt,
        costPerUnit: supplierSkuRow.price ?? 1,
      },
      children: [{
        skuId: supplierSkuRow.entityId,
        overrides: {
          orderedQuantity: 6,
          receivedQuantity: 0,
          costPerUnit: supplierSkuRow.price ?? 1,
          placementTimestamp: nowIso,
          expectedArrivalAt,
        },
      }],
    });

    workspace = await automation.getWorkspace();
    for (let attempt = 0; attempt < nextMinimumIntakes * 3 && workspace.intakes.length < nextMinimumIntakes; attempt += 1) {
      await automation.testTelegramConnection();
      workspace = await automation.getWorkspace();
    }

    if (workspace.intakes.length < nextMinimumIntakes) {
      throw new Error(
        `Benchmark fixture is missing required automations intake rows (needed ${nextMinimumIntakes}, found ${workspace.intakes.length}).`,
      );
    }

    const hasNeedsReviewIntake = workspace.intakes.some((intake) => intake.status === 'needs_review' || intake.status === 'failed');
    if (!hasNeedsReviewIntake) {
      const candidate = workspace.intakes.find((intake) => intake.status !== 'ticketed' && intake.status !== 'completed') ?? workspace.intakes[0] ?? null;
      if (!candidate) {
        throw new Error('Benchmark fixture does not have an intake available to seed exceptions.');
      }
      await automation.resolveIntake({
        intakeId: candidate.intakeId,
        status: 'needs_review',
        note: 'Seeded for benchmark exceptions coverage.',
      });
      workspace = await automation.getWorkspace();
    }

    return {
      exposedRows: workspace.exposures.filter((row) => row.exposed).length,
      intakeRows: workspace.intakes.length,
      needsReviewRows: workspace.intakes.filter((intake) => intake.status === 'needs_review' || intake.status === 'failed').length,
    };
  }, {
    minimumExposedRows,
    minimumIntakes,
  });

  const priorWorkspaceReadyEvents = await persistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
  await launched.page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready', priorWorkspaceReadyEvents + 1);
  return seedSummary;
}

export function assertScenarioTargetCoverage(
  summary: BenchmarkScenarioSummary,
  expectedMetricNames: string[],
) {
  const targets = summary.targets ?? [];
  const missingMetrics = expectedMetricNames.filter(
    (metricName) => !targets.some((target) => target.metricName === metricName),
  );
  if (missingMetrics.length > 0) {
    throw new Error(`Scenario ${summary.scenario} is missing target metrics: ${missingMetrics.join(', ')}`);
  }

  const missingEvaluations = targets
    .filter((target) => target.status === 'missing')
    .map((target) => target.metricName);
  if (missingEvaluations.length > 0) {
    throw new Error(`Scenario ${summary.scenario} has missing target evaluations: ${missingEvaluations.join(', ')}`);
  }
}

export async function closeBanjiBenchmarkAppWithTargetCoverage(
  launched: LaunchedBanjiBenchmarkApp,
  scenarioName: BanjiBenchmarkScenarioId,
  expectedMetricNames: string[],
  priorError: unknown = null,
) {
  let summary: BenchmarkScenarioSummary;
  try {
    summary = await closeBanjiBenchmarkApp(launched, scenarioName);
  } catch (closeError) {
    if (priorError != null) {
      throw priorError;
    }
    throw closeError;
  }

  if (priorError == null) {
    assertScenarioTargetCoverage(summary, expectedMetricNames);
    return summary;
  }

  throw priorError;
}

export async function recordPlaywrightBenchmarkEvent(
  page: Page,
  event: Omit<BanjiBenchmarkEventInput, 'layer'>,
) {
  await page.evaluate((input) => {
    const benchmarkWindow = window as Window & {
      __BANJI_BENCHMARK_EVENTS__?: unknown[];
      banjiDesktop: {
        benchmark?: {
          runId: string;
          recordEvent: (event: unknown) => void;
        };
      };
    };
    const normalized = {
      route: `${window.location.pathname}${window.location.search}` || '/',
      entityType: null,
      entityId: null,
      command: null,
      durationMs: null,
      detail: {},
      ...input,
      layer: 'playwright' as const,
      runId: input.runId ?? benchmarkWindow.banjiDesktop.benchmark?.runId ?? 'playwright',
      ts: input.ts ?? Date.now(),
    };
    benchmarkWindow.__BANJI_BENCHMARK_EVENTS__ ??= [];
    benchmarkWindow.__BANJI_BENCHMARK_EVENTS__.push(normalized);
    benchmarkWindow.banjiDesktop.benchmark?.recordEvent(normalized);
  }, event);
}

export async function recordPlaywrightDuration(
  page: Page,
  {
    metricName,
    durationMs,
    route,
    category = 'interaction',
    detail,
    entityId,
    entityType,
  }: {
    metricName: string;
    durationMs: number;
    route?: string;
    category?: BanjiBenchmarkCategory;
    detail?: Record<string, unknown>;
    entityId?: string;
    entityType?: 'sku' | 'service';
  },
) {
  await recordPlaywrightBenchmarkEvent(page, {
    category,
    command: null,
    detail: detail ?? {},
    durationMs,
    entityId: entityId ?? null,
    entityType: entityType ?? null,
    name: metricName,
    phase: 'end',
    route: route ?? null,
  });
}

export async function snapshotRendererBenchmarkMemory(page: Page, name: string) {
  await page.evaluate((snapshotName) => {
    const benchmarkWindow = window as Window & {
      __BANJI_BENCHMARK_EVENTS__?: unknown[];
      banjiDesktop: {
        benchmark?: {
          runId: string;
          recordEvent: (event: unknown) => void;
        };
      };
    };
    benchmarkWindow.__BANJI_BENCHMARK_EVENTS__ ??= [];
    const memory = (performance as Performance & {
      memory?: {
        jsHeapSizeLimit: number;
        totalJSHeapSize: number;
        usedJSHeapSize: number;
      };
    }).memory;
    const route = window.location.hash.startsWith('#/')
      ? window.location.hash.slice(1) || '/'
      : `${window.location.pathname}${window.location.search}` || '/';
    const event = {
      runId: benchmarkWindow.banjiDesktop.benchmark?.runId ?? 'playwright',
      ts: Date.now(),
      layer: 'playwright' as const,
      category: 'memory' as const,
      name: snapshotName,
      phase: 'instant' as const,
      route,
      entityType: null,
      entityId: null,
      command: null,
      durationMs: null,
      detail: {
        available: Boolean(memory),
        usedJSHeapSizeMb: memory ? memory.usedJSHeapSize / 1024 / 1024 : null,
        totalJSHeapSizeMb: memory ? memory.totalJSHeapSize / 1024 / 1024 : null,
      },
    };
    benchmarkWindow.__BANJI_BENCHMARK_EVENTS__.push(event);
    benchmarkWindow.banjiDesktop.benchmark?.recordEvent(event);
  }, name);
}
