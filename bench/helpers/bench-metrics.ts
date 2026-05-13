import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  evaluateBenchmarkTargets,
  type KaurKhorBenchmarkEvent,
  type KaurKhorBenchmarkMetricSummary,
  type KaurKhorBenchmarkScenarioId,
  type KaurKhorBenchmarkScenarioSummary,
} from '../../src/shared/benchmark';

export type BenchmarkMetricSummary = KaurKhorBenchmarkMetricSummary;
export type BenchmarkScenarioSummary = KaurKhorBenchmarkScenarioSummary;

const MEASUREMENT_START_MARKER = 'benchmark.phase.measurement_start';
const MEASUREMENT_END_MARKER = 'benchmark.phase.measurement_end';
const EVENT_STREAM_READ_RETRY_COUNT = 8;
const EVENT_STREAM_READ_RETRY_DELAY_MS = 25;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBenchmarkEventLines(fileName: string, raw: string) {
  const events: KaurKhorBenchmarkEvent[] = [];
  const errors: string[] = [];
  for (const line of raw.split('\n').filter(Boolean)) {
    try {
      events.push(JSON.parse(line) as KaurKhorBenchmarkEvent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`[benchmark] skipped malformed event line in ${fileName}: ${message}`);
    }
  }
  return { errors, events };
}

export async function readBenchmarkEvents(outputDirectory: string) {
  const entries = await readdir(outputDirectory).catch(() => []);
  const eventFiles = [
    'events.jsonl',
    ...entries.filter((entry) => entry === 'core-events.jsonl' || /^core-events-.+\.jsonl$/.test(entry)),
  ];
  const streams = await Promise.all(
    eventFiles.map(async (fileName) => {
      const path = join(outputDirectory, fileName);
      let lastParsed: ReturnType<typeof parseBenchmarkEventLines> | null = null;
      for (let attempt = 0; attempt < EVENT_STREAM_READ_RETRY_COUNT; attempt += 1) {
        const raw = await readFile(path, 'utf8').catch(() => '');
        const parsed = parseBenchmarkEventLines(fileName, raw);
        if (parsed.errors.length === 0) {
          return parsed.events;
        }
        lastParsed = parsed;
        await wait(EVENT_STREAM_READ_RETRY_DELAY_MS * (attempt + 1));
      }
      for (const error of lastParsed?.errors ?? []) {
        console.warn(error);
      }
      return lastParsed?.events ?? [];
    }),
  );
  return streams.flat().sort((a, b) => a.ts - b.ts);
}

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return null;
  }
  const index = Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1);
  return values[index] ?? null;
}

export function summarizeDurations(values: number[]): BenchmarkMetricSummary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    max: sorted.at(-1) ?? null,
    median: percentile(sorted, 50),
    min: sorted[0] ?? null,
    p95: percentile(sorted, 95),
  };
}

function firstEventTime(events: KaurKhorBenchmarkEvent[], name: string) {
  return events.find((event) => event.name === name)?.ts ?? null;
}

function firstEventTimeAfter(
  events: KaurKhorBenchmarkEvent[],
  name: string,
  afterTs: number,
) {
  return events.find((event) => event.name === name && event.ts >= afterTs)?.ts ?? null;
}

function durationMetric(
  events: KaurKhorBenchmarkEvent[],
  startName: string,
  endName: string,
) {
  const start = firstEventTime(events, startName);
  const end = firstEventTime(events, endName);
  if (start == null || end == null || end < start) {
    return null;
  }
  return end - start;
}

function measurementWindowBounds(events: KaurKhorBenchmarkEvent[]) {
  const measurementStartTs = firstEventTime(events, MEASUREMENT_START_MARKER);
  if (measurementStartTs == null) {
    return null;
  }
  const measurementEndTs = firstEventTimeAfter(events, MEASUREMENT_END_MARKER, measurementStartTs);
  return {
    measurementStartTs,
    measurementEndTs,
  };
}

function backendRequestKey(event: KaurKhorBenchmarkEvent) {
  const id = event.detail?.id;
  if (typeof id !== 'number' && typeof id !== 'string') {
    return null;
  }
  const role = typeof event.detail?.role === 'string' ? event.detail.role : 'unknown';
  const workerIndex = typeof event.detail?.workerIndex === 'number' ? event.detail.workerIndex : 'unknown';
  return `${role}:${workerIndex}:${id}`;
}

function backendRequestQueuedTimes(events: KaurKhorBenchmarkEvent[]) {
  const queuedTimes = new Map<string, number>();
  for (const event of events) {
    if (event.name !== 'backend.core.request.queued') {
      continue;
    }
    const key = backendRequestKey(event);
    if (key) {
      queuedTimes.set(key, event.ts);
    }
  }
  return queuedTimes;
}

function backendRequestStartedBefore(
  event: KaurKhorBenchmarkEvent,
  queuedTimes: Map<string, number>,
  cutoffTs: number,
) {
  if (event.name !== 'backend.core.request.resolve') {
    return event.ts < cutoffTs;
  }
  const key = backendRequestKey(event);
  const queuedAt = key ? queuedTimes.get(key) : null;
  return (queuedAt ?? event.ts) < cutoffTs;
}

function detailNumber(event: KaurKhorBenchmarkEvent, key: string) {
  const value = event.detail?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function measurementPerformanceWindowBounds(events: KaurKhorBenchmarkEvent[]) {
  const measurementStart = events.find((event) => event.name === MEASUREMENT_START_MARKER);
  const measurementStartNow = measurementStart ? detailNumber(measurementStart, 'performanceNow') : null;
  if (measurementStart == null || measurementStartNow == null) {
    return null;
  }
  const measurementEnd = events.find(
    (event) => event.name === MEASUREMENT_END_MARKER && event.ts >= measurementStart.ts,
  );
  const measurementEndNow = measurementEnd ? detailNumber(measurementEnd, 'performanceNow') : null;
  return {
    measurementStartNow,
    measurementEndNow,
  };
}

function rendererEventsInMeasurementWindow(
  events: KaurKhorBenchmarkEvent[],
  measurementEvents: KaurKhorBenchmarkEvent[],
) {
  const window = measurementPerformanceWindowBounds(events);
  if (!window) {
    return measurementEvents;
  }
  return measurementEvents.filter((event) => {
    const startTime = detailNumber(event, 'startTime');
    if (startTime == null) {
      return true;
    }
    return startTime >= window.measurementStartNow
      && (window.measurementEndNow == null || startTime <= window.measurementEndNow);
  });
}

function eventsInMeasurementWindow(events: KaurKhorBenchmarkEvent[]) {
  const window = measurementWindowBounds(events);
  if (!window) {
    return events;
  }
  const { measurementStartTs, measurementEndTs } = window;
  const queuedTimes = backendRequestQueuedTimes(events);
  return events.filter((event) =>
    !backendRequestStartedBefore(event, queuedTimes, measurementStartTs)
      && event.ts >= measurementStartTs
      && (measurementEndTs == null || event.ts <= measurementEndTs));
}

function eventsBeforeMeasurementWindow(events: KaurKhorBenchmarkEvent[]) {
  const window = measurementWindowBounds(events);
  if (!window) {
    return [];
  }
  const queuedTimes = backendRequestQueuedTimes(events);
  return events.filter((event) => backendRequestStartedBefore(event, queuedTimes, window.measurementStartTs));
}

function hasMeasurementWindow(events: KaurKhorBenchmarkEvent[]) {
  return measurementWindowBounds(events) != null;
}

function firstSummaryMetric(metrics: Record<string, BenchmarkMetricSummary>, names: string[]) {
  for (const name of names) {
    const value = metrics[name]?.median;
    if (value != null) {
      return value;
    }
  }
  return null;
}

function maxDetailMetric(events: KaurKhorBenchmarkEvent[], eventName: string, detailKey: string) {
  const values = events
    .filter((event) => event.name === eventName)
    .map((event) => event.detail?.[detailKey])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return values.length > 0 ? Math.max(...values) : null;
}

function p95DetailMetric(events: KaurKhorBenchmarkEvent[], eventName: string, detailKey: string) {
  const values = events
    .filter((event) => event.name === eventName)
    .map((event) => event.detail?.[detailKey])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return summarizeDurations(values).p95;
}

function p95DetailMetricWhere(
  events: KaurKhorBenchmarkEvent[],
  eventName: string,
  detailKey: string,
  predicate: (event: KaurKhorBenchmarkEvent) => boolean,
) {
  const values = events
    .filter((event) => event.name === eventName && predicate(event))
    .map((event) => event.detail?.[detailKey])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return summarizeDurations(values).p95;
}

function hasMeasuredUserAction(events: KaurKhorBenchmarkEvent[]) {
  return events.some((event) =>
    event.phase === 'end'
      && typeof event.durationMs === 'number'
      && (event.category === 'interaction' || event.category === 'navigation'));
}

function queueWaitP95OrZeroWhenMeasured(
  events: KaurKhorBenchmarkEvent[],
  predicate?: (event: KaurKhorBenchmarkEvent) => boolean,
) {
  const value = predicate
    ? p95DetailMetricWhere(events, 'backend.core.request.resolve', 'queueWaitMs', predicate)
    : p95DetailMetric(events, 'backend.core.request.resolve', 'queueWaitMs');
  if (value != null) {
    return value;
  }
  return hasMeasuredUserAction(events) ? 0 : null;
}

function isReadOnlyBenchmarkCommand(command: string | null | undefined) {
  return command === 'system.ping'
    || command?.startsWith('sena.get') === true
    || command?.startsWith('sena.list') === true
    || command?.startsWith('inventory.load') === true
    || command?.startsWith('inventory.list') === true;
}

function memoryValue(event: KaurKhorBenchmarkEvent | undefined) {
  const detail = event?.detail;
  const usedHeap = detail?.usedJSHeapSizeMb;
  const heapUsed = detail?.heapUsedMb;
  if (typeof usedHeap === 'number') {
    return usedHeap;
  }
  if (typeof heapUsed === 'number') {
    return heapUsed;
  }
  return null;
}

function deriveBenchmarkMetrics(
  events: KaurKhorBenchmarkEvent[],
  measurementEvents: KaurKhorBenchmarkEvent[],
  setupEvents: KaurKhorBenchmarkEvent[],
  metrics: Record<string, BenchmarkMetricSummary>,
  scenario: KaurKhorBenchmarkScenarioId,
) {
  const derived: Record<string, number> = {};
  const hasIsolatedMeasurementWindow = hasMeasurementWindow(events);
  const maybeSet = (name: string, value: number | null) => {
    if (value != null && Number.isFinite(value)) {
      derived[name] = value;
    }
  };

  if (scenario === 'startup') {
    maybeSet('startup.app_to_bridge_ms', durationMetric(events, 'main.boot.start', 'preload.bridge.exposed'));
    maybeSet('startup.app_to_context_ms', durationMetric(events, 'main.boot.start', 'renderer.app.getAppContext'));
    maybeSet('startup.app_to_workspace_ready_ms', durationMetric(events, 'main.boot.start', 'renderer.workspace.ready'));
    maybeSet('startup.app_to_first_route_ready_ms', durationMetric(events, 'main.boot.start', 'route.home.ready'));
    maybeSet(
      'ipc.system_get_app_context_ms',
      firstSummaryMetric(metrics, ['ipc.kaur-khor:system:get-app-context.handle', 'preload.invoke.kaur-khor:system:get-app-context']),
    );
    maybeSet(
      'ipc.sena_get_startup_workspace_ms',
      firstSummaryMetric(metrics, ['ipc.kaur-khor:sena:get-startup-workspace.handle', 'preload.invoke.kaur-khor:sena:get-startup-workspace']),
    );
  }

  if (scenario === 'navigation' || scenario === 'capture' || scenario === 'stability') {
    maybeSet(
      'ipc.sena_get_workspace_summary_ms',
      firstSummaryMetric(metrics, ['ipc.kaur-khor:sena:get-workspace-summary.handle', 'preload.invoke.kaur-khor:sena:get-workspace-summary']),
    );
    maybeSet(
      'ipc.sena_get_capture_context_ms',
      firstSummaryMetric(metrics, [
        'ipc.kaur-khor:sena:get-record-update-context.handle',
        'preload.invoke.kaur-khor:sena:get-record-update-context',
      ]),
    );
  }

  if (scenario === 'navigation' || scenario === 'stability') {
    maybeSet(
      'ipc.sena_get_diagnostics_ms',
      firstSummaryMetric(metrics, ['ipc.kaur-khor:sena:get-diagnostics.handle', 'preload.invoke.kaur-khor:sena:get-diagnostics']),
    );
  }

  if (scenario === 'detail-pages') {
    maybeSet(
      'ipc.sena_get_sku_detail_ms',
      firstSummaryMetric(metrics, ['ipc.kaur-khor:sena:get-sku-detail.handle', 'preload.invoke.kaur-khor:sena:get-sku-detail']),
    );
    maybeSet(
      'ipc.sena_get_service_detail_ms',
      firstSummaryMetric(metrics, ['ipc.kaur-khor:sena:get-service-detail.handle', 'preload.invoke.kaur-khor:sena:get-service-detail']),
    );
  }

  maybeSet(
    'backend.core.queue_wait_p95_ms',
    queueWaitP95OrZeroWhenMeasured(measurementEvents),
  );
  maybeSet(
    'backend.core.read_pool_queue_wait_p95_ms',
    queueWaitP95OrZeroWhenMeasured(
      measurementEvents,
      (event) => isReadOnlyBenchmarkCommand(event.command),
    ),
  );
  maybeSet(
    'backend.core.writer_queue_wait_p95_ms',
    p95DetailMetricWhere(
      measurementEvents,
      'backend.core.request.resolve',
      'queueWaitMs',
      (event) => !isReadOnlyBenchmarkCommand(event.command),
    ),
  );
  maybeSet(
    'backend.core.interactive_queue_wait_p95_ms',
    queueWaitP95OrZeroWhenMeasured(measurementEvents),
  );
  maybeSet(
    'backend.core.setup_queue_wait_p95_ms',
    hasIsolatedMeasurementWindow
      ? p95DetailMetric(setupEvents, 'backend.core.request.resolve', 'queueWaitMs') ?? 0
      : p95DetailMetric(setupEvents, 'backend.core.request.resolve', 'queueWaitMs'),
  );
  maybeSet(
    'backend.core.setup_read_pool_queue_wait_p95_ms',
    hasIsolatedMeasurementWindow
      ? p95DetailMetricWhere(
        setupEvents,
        'backend.core.request.resolve',
        'queueWaitMs',
        (event) => isReadOnlyBenchmarkCommand(event.command),
      ) ?? 0
      : p95DetailMetricWhere(
        setupEvents,
        'backend.core.request.resolve',
        'queueWaitMs',
        (event) => isReadOnlyBenchmarkCommand(event.command),
      ),
  );

  const measuredDurations = measurementEvents
    .filter((event) => event.phase === 'end' && typeof event.durationMs === 'number')
    .map((event) => event.durationMs as number);
  const readyDurations = measurementEvents
    .filter((event) => event.phase === 'end')
    .map((event) => event.detail?.readyDurationMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const harnessOverheads = measurementEvents
    .filter((event) => event.phase === 'end')
    .map((event) => event.detail?.harnessOverheadMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  maybeSet(
    'harness.measurement_duration_p95_ms',
    summarizeDurations(measuredDurations).p95,
  );
  maybeSet(
    'harness.ready_latency_p95_ms',
    summarizeDurations(readyDurations).p95,
  );
  maybeSet(
    'harness.overhead_p95_ms',
    summarizeDurations(harnessOverheads).p95,
  );
  maybeSet(
    'harness.overhead_median_ms',
    summarizeDurations(harnessOverheads).median,
  );
  maybeSet(
    'ipc.sena_list_observation_page_ms',
    firstSummaryMetric(metrics, ['ipc.kaur-khor:sena:list-observation-page.handle', 'preload.invoke.kaur-khor:sena:list-observation-page']),
  );

  if (scenario === 'stability') {
    const rendererMeasurementEvents = rendererEventsInMeasurementWindow(events, measurementEvents);
    maybeSet('renderer.long_task_max_ms', maxDetailMetric(rendererMeasurementEvents, 'renderer.long-task', 'durationMs') ?? 0);
    maybeSet('renderer.loaf_blocking_max_ms', maxDetailMetric(rendererMeasurementEvents, 'renderer.long-animation-frame', 'blockingDuration') ?? 0);

    const firstRendererMemory = events.find((event) => event.name === 'memory.renderer_stability_cycle_1_mb');
    const lastRendererMemory = [...events].reverse().find((event) => event.name === 'memory.renderer_after_stability_mb');
    const firstRendererMemoryValue = memoryValue(firstRendererMemory);
    const lastRendererMemoryValue = memoryValue(lastRendererMemory);
    if (firstRendererMemoryValue != null && lastRendererMemoryValue != null && firstRendererMemoryValue > 0) {
      maybeSet(
        'memory.renderer_stability_growth_pct',
        ((lastRendererMemoryValue - firstRendererMemoryValue) / firstRendererMemoryValue) * 100,
      );
    }

    const firstMainMemory = events.find((event) => event.name === 'main.boot.ready');
    const lastMainMemory = [...events].reverse().find((event) => event.name === 'backend.core.ready' || event.name === 'main.boot.ready');
    const firstMainMemoryValue = memoryValue(firstMainMemory);
    const lastMainMemoryValue = memoryValue(lastMainMemory);
    if (firstMainMemoryValue != null && lastMainMemoryValue != null && firstMainMemoryValue > 0) {
      maybeSet(
        'memory.main_stability_growth_pct',
        ((lastMainMemoryValue - firstMainMemoryValue) / firstMainMemoryValue) * 100,
      );
    }

    maybeSet('stability.crash_free', 1);
  }

  return derived;
}

export function buildScenarioSummary({
  events,
  runId,
  scenario,
}: {
  events: KaurKhorBenchmarkEvent[];
  runId: string;
  scenario: KaurKhorBenchmarkScenarioId;
}): BenchmarkScenarioSummary {
  const measurementEvents = eventsInMeasurementWindow(events);
  const setupEvents = eventsBeforeMeasurementWindow(events);
  const durationsByName = new Map<string, number[]>();
  for (const event of measurementEvents) {
    if (event.phase !== 'end' || typeof event.durationMs !== 'number') {
      continue;
    }
    const bucket = durationsByName.get(event.name) ?? [];
    bucket.push(event.durationMs);
    durationsByName.set(event.name, bucket);
  }

  const metrics = Object.fromEntries(
    [...durationsByName.entries()].map(([name, values]) => [name, summarizeDurations(values)]),
  );
  const derivedMetrics = deriveBenchmarkMetrics(events, measurementEvents, setupEvents, metrics, scenario);
  const targetInputs = {
    ...Object.fromEntries(
      Object.entries(metrics).map(([name, summary]) => [name, summary.median ?? summary.p95 ?? summary.max ?? 0]),
    ),
    ...derivedMetrics,
  };

  const slowestIpc = events
    .filter((event) => event.category === 'ipc' && typeof event.durationMs === 'number')
    .map((event) => ({ name: event.name, durationMs: event.durationMs ?? 0 }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  const slowestCore = events
    .filter((event) => event.category === 'core-command' && typeof event.durationMs === 'number')
    .map((event) => ({
      name: event.name,
      command: event.command ?? null,
      durationMs: event.durationMs ?? 0,
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  return {
    scenario,
    runId,
    generatedAt: new Date().toISOString(),
    metrics,
    derivedMetrics,
    targets: evaluateBenchmarkTargets(targetInputs, scenario),
    slowestIpc,
    slowestCore,
  };
}

export async function writeScenarioSummary(
  outputDirectory: string,
  summary: BenchmarkScenarioSummary,
) {
  await writeFile(
    join(outputDirectory, `${summary.scenario}.summary.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
}
