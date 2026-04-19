import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
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
  fixtureSize?: 'minimal' | 'medium' | 'heavy';
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

export async function navigateHashRoute(page: Page, route: `/${string}`) {
  await page.evaluate((nextRoute) => {
    window.location.hash = nextRoute;
  }, route);
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
      route: window.location.hash.replace(/^#/, '') || '/',
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
    const event = {
      runId: benchmarkWindow.banjiDesktop.benchmark?.runId ?? 'playwright',
      ts: Date.now(),
      layer: 'playwright' as const,
      category: 'memory' as const,
      name: snapshotName,
      phase: 'instant' as const,
      route: window.location.hash.replace(/^#/, '') || '/',
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
