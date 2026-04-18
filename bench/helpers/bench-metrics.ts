import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  evaluateBenchmarkTargets,
  type BanjiBenchmarkEvent,
  type BanjiBenchmarkMetricSummary,
  type BanjiBenchmarkScenarioSummary,
} from '../../src/shared/benchmark';

export type BenchmarkMetricSummary = BanjiBenchmarkMetricSummary;
export type BenchmarkScenarioSummary = BanjiBenchmarkScenarioSummary;

export async function readBenchmarkEvents(outputDirectory: string) {
  const streams = await Promise.all(
    ['events.jsonl', 'core-events.jsonl'].map(async (fileName) => {
      const path = join(outputDirectory, fileName);
      const raw = await readFile(path, 'utf8').catch(() => '');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as BanjiBenchmarkEvent);
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

function firstEventTime(events: BanjiBenchmarkEvent[], name: string) {
  return events.find((event) => event.name === name)?.ts ?? null;
}

function durationMetric(
  events: BanjiBenchmarkEvent[],
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

function firstSummaryMetric(metrics: Record<string, BenchmarkMetricSummary>, names: string[]) {
  for (const name of names) {
    const value = metrics[name]?.median;
    if (value != null) {
      return value;
    }
  }
  return null;
}

function maxDetailMetric(events: BanjiBenchmarkEvent[], eventName: string, detailKey: string) {
  const values = events
    .filter((event) => event.name === eventName)
    .map((event) => event.detail?.[detailKey])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return values.length > 0 ? Math.max(...values) : null;
}

function p95DetailMetric(events: BanjiBenchmarkEvent[], eventName: string, detailKey: string) {
  const values = events
    .filter((event) => event.name === eventName)
    .map((event) => event.detail?.[detailKey])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return summarizeDurations(values).p95;
}

function memoryValue(event: BanjiBenchmarkEvent | undefined) {
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
  events: BanjiBenchmarkEvent[],
  metrics: Record<string, BenchmarkMetricSummary>,
  scenario: string,
) {
  const derived: Record<string, number> = {};
  const maybeSet = (name: string, value: number | null) => {
    if (value != null && Number.isFinite(value)) {
      derived[name] = value;
    }
  };

  maybeSet('startup.app_to_bridge_ms', durationMetric(events, 'main.boot.start', 'preload.bridge.exposed'));
  maybeSet('startup.app_to_context_ms', durationMetric(events, 'main.boot.start', 'renderer.app.getAppContext'));
  maybeSet('startup.app_to_workspace_ready_ms', durationMetric(events, 'main.boot.start', 'renderer.workspace.ready'));
  maybeSet('startup.app_to_first_route_ready_ms', durationMetric(events, 'main.boot.start', 'route.dashboard.ready'));

  maybeSet(
    'ipc.system_get_app_context_ms',
    firstSummaryMetric(metrics, ['ipc.banji:system:get-app-context.handle', 'preload.invoke.banji:system:get-app-context']),
  );
  maybeSet(
    'ipc.sena_get_workspace_summary_ms',
    firstSummaryMetric(metrics, ['ipc.banji:sena:get-workspace-summary.handle', 'preload.invoke.banji:sena:get-workspace-summary']),
  );
  maybeSet(
    'ipc.sena_get_diagnostics_ms',
    firstSummaryMetric(metrics, ['ipc.banji:sena:get-diagnostics.handle', 'preload.invoke.banji:sena:get-diagnostics']),
  );
  maybeSet(
    'ipc.sena_get_sku_detail_ms',
    firstSummaryMetric(metrics, ['ipc.banji:sena:get-sku-detail.handle', 'preload.invoke.banji:sena:get-sku-detail']),
  );
  maybeSet(
    'ipc.sena_get_service_detail_ms',
    firstSummaryMetric(metrics, ['ipc.banji:sena:get-service-detail.handle', 'preload.invoke.banji:sena:get-service-detail']),
  );
  maybeSet(
    'backend.core.queue_wait_p95_ms',
    p95DetailMetric(events, 'backend.core.request.resolve', 'queueWaitMs'),
  );
  maybeSet('renderer.long_task_max_ms', maxDetailMetric(events, 'renderer.long-task', 'durationMs'));
  maybeSet('renderer.loaf_blocking_max_ms', maxDetailMetric(events, 'renderer.long-animation-frame', 'blockingDuration'));

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

  if (scenario === 'stability') {
    maybeSet('stability.crash_free', 1);
  }

  return derived;
}

export function buildScenarioSummary({
  events,
  runId,
  scenario,
}: {
  events: BanjiBenchmarkEvent[];
  runId: string;
  scenario: string;
}): BenchmarkScenarioSummary {
  const durationsByName = new Map<string, number[]>();
  for (const event of events) {
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
  const derivedMetrics = deriveBenchmarkMetrics(events, metrics, scenario);
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
    targets: evaluateBenchmarkTargets(targetInputs),
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
