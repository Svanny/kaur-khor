import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright';
import electronPath from 'electron';
import type { TestInfo } from '@playwright/test';
import { join } from 'node:path';
import { benchmarkDataDirectory, benchmarkOutputDirectory, benchmarkRunId } from './artifact-paths';
import {
  buildScenarioSummary,
  readBenchmarkEvents,
  writeScenarioSummary,
  type BenchmarkScenarioSummary,
} from './bench-metrics';
import { prepareBenchmarkWorkspace } from './workspace-seed';
import type {
  KaurKhorBenchmarkCategory,
  KaurKhorBenchmarkEventInput,
  KaurKhorBenchmarkScenarioId,
} from '../../src/shared/benchmark';

delete process.env.NO_COLOR;

export interface LaunchedKaurKhorBenchmarkApp {
  app: ElectronApplication;
  dataDirectory: string;
  outputDirectory: string;
  page: Page;
  runId: string;
  tracePath: string | null;
}

interface LaunchKaurKhorBenchmarkOptions {
  backgroundWindow?: boolean;
  dataDirectory?: string;
  fixtureSize?: 'minimal' | 'medium' | 'heavy' | 'power-user';
  outputDirectory?: string;
  prepareWorkspace?: boolean;
  runId?: string;
}

const BENCHMARK_APP_CLOSE_TIMEOUT_MS = 10_000;
const BENCHMARK_APP_FORCE_KILL_TIMEOUT_MS = 5_000;
const BENCHMARK_APP_LAUNCH_TIMEOUT_MS = 120_000;

export function benchmarkChildEnv(extraEnv: NodeJS.ProcessEnv) {
  const baseEnvKeys = [
    'HOME',
    'LANG',
    'LC_ALL',
    'LOGNAME',
    'PATH',
    'SHELL',
    'TMPDIR',
    'USER',
    'XPC_FLAGS',
    'XPC_SERVICE_NAME',
    'KAUR_KHOR_DESKTOP_CORE_BINARY',
  ];
  const env = {
    ...Object.fromEntries(
      baseEnvKeys
        .map((key) => [key, process.env[key]])
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ),
    ...extraEnv,
  };
  if (env.NO_COLOR) {
    delete env.NO_COLOR;
  }
  return env;
}

export async function launchKaurKhorForBenchmark(
  scenarioName: string,
  testInfo: TestInfo,
  options?: LaunchKaurKhorBenchmarkOptions,
): Promise<LaunchedKaurKhorBenchmarkApp> {
  const runId = options?.runId ?? benchmarkRunId(`${scenarioName}-${testInfo.retry}`);
  const outputDirectory = options?.outputDirectory ?? await benchmarkOutputDirectory(runId);
  const dataDirectory = options?.dataDirectory ?? await benchmarkDataDirectory(runId);
  const tracePath = process.env.KAUR_KHOR_BENCHMARK_TRACE === '1'
    ? join(outputDirectory, 'playwright-trace.zip')
    : null;
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
        timeout: BENCHMARK_APP_LAUNCH_TIMEOUT_MS,
        env: benchmarkChildEnv({
          KAUR_KHOR_BENCHMARK: '1',
          KAUR_KHOR_BENCHMARK_TRACE: '0',
          KAUR_KHOR_BENCHMARK_BACKGROUND: options?.backgroundWindow === false ? '0' : '1',
          KAUR_KHOR_BENCHMARK_RUN_ID: runId,
          KAUR_KHOR_BENCHMARK_OUTPUT_DIR: outputDirectory,
          KAUR_KHOR_BENCHMARK_DATA_DIR: dataDirectory,
          KAUR_KHOR_BENCHMARK_DISABLE_DEV_SEED: '1',
          KAUR_KHOR_DESKTOP_TRACE_IPC: '1',
        }),
      });
      if (tracePath) {
        await app.context().tracing.start({
          screenshots: true,
          snapshots: true,
          sources: true,
        });
      }
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
  return { app, dataDirectory, outputDirectory, page, runId, tracePath };
}

export async function closeKaurKhorBenchmarkSession(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'app'> & Partial<Pick<LaunchedKaurKhorBenchmarkApp, 'tracePath'>>,
) {
  if (launched.tracePath) {
    await launched.app.context().tracing.stop({ path: launched.tracePath }).catch(() => undefined);
  }
  const process = launched.app.process();
  const closeResult = await Promise.race([
    launched.app.close().then(() => 'closed' as const).catch(() => 'failed' as const),
    new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), BENCHMARK_APP_CLOSE_TIMEOUT_MS);
    }),
  ]);
  if (closeResult === 'closed') {
    return;
  }
  if (process && process.exitCode == null) {
    try {
      process.kill('SIGKILL');
    } catch {
      // Ignore kill errors; we'll still resolve after the force-kill timeout below.
    }
  }
  if (process && process.exitCode != null) {
    return;
  }
  if (process && process.exitCode == null) {
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (process.exitCode == null) {
          try {
            process.kill('SIGKILL');
          } catch {
            // Ignore kill errors during teardown.
          }
        }
        resolve();
      }, BENCHMARK_APP_FORCE_KILL_TIMEOUT_MS);
      process.once('exit', () => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
  }
}

export async function finalizeKaurKhorBenchmarkScenario({
  outputDirectory,
  runId,
  scenario,
}: {
  outputDirectory: string;
  runId: string;
  scenario: KaurKhorBenchmarkScenarioId;
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

export async function closeKaurKhorBenchmarkApp(
  launched: LaunchedKaurKhorBenchmarkApp,
  scenarioName: KaurKhorBenchmarkScenarioId,
): Promise<BenchmarkScenarioSummary> {
  await closeKaurKhorBenchmarkSession(launched);
  return finalizeKaurKhorBenchmarkScenario({
    outputDirectory: launched.outputDirectory,
    runId: launched.runId,
    scenario: scenarioName,
  });
}

export async function persistedBenchmarkEventCount(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'outputDirectory'>,
  name: string,
) {
  const events = await readBenchmarkEvents(launched.outputDirectory);
  return events.filter((event) => event.name === name).length;
}

export async function persistedCompletedBenchmarkEventCount(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'outputDirectory'>,
  name: string,
) {
  const events = await readBenchmarkEvents(launched.outputDirectory);
  return events.filter((event) => event.name === name && event.phase === 'end').length;
}

export async function waitForPersistedCompletedBenchmarkEventCount(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'outputDirectory'>,
  name: string,
  minimumCount = 1,
  options?: { timeoutMs?: number },
) {
  const startedAt = Date.now();
  const timeoutMs = options?.timeoutMs ?? 60_000;
  while (Date.now() - startedAt < timeoutMs) {
    const count = await persistedCompletedBenchmarkEventCount(launched, name);
    if (count >= minimumCount) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for completed benchmark event "${name}" count >= ${minimumCount}`);
}

export async function benchmarkEventCount(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'page'>,
  name: string,
) {
  return launched.page.evaluate(async (eventName) => {
    const benchmarkWindow = window as Window & {
      __KAUR_KHOR_BENCHMARK_EVENTS__?: Array<{ name?: string }>;
      kaurKhorDesktop?: {
        benchmark?: {
          getEventCount?: (name: string) => Promise<number>;
        };
      };
    };
    const preferRendererMemory = eventName.startsWith('route.');
    if (!preferRendererMemory && benchmarkWindow.kaurKhorDesktop?.benchmark?.getEventCount) {
      try {
        return await benchmarkWindow.kaurKhorDesktop.benchmark.getEventCount(eventName);
      } catch {
        // Fall back to renderer-memory events when IPC waiters are unavailable.
      }
    }
    return (benchmarkWindow.__KAUR_KHOR_BENCHMARK_EVENTS__ ?? []).filter((event) => event?.name === eventName).length;
  }, name);
}

export async function waitForBenchmarkEventCount(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'page'>,
  name: string,
  minimumCount = 1,
  options?: { timeoutMs?: number },
) {
  return launched.page.evaluate(async ({
    eventName,
    nextMinimumCount,
    timeoutMs,
  }: {
    eventName: string;
    nextMinimumCount: number;
    timeoutMs: number;
  }) => {
    const benchmarkWindow = window as Window & {
      __KAUR_KHOR_BENCHMARK_EVENTS__?: Array<{ name?: string; ts?: number }>;
      kaurKhorDesktop?: {
        benchmark?: {
          waitForEventCount?: (payload: {
            name: string;
            minimumCount: number;
            timeoutMs?: number;
          }) => Promise<{ count: number; ts: number | null }>;
        };
        };
      };
    const preferRendererMemory = eventName.startsWith('route.');
    if (!preferRendererMemory && benchmarkWindow.kaurKhorDesktop?.benchmark?.waitForEventCount) {
      return benchmarkWindow.kaurKhorDesktop.benchmark.waitForEventCount({
        name: eventName,
        minimumCount: nextMinimumCount,
        timeoutMs,
      });
    }
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const matchingEvents = (benchmarkWindow.__KAUR_KHOR_BENCHMARK_EVENTS__ ?? [])
        .filter((event) => event?.name === eventName);
      const count = matchingEvents.length;
      if (count >= nextMinimumCount) {
        return {
          count,
          ts: matchingEvents[count - 1]?.ts ?? null,
        };
      }
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
    throw new Error(`Timed out waiting for benchmark event "${eventName}" count >= ${nextMinimumCount}`);
  }, {
    eventName: name,
    nextMinimumCount: minimumCount,
    timeoutMs: options?.timeoutMs ?? 60_000,
  });
}

export async function waitForPersistedBenchmarkEventCount(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'outputDirectory' | 'page'>,
  name: string,
  minimumCount = 1,
  options?: { timeoutMs?: number },
) {
  await waitForBenchmarkEventCount(launched, name, minimumCount, options);
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
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'page'>,
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
    action: () => Promise<void | { startedAt?: number }>;
    readyEvent?: string;
    metricName?: string;
    route: `/${string}`;
    category?: KaurKhorBenchmarkCategory;
    detail?: Record<string, unknown>;
    timeoutMs?: number;
    waitFor?: () => Promise<void>;
  },
) {
  const previousCount = readyEvent
    ? await benchmarkEventCount(launched, readyEvent)
    : null;
  const fallbackStartedAt = Date.now();
  const actionResult = await action();
  const startedAt = actionResult?.startedAt ?? fallbackStartedAt;
  let readyResult: { count: number; ts: number | null } | null = null;
  if (readyEvent && previousCount != null) {
    readyResult = await waitForBenchmarkEventCount(launched, readyEvent, previousCount + 1, { timeoutMs });
  }
  await waitFor?.();
  const measuredDurationMs = Date.now() - startedAt;
  const readyDurationMs = readyResult?.ts != null
    ? Math.max(0, readyResult.ts - startedAt)
    : measuredDurationMs;
  const harnessOverheadMs = Math.max(0, measuredDurationMs - readyDurationMs);
  if (metricName) {
    await recordPlaywrightDuration(launched.page, {
      metricName,
      durationMs: readyDurationMs,
      route,
      category,
      detail: {
        ...(detail ?? {}),
        harnessOverheadMs,
        measuredDurationMs,
        readyDurationMs,
      },
    });
  }
  return readyDurationMs;
}

export async function clickSidebarNavigationAndMeasureDuration(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'page'>,
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
    category?: KaurKhorBenchmarkCategory;
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
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'page'>,
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
    category?: KaurKhorBenchmarkCategory;
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

export async function clickWithBrowserStartTime(locator: Locator) {
  await locator.evaluate((element) => {
    const benchmarkWindow = window as Window & {
      __KAUR_KHOR_BENCHMARK_ACTION_STARTED_AT__?: number;
    };
    benchmarkWindow.__KAUR_KHOR_BENCHMARK_ACTION_STARTED_AT__ = undefined;
    element.addEventListener('pointerdown', () => {
      benchmarkWindow.__KAUR_KHOR_BENCHMARK_ACTION_STARTED_AT__ = Date.now();
    }, { capture: true, once: true });
  });
  const fallbackStartedAt = Date.now();
  await locator.click();
  return await locator.page().evaluate((fallback) =>
    (window as Window & { __KAUR_KHOR_BENCHMARK_ACTION_STARTED_AT__?: number })
      .__KAUR_KHOR_BENCHMARK_ACTION_STARTED_AT__ ?? fallback, fallbackStartedAt);
}

async function armDialogOpenedTimestamp(page: Page) {
  await page.evaluate(() => {
    const benchmarkWindow = window as Window & {
      __KAUR_KHOR_BENCHMARK_DIALOG_OPENED_AT__?: number;
      __KAUR_KHOR_BENCHMARK_DIALOG_OBSERVER__?: MutationObserver;
    };
    benchmarkWindow.__KAUR_KHOR_BENCHMARK_DIALOG_OPENED_AT__ = undefined;
    benchmarkWindow.__KAUR_KHOR_BENCHMARK_DIALOG_OBSERVER__?.disconnect();

    const markIfDialogExists = () => {
      if (benchmarkWindow.__KAUR_KHOR_BENCHMARK_DIALOG_OPENED_AT__ != null) {
        return true;
      }
      const dialog = document.querySelector('[role="dialog"]');
      if (!(dialog instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(dialog);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      benchmarkWindow.__KAUR_KHOR_BENCHMARK_DIALOG_OPENED_AT__ = Date.now();
      benchmarkWindow.__KAUR_KHOR_BENCHMARK_DIALOG_OBSERVER__?.disconnect();
      benchmarkWindow.__KAUR_KHOR_BENCHMARK_DIALOG_OBSERVER__ = undefined;
      return true;
    };

    if (markIfDialogExists()) {
      return;
    }

    const observer = new MutationObserver(() => {
      markIfDialogExists();
    });
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    benchmarkWindow.__KAUR_KHOR_BENCHMARK_DIALOG_OBSERVER__ = observer;
  });
}

async function dialogOpenedTimestamp(page: Page) {
  return await page.evaluate(() =>
    (window as Window & { __KAUR_KHOR_BENCHMARK_DIALOG_OPENED_AT__?: number })
      .__KAUR_KHOR_BENCHMARK_DIALOG_OPENED_AT__);
}

export async function closeVisibleDialog(page: Page) {
  const dialog = page.getByRole('dialog').last();
  if (!(await dialog.isVisible().catch(() => false))) {
    return;
  }
  await page.keyboard.press('Escape');
  const discardButton = page.getByRole('button', { name: 'Discard changes' });
  if (await discardButton.isVisible().catch(() => false)) {
    await discardButton.click();
  }
  await dialog.waitFor({ state: 'hidden', timeout: 30_000 });
}

export async function openWorkSupplierDrawerAndRecordDuration(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'outputDirectory' | 'page'>,
  metricName = 'interaction.open_work_supplier_drawer_ms',
) {
  const actionButtons = launched.page.locator('[data-slot="overview-task-row"] button[type="button"]');
  await assertLocatorCountAtLeast(actionButtons, 1, 'work supplier drawer action button(s)');
  await armDialogOpenedTimestamp(launched.page);
  const startedAt = await clickWithBrowserStartTime(actionButtons.first());
  await launched.page.getByRole('dialog').waitFor({ state: 'visible', timeout: 30_000 });
  const durationMs = (await dialogOpenedTimestamp(launched.page) ?? Date.now()) - startedAt;
  await recordPlaywrightDuration(launched.page, {
    metricName,
    durationMs,
    route: '/work/queue?workflow=supplier&filter=all',
    category: 'interaction',
  });
  return durationMs;
}

export async function openWorkCustomerIntakeDrawerAndRecordDuration(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'outputDirectory' | 'page'>,
  metricName = 'interaction.open_work_customer_intake_drawer_ms',
) {
  const intakeButtons = launched.page.locator('[data-customer-task-id] button');
  await assertLocatorCountAtLeast(intakeButtons, 1, 'work customer intake action button(s)');
  await armDialogOpenedTimestamp(launched.page);
  const startedAt = await clickWithBrowserStartTime(intakeButtons.first());
  await launched.page.getByRole('dialog').filter({ hasText: 'Telegram intake' }).waitFor({ state: 'visible', timeout: 30_000 });
  const durationMs = (await dialogOpenedTimestamp(launched.page) ?? Date.now()) - startedAt;
  await recordPlaywrightDuration(launched.page, {
    metricName,
    durationMs,
    route: '/work/queue?workflow=customer&customerFilter=review',
    category: 'interaction',
  });
  return durationMs;
}

export async function openAutomationIntakeDrawerAndRecordDuration(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'outputDirectory' | 'page'>,
  metricName = 'interaction.open_automation_intake_drawer_ms',
) {
  const intakeButtons = launched.page.getByRole('button', { name: /Open intake/i });
  await assertLocatorCountAtLeast(intakeButtons, 1, 'automation intake action button(s)');
  const startedAt = await clickWithBrowserStartTime(intakeButtons.first());
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
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'outputDirectory' | 'page'>,
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
      kaurKhorDesktop?: {
        automation?: {
          seedBenchmarkWorkspace?: (payload?: {
            minimumExposedRows?: number;
            minimumIntakes?: number;
          }) => Promise<{
            exposedRows: number;
            intakeRows: number;
            needsReviewRows: number;
            targetSupplierFilterLabel: string;
          }>;
        };
      };
    };
    const automation = benchmarkWindow.kaurKhorDesktop?.automation;
    if (!automation?.seedBenchmarkWorkspace) {
      throw new Error('Automations bridge is unavailable in benchmark mode.');
    }
    return automation.seedBenchmarkWorkspace({
      minimumExposedRows: nextMinimumExposedRows,
      minimumIntakes: nextMinimumIntakes,
    });
  }, {
    minimumExposedRows,
    minimumIntakes,
  });

  const priorWorkspaceReadyEvents = await benchmarkEventCount(launched, 'renderer.workspace.ready');
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

export async function closeKaurKhorBenchmarkAppWithTargetCoverage(
  launched: LaunchedKaurKhorBenchmarkApp,
  scenarioName: KaurKhorBenchmarkScenarioId,
  expectedMetricNames: string[],
  priorError: unknown = null,
) {
  let summary: BenchmarkScenarioSummary;
  try {
    summary = await closeKaurKhorBenchmarkApp(launched, scenarioName);
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
  event: Omit<KaurKhorBenchmarkEventInput, 'layer'>,
) {
  await page.evaluate((input) => {
    const benchmarkWindow = window as Window & {
      __KAUR_KHOR_BENCHMARK_EVENTS__?: unknown[];
      kaurKhorDesktop: {
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
      runId: input.runId ?? benchmarkWindow.kaurKhorDesktop.benchmark?.runId ?? 'playwright',
      ts: input.ts ?? Date.now(),
    };
    if (typeof normalized.name === 'string' && normalized.name.startsWith('benchmark.phase.')) {
      normalized.detail = {
        ...normalized.detail,
        performanceNow: performance.now(),
      };
    }
    benchmarkWindow.__KAUR_KHOR_BENCHMARK_EVENTS__ ??= [];
    benchmarkWindow.__KAUR_KHOR_BENCHMARK_EVENTS__.push(normalized);
    benchmarkWindow.kaurKhorDesktop.benchmark?.recordEvent(normalized);
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
    category?: KaurKhorBenchmarkCategory;
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

export async function recordBenchmarkPhaseMarker(
  page: Page,
  marker: 'seed_end' | 'measurement_start' | 'measurement_end',
  detail?: Record<string, unknown>,
) {
  await recordPlaywrightBenchmarkEvent(page, {
    category: 'startup',
    command: null,
    detail: detail ?? {},
    name: `benchmark.phase.${marker}`,
    phase: 'instant',
    route: null,
  });
}

export async function markBenchmarkMeasurementStart(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'page'>,
  detail?: Record<string, unknown>,
) {
  await recordBenchmarkPhaseMarker(launched.page, 'measurement_start', detail);
}

export async function markBenchmarkMeasurementEnd(
  launched: Pick<LaunchedKaurKhorBenchmarkApp, 'page'>,
  detail?: Record<string, unknown>,
) {
  await recordBenchmarkPhaseMarker(launched.page, 'measurement_end', detail);
}

export async function snapshotRendererBenchmarkMemory(page: Page, name: string) {
  await page.evaluate((snapshotName) => {
    const benchmarkWindow = window as Window & {
      __KAUR_KHOR_BENCHMARK_EVENTS__?: unknown[];
      kaurKhorDesktop: {
        benchmark?: {
          runId: string;
          recordEvent: (event: unknown) => void;
        };
      };
    };
    benchmarkWindow.__KAUR_KHOR_BENCHMARK_EVENTS__ ??= [];
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
      runId: benchmarkWindow.kaurKhorDesktop.benchmark?.runId ?? 'playwright',
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
    benchmarkWindow.__KAUR_KHOR_BENCHMARK_EVENTS__.push(event);
    benchmarkWindow.kaurKhorDesktop.benchmark?.recordEvent(event);
  }, name);
}
