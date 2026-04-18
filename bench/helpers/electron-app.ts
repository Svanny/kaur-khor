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

export interface LaunchedBanjiBenchmarkApp {
  app: ElectronApplication;
  outputDirectory: string;
  page: Page;
  runId: string;
}

export async function launchBanjiForBenchmark(
  scenarioName: string,
  testInfo: TestInfo,
): Promise<LaunchedBanjiBenchmarkApp> {
  const runId = benchmarkRunId(`${scenarioName}-${testInfo.retry}`);
  const outputDirectory = await benchmarkOutputDirectory(runId);
  const dataDirectory = await benchmarkDataDirectory(runId);
  await prepareBenchmarkWorkspace({ dataDirectory, size: 'medium' });
  const app = await electron.launch({
    executablePath: electronPath as string,
    args: ['.'],
    env: {
      ...process.env,
      BANJI_BENCHMARK: '1',
      BANJI_BENCHMARK_RUN_ID: runId,
      BANJI_BENCHMARK_OUTPUT_DIR: outputDirectory,
      BANJI_BENCHMARK_DATA_DIR: dataDirectory,
      BANJI_DESKTOP_TRACE_IPC: '1',
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, outputDirectory, page, runId };
}

export async function closeBanjiBenchmarkApp(
  launched: LaunchedBanjiBenchmarkApp,
  scenarioName: string,
): Promise<BenchmarkScenarioSummary> {
  await launched.app.close();
  const events = await readBenchmarkEvents(launched.outputDirectory);
  const summary = buildScenarioSummary({
    events,
    runId: launched.runId,
    scenario: scenarioName,
  });
  await writeScenarioSummary(launched.outputDirectory, summary);
  return summary;
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
