import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BrowserWindow, Notification, ipcMain, shell } from 'electron';
import {
  BANJI_BENCHMARK_SCENARIOS,
  aggregateBenchmarkScenarioSummaries,
  type BanjiBenchmarkComparison,
  type BanjiBenchmarkComparisonMetric,
  type BanjiBenchmarkRunEvent,
  type BanjiBenchmarkRunOptions,
  type BanjiBenchmarkRunRecord,
  type BanjiBenchmarkRunStatus,
  type BanjiBenchmarkScenarioId,
  type BanjiBenchmarkScenarioSummary,
} from '@shared/benchmark';
import { IPC_CHANNELS } from '@shared/ipc';
import {
  benchmarkRunCompletionNotification,
  cancelBenchmarkRunRecord,
  isBenchmarkRunInFlight,
  isBenchmarkRunTerminal,
  reconcileBenchmarkRunRecord,
} from './benchmark-runner-state';

const MAX_TAIL_LINES = 200;
const RUN_RECORD_DIRECTORY = 'gui-runs';

const SCENARIO_FILE_BY_ID: Record<BanjiBenchmarkScenarioId, string> = {
  startup: 'bench/scenarios/startup.bench.ts',
  navigation: 'bench/scenarios/navigation.bench.ts',
  'record-update': 'bench/scenarios/record-update.bench.ts',
  'detail-pages': 'bench/scenarios/detail-pages.bench.ts',
  stability: 'bench/scenarios/stability.bench.ts',
};

type ActiveBenchmarkRun = {
  children: Set<ChildProcessWithoutNullStreams>;
  record: BanjiBenchmarkRunRecord;
  cancelled: boolean;
};

function boundedTail(lines: string[], nextLine: string) {
  return [...lines, nextLine].slice(-MAX_TAIL_LINES);
}

function safeRunId(runId: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) {
    throw new Error('Invalid benchmark run id.');
  }
  return runId;
}

function summarizeMetricValue(summary: BanjiBenchmarkScenarioSummary, name: string) {
  return summary.derivedMetrics?.[name] ?? summary.metrics?.[name]?.median ?? null;
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  const raw = await readFile(path, 'utf8').catch(() => null);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as T;
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(path);
      }
      return [path];
    }),
  );
  return files.flat();
}

function normalizeRunOptions(options: BanjiBenchmarkRunOptions): BanjiBenchmarkRunOptions {
  const validScenarioIds = new Set(BANJI_BENCHMARK_SCENARIOS.map((scenario) => scenario.id));
  const scenarios = options.scenarios.filter((scenario) => validScenarioIds.has(scenario));
  if (scenarios.length === 0) {
    throw new Error('Select at least one benchmark scenario.');
  }
  return {
    scenarios,
    fixtureSize: ['minimal', 'medium', 'heavy'].includes(options.fixtureSize) ? options.fixtureSize : 'medium',
    traceEnabled: Boolean(options.traceEnabled),
    repeatCount: Math.min(5, Math.max(1, Math.floor(Number(options.repeatCount) || 1))),
    buildBeforeRun: options.buildBeforeRun !== false,
  };
}

export function registerBenchmarkRunnerIpc({
  appIsPackaged,
  projectRoot,
}: {
  appIsPackaged: boolean;
  projectRoot: string;
}) {
  const resultsDirectory = resolve(projectRoot, 'bench-results');
  const runRecordsDirectory = join(resultsDirectory, RUN_RECORD_DIRECTORY);
  let activeRun: ActiveBenchmarkRun | null = null;
  const notifiedRunIds = new Set<string>();

  function recordPath(runId: string) {
    return join(runRecordsDirectory, `${safeRunId(runId)}.json`);
  }

  async function persistRecord(record: BanjiBenchmarkRunRecord) {
    await mkdir(runRecordsDirectory, { recursive: true });
    await writeFile(recordPath(record.runId), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  }

  function emitRunEvent(event: BanjiBenchmarkRunEvent) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.benchmarkRunnerEvent, event);
    }
  }

  function notifyRunCompletion(record: BanjiBenchmarkRunRecord) {
    if (!isBenchmarkRunTerminal(record.status) || notifiedRunIds.has(record.runId)) {
      return;
    }
    notifiedRunIds.add(record.runId);

    if (!Notification.isSupported()) {
      return;
    }
    const notification = benchmarkRunCompletionNotification(record);
    if (!notification) {
      return;
    }
    const desktopNotification = new Notification(notification);
    desktopNotification.on('click', () => {
      const [window] = BrowserWindow.getAllWindows();
      window?.show();
      window?.focus();
    });
    desktopNotification.show();
  }

  async function setRunStatus(
    run: ActiveBenchmarkRun,
    status: BanjiBenchmarkRunStatus,
    message: string,
    extra?: Partial<BanjiBenchmarkRunRecord>,
  ) {
    run.record = {
      ...run.record,
      ...extra,
      status,
      completedAt: ['passed', 'failed', 'cancelled'].includes(status) ? new Date().toISOString() : run.record.completedAt,
    };
    await persistRecord(run.record);
    emitRunEvent({ runId: run.record.runId, status, message, record: run.record });
    notifyRunCompletion(run.record);
  }

  async function readRun(runId: string) {
    const record = await readJsonFile<BanjiBenchmarkRunRecord>(recordPath(runId));
    if (!record) {
      return null;
    }
    if (activeRun && activeRun.record.runId === record.runId) {
      return activeRun.record;
    }
    const reconciled = reconcileBenchmarkRunRecord(record, activeRun?.record.runId ?? null);
    if (reconciled !== record) {
      await persistRecord(reconciled);
    }
    return reconciled;
  }

  async function readStoredRun(runId: string) {
    return readJsonFile<BanjiBenchmarkRunRecord>(recordPath(runId));
  }

  async function collectSummaries(record: BanjiBenchmarkRunRecord): Promise<BanjiBenchmarkScenarioSummary[]> {
    const startedMs = new Date(record.startedAt).getTime();
    const files = await walkFiles(resultsDirectory);
    const summaries = await Promise.all(
      files
        .filter((file) => file.endsWith('.summary.json'))
        .map(async (file) => {
          const fileStat = await stat(file).catch(() => null);
          if (!fileStat || fileStat.mtimeMs < startedMs) {
            return null;
          }
          return readJsonFile<BanjiBenchmarkScenarioSummary>(file);
        }),
    );
    const freshSummaries = summaries
      .filter((summary): summary is BanjiBenchmarkScenarioSummary => Boolean(summary))
      .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
    return aggregateBenchmarkScenarioSummaries({
      runId: record.runId,
      summaries: freshSummaries,
    });
  }

  async function spawnStep(
    run: ActiveBenchmarkRun,
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ) {
    await setRunStatus(run, 'running', `${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: 'pipe',
    });
    run.children.add(child);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
        run.record.stdoutTail = boundedTail(run.record.stdoutTail, line);
        emitRunEvent({
          runId: run.record.runId,
          status: run.record.status,
          message: line,
          stream: 'stdout',
          line,
        });
      }
    });
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
        run.record.stderrTail = boundedTail(run.record.stderrTail, line);
        emitRunEvent({
          runId: run.record.runId,
          status: run.record.status,
          message: line,
          stream: 'stderr',
          line,
        });
      }
    });

    const exitCode = await new Promise<number | null>((resolveExit) => {
      child.once('exit', (code) => resolveExit(code));
    });
    run.children.delete(child);
    await persistRecord(run.record);
    if (run.cancelled) {
      throw new Error('cancelled');
    }
    if (exitCode !== 0) {
      throw new Error(`${command} ${args.join(' ')} exited with ${exitCode ?? 'unknown'}`);
    }
  }

  async function spawnScenarioRepeat(
    run: ActiveBenchmarkRun,
    scenario: BanjiBenchmarkScenarioId,
    repeatIndex: number,
    env: NodeJS.ProcessEnv,
  ) {
    const repeatLabel = run.record.repeatCount > 1
      ? `repeat ${repeatIndex + 1}/${run.record.repeatCount}`
      : 'repeat 1/1';
    const reportDirectory = join(resultsDirectory, 'playwright-reports');
    const artifactsDirectory = join(
      resultsDirectory,
      'playwright-artifacts',
      `${run.record.runId}-${scenario}-repeat-${repeatIndex + 1}`,
    );
    await mkdir(reportDirectory, { recursive: true });
    await mkdir(artifactsDirectory, { recursive: true });
    const repeatEnv = {
      ...env,
      BANJI_BENCHMARK_REPEAT_INDEX: String(repeatIndex),
      BANJI_BENCHMARK_PLAYWRIGHT_REPORT: join(
        reportDirectory,
        `${run.record.runId}-${scenario}-repeat-${repeatIndex + 1}.json`,
      ),
      BANJI_BENCHMARK_PLAYWRIGHT_ARTIFACTS_DIR: artifactsDirectory,
    };

    await spawnStep(
      run,
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '-c',
        'playwright.bench.config.ts',
        SCENARIO_FILE_BY_ID[scenario],
      ],
      repeatEnv,
    ).catch((error) => {
      if (error instanceof Error) {
        throw new Error(`${scenario} ${repeatLabel} failed: ${error.message}`);
      }
      throw error;
    });
  }

  async function runBenchmark(record: BanjiBenchmarkRunRecord) {
    if (!activeRun || activeRun.record.runId !== record.runId) {
      return;
    }
    const run = activeRun;
    const env = {
      ...process.env,
      BANJI_BENCHMARK_TRACE: record.traceEnabled ? '1' : '0',
      BANJI_BENCHMARK_FIXTURE_SIZE: record.fixtureSize,
    };

    try {
      if (record.buildBeforeRun) {
        await spawnStep(run, 'pnpm', ['build'], env);
      }
      for (const scenario of record.scenarios) {
        await setRunStatus(
          run,
          'running',
          `Running ${scenario} with ${record.repeatCount} parallel repeat${record.repeatCount === 1 ? '' : 's'}.`,
        );
        const results = await Promise.allSettled(
          Array.from({ length: record.repeatCount }, (_value, repeatIndex) =>
            spawnScenarioRepeat(run, scenario, repeatIndex, env)),
        );
        if (run.cancelled) {
          throw new Error('cancelled');
        }
        const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failed) {
          throw failed.reason;
        }
      }
      const summaries = await collectSummaries(record);
      await setRunStatus(run, 'passed', 'Benchmark run completed.', {
        summaries,
        exitCode: 0,
      });
    } catch (error) {
      const cancelled = run.cancelled || (error instanceof Error && error.message === 'cancelled');
      const summaries = await collectSummaries(record);
      await setRunStatus(run, cancelled ? 'cancelled' : 'failed', cancelled ? 'Benchmark run cancelled.' : 'Benchmark run failed.', {
        summaries,
        exitCode: cancelled ? null : 1,
        error: cancelled ? null : error instanceof Error ? error.message : String(error),
      });
    } finally {
      activeRun = null;
    }
  }

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerGetAvailability, async () => ({
    available: !appIsPackaged,
    reason: appIsPackaged ? 'Benchmark runner is disabled in packaged builds.' : null,
    projectRoot,
    resultsDirectory,
    activeRunId: activeRun?.record.runId ?? null,
  }));

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerListRuns, async () => {
    await mkdir(runRecordsDirectory, { recursive: true });
    const entries = await readdir(runRecordsDirectory).catch(() => []);
    const runs = await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.json'))
        .map(async (entry) => {
          const record = await readJsonFile<BanjiBenchmarkRunRecord>(join(runRecordsDirectory, entry));
          if (!record) {
            return null;
          }
          if (activeRun && activeRun.record.runId === record.runId) {
            return activeRun.record;
          }
          const reconciled = reconcileBenchmarkRunRecord(record, activeRun?.record.runId ?? null);
          if (reconciled !== record) {
            await persistRecord(reconciled);
          }
          return reconciled;
        }),
    );
    return runs
      .filter((run): run is BanjiBenchmarkRunRecord => Boolean(run))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  });

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerReadRun, async (_event, runId: string) =>
    readRun(runId),
  );

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerStartRun, async (_event, options: BanjiBenchmarkRunOptions) => {
    if (appIsPackaged) {
      throw new Error('Benchmark runner is disabled in packaged builds.');
    }
    if (activeRun) {
      throw new Error(`Benchmark run ${activeRun.record.runId} is already running.`);
    }

    const normalizedOptions = normalizeRunOptions(options);
    const runId = `gui-${Date.now()}`;
    const record: BanjiBenchmarkRunRecord = {
      runId,
      scenarios: normalizedOptions.scenarios,
      status: 'queued',
      startedAt: new Date().toISOString(),
      completedAt: null,
      fixtureSize: normalizedOptions.fixtureSize,
      traceEnabled: normalizedOptions.traceEnabled,
      repeatCount: normalizedOptions.repeatCount,
      buildBeforeRun: normalizedOptions.buildBeforeRun,
      outputDirectory: resultsDirectory,
      exitCode: null,
      summaries: [],
      stdoutTail: [],
      stderrTail: [],
      error: null,
    };
    activeRun = { children: new Set(), record, cancelled: false };
    await persistRecord(record);
    emitRunEvent({ runId, status: 'queued', message: 'Benchmark run queued.', record });
    void runBenchmark(record);
    return record;
  });

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerCancelRun, async (_event, runId: string) => {
    if (activeRun && activeRun.record.runId === runId) {
      activeRun.cancelled = true;
      for (const child of activeRun.children) {
        child.kill('SIGTERM');
      }
      await setRunStatus(activeRun, 'cancelled', 'Benchmark cancellation requested.');
      return activeRun.record;
    }

    const storedRun = await readStoredRun(runId);
    if (!storedRun) {
      throw new Error('Benchmark run not found.');
    }

    const cancelledRun = isBenchmarkRunInFlight(storedRun.status)
      ? cancelBenchmarkRunRecord(storedRun)
      : storedRun;
    if (cancelledRun !== storedRun) {
      await persistRecord(cancelledRun);
      emitRunEvent({
        runId: cancelledRun.runId,
        status: cancelledRun.status,
        message: 'Benchmark cancellation requested.',
        record: cancelledRun,
      });
      notifyRunCompletion(cancelledRun);
    }
    return cancelledRun;
  });

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerCompareRuns, async (_event, payload: { baselineRunId: string; candidateRunId: string }) => {
    const baseline = await readRun(payload.baselineRunId);
    const candidate = await readRun(payload.candidateRunId);
    if (!baseline || !candidate) {
      throw new Error('Both benchmark runs are required for comparison.');
    }

    const metricNames = new Set<string>();
    for (const run of [baseline, candidate]) {
      for (const summary of run.summaries) {
        Object.keys(summary.metrics ?? {}).forEach((metric) => metricNames.add(metric));
        Object.keys(summary.derivedMetrics ?? {}).forEach((metric) => metricNames.add(metric));
      }
    }

    function valueFor(run: BanjiBenchmarkRunRecord, metricName: string) {
      for (const summary of run.summaries) {
        const value = summarizeMetricValue(summary, metricName);
        if (value != null) {
          return value;
        }
      }
      return null;
    }

    const metrics: BanjiBenchmarkComparisonMetric[] = [...metricNames].sort().map((metricName) => {
      const baselineValue = valueFor(baseline, metricName);
      const candidateValue = valueFor(candidate, metricName);
      if (baselineValue == null || candidateValue == null) {
        return {
          metricName,
          baseline: baselineValue,
          candidate: candidateValue,
          delta: null,
          percent: null,
          status: 'missing',
        };
      }
      const delta = candidateValue - baselineValue;
      const percent = baselineValue === 0 ? 0 : (delta / baselineValue) * 100;
      return {
        metricName,
        baseline: baselineValue,
        candidate: candidateValue,
        delta,
        percent,
        status: percent > 10 ? 'regression' : percent < -10 ? 'improvement' : 'same',
      };
    });

    return {
      baselineRunId: baseline.runId,
      candidateRunId: candidate.runId,
      metrics,
    } satisfies BanjiBenchmarkComparison;
  });

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerRevealRun, async (_event, runId: string) => {
    const run = await readRun(runId);
    if (!run) {
      throw new Error('Benchmark run not found.');
    }
    const openError = await shell.openPath(run.outputDirectory);
    if (openError) {
      throw new Error(openError);
    }
  });
}
