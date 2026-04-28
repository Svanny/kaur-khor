import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { buildScenarioSummary, readBenchmarkEvents } from './bench-metrics';
import { BENCHMARK_WORKSPACE_HISTORY_SIZES, normalizeBenchmarkWorkspaceSize } from './workspace-seed';
import type { BanjiBenchmarkEvent } from '../../src/shared/benchmark';

function benchmarkEvent(
  overrides: Partial<BanjiBenchmarkEvent>,
): BanjiBenchmarkEvent {
  return {
    runId: 'run-1',
    ts: 0,
    layer: 'playwright',
    category: 'startup',
    name: 'event',
    phase: 'instant',
    route: '/',
    entityType: null,
    entityId: null,
    command: null,
    durationMs: null,
    detail: {},
    ...overrides,
  };
}

describe('buildScenarioSummary', () => {
  it('ignores malformed trailing event lines from interrupted benchmark writers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'banji-bench-events-'));
    await writeFile(
      join(directory, 'events.jsonl'),
      `${JSON.stringify(benchmarkEvent({ name: 'good-event', ts: 10 }))}\n{"broken":\n`,
      'utf8',
    );
    await writeFile(join(directory, 'core-events.jsonl'), '', 'utf8');

    const events = await readBenchmarkEvents(directory);

    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('good-event');
  });

  it('retries transient partial event writes before warning', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'banji-bench-events-'));
    const path = join(directory, 'core-events-read-1.jsonl');
    const firstEvent = benchmarkEvent({ name: 'first-event', ts: 10 });
    const secondEvent = benchmarkEvent({ name: 'second-event', ts: 20 });
    await writeFile(
      path,
      `${JSON.stringify(firstEvent)}\n{"runId":`,
      'utf8',
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setTimeout(() => {
      void writeFile(
        path,
        `${JSON.stringify(firstEvent)}\n${JSON.stringify(secondEvent)}\n`,
        'utf8',
      );
    }, 5);

    const events = await readBenchmarkEvents(directory);

    expect(events.map((event) => event.name)).toEqual(['first-event', 'second-event']);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps startup summaries scoped to startup targets and captures warm launch metrics', () => {
    const summary = buildScenarioSummary({
      runId: 'run-1',
      scenario: 'startup',
      events: [
        benchmarkEvent({ layer: 'main', name: 'main.boot.start', ts: 0 }),
        benchmarkEvent({ layer: 'preload', name: 'preload.bridge.exposed', ts: 100 }),
        benchmarkEvent({ layer: 'renderer', name: 'renderer.app.getAppContext', ts: 160 }),
        benchmarkEvent({ layer: 'renderer', name: 'renderer.workspace.ready', ts: 450 }),
        benchmarkEvent({ layer: 'renderer', name: 'route.home.ready', ts: 480 }),
        benchmarkEvent({
          category: 'startup',
          name: 'startup.warm_workspace_ready_ms',
          phase: 'end',
          durationMs: 1200,
        }),
        benchmarkEvent({
          category: 'ipc',
          name: 'ipc.banji:system:get-app-context.handle',
          phase: 'end',
          durationMs: 35,
        }),
        benchmarkEvent({
          category: 'ipc',
          name: 'ipc.banji:sena:get-startup-workspace.handle',
          phase: 'end',
          durationMs: 40,
        }),
        benchmarkEvent({
          category: 'core-command',
          name: 'backend.core.request.resolve',
          phase: 'end',
          command: 'sena.getStartupWorkspace',
          durationMs: 40,
          detail: { queueWaitMs: 8 },
        }),
      ],
    });

    expect(summary.targets?.find((target) => target.metricName === 'startup.app_to_workspace_ready_ms')).toMatchObject({
      value: 450,
      status: 'pass',
    });
    expect(summary.targets?.find((target) => target.metricName === 'startup.warm_workspace_ready_ms')).toMatchObject({
      value: 1200,
      status: 'pass',
    });
    expect(summary.targets?.find((target) => target.metricName === 'ipc.sena_get_startup_workspace_ms')).toMatchObject({
      value: 40,
      status: 'pass',
    });
    expect(summary.targets?.find((target) => target.metricName === 'ipc.sena_get_workspace_summary_ms')).toBeUndefined();
    expect(summary.targets?.find((target) => target.metricName === 'nav.work_to_catalog_ms')).toBeUndefined();
  });

  it('keeps stability summaries scoped to stability-owned metrics', () => {
    const summary = buildScenarioSummary({
      runId: 'run-1',
      scenario: 'stability',
      events: [
        benchmarkEvent({ layer: 'main', name: 'main.boot.ready', category: 'memory', detail: { heapUsedMb: 10 } }),
        benchmarkEvent({
          category: 'interaction',
          name: 'renderer.long-task',
          detail: { durationMs: 70, startTime: 8 },
          ts: 12,
        }),
        benchmarkEvent({
          category: 'interaction',
          name: 'renderer.long-animation-frame',
          detail: { blockingDuration: 60, startTime: 8 },
          ts: 13,
        }),
        benchmarkEvent({
          name: 'benchmark.phase.measurement_start',
          detail: { performanceNow: 10 },
          ts: 10,
        }),
        benchmarkEvent({
          category: 'navigation',
          name: 'nav.work_to_insights_ms',
          phase: 'end',
          durationMs: 320,
          ts: 20,
        }),
        benchmarkEvent({
          category: 'interaction',
          name: 'renderer.long-task',
          detail: { durationMs: 40, startTime: 30 },
          ts: 30,
        }),
        benchmarkEvent({
          category: 'interaction',
          name: 'renderer.long-animation-frame',
          detail: { blockingDuration: 45, startTime: 40 },
          ts: 40,
        }),
        benchmarkEvent({
          name: 'benchmark.phase.measurement_end',
          detail: { performanceNow: 50 },
          ts: 50,
        }),
        benchmarkEvent({
          category: 'memory',
          name: 'memory.renderer_stability_cycle_1_mb',
          detail: { usedJSHeapSizeMb: 100 },
        }),
        benchmarkEvent({
          category: 'memory',
          name: 'memory.renderer_after_stability_mb',
          detail: { usedJSHeapSizeMb: 108 },
        }),
      ],
    });

    expect(summary.targets?.find((target) => target.metricName === 'nav.work_to_insights_ms')).toMatchObject({
      value: 320,
    });
    expect(summary.targets?.find((target) => target.metricName === 'renderer.long_task_max_ms')).toMatchObject({
      value: 40,
      status: 'pass',
    });
    expect(summary.targets?.find((target) => target.metricName === 'renderer.loaf_blocking_max_ms')).toMatchObject({
      value: 45,
      status: 'pass',
    });
    expect(summary.targets?.find((target) => target.metricName === 'stability.crash_free')).toMatchObject({
      value: 1,
      status: 'pass',
    });
    expect(summary.targets?.find((target) => target.metricName === 'interaction.save_stock_count_ms')).toBeUndefined();
  });

  it('keeps navigation targets scoped to metrics that navigation intentionally emits', () => {
    const summary = buildScenarioSummary({
      runId: 'run-1',
      scenario: 'navigation',
      events: [
        benchmarkEvent({
          category: 'navigation',
          name: 'nav.work_to_insights_ms',
          phase: 'end',
          durationMs: 320,
        }),
        benchmarkEvent({
          category: 'core-command',
          name: 'backend.core.request.resolve',
          phase: 'end',
          command: 'sena.getSkuDetail',
          durationMs: 40,
          detail: { queueWaitMs: 12 },
        }),
      ],
    });

    expect(summary.targets?.find((target) => target.metricName === 'nav.work_to_insights_ms')).toMatchObject({
      value: 320,
    });
    expect(summary.targets?.find((target) => target.metricName === 'ipc.sena_get_workspace_summary_ms')).toBeUndefined();
    expect(summary.targets?.find((target) => target.metricName === 'ipc.sena_list_observation_page_ms')).toBeUndefined();
  });

  it('derives capture-context IPC metrics for capture scenarios', () => {
    const summary = buildScenarioSummary({
      runId: 'run-1',
      scenario: 'capture',
      events: [
        benchmarkEvent({
          category: 'ipc',
          name: 'ipc.banji:sena:get-record-update-context.handle',
          phase: 'end',
          durationMs: 42,
        }),
      ],
    });

    expect(summary.targets?.find((target) => target.metricName === 'ipc.sena_get_capture_context_ms')).toMatchObject({
      value: 42,
      status: 'pass',
    });
  });

  it('isolates setup queue waits from measurement queue waits using phase markers', () => {
    const summary = buildScenarioSummary({
      runId: 'run-1',
      scenario: 'work',
      events: [
        benchmarkEvent({
          category: 'core-command',
          name: 'backend.core.request.resolve',
          phase: 'end',
          ts: 100,
          command: 'sena.listObservations',
          durationMs: 320,
          detail: { queueWaitMs: 300 },
        }),
        benchmarkEvent({
          category: 'startup',
          name: 'benchmark.phase.seed_end',
          ts: 200,
          phase: 'instant',
        }),
        benchmarkEvent({
          category: 'startup',
          name: 'benchmark.phase.measurement_start',
          ts: 300,
          phase: 'instant',
        }),
        benchmarkEvent({
          category: 'core-command',
          name: 'backend.core.request.resolve',
          phase: 'end',
          ts: 350,
          command: 'sena.listOrderBatches',
          durationMs: 28,
          detail: { queueWaitMs: 20 },
        }),
        benchmarkEvent({
          category: 'interaction',
          name: 'interaction.work_supplier_filter_ms',
          phase: 'end',
          ts: 360,
          durationMs: 130,
          detail: {
            harnessOverheadMs: 40,
            measuredDurationMs: 130,
            readyDurationMs: 90,
          },
        }),
        benchmarkEvent({
          category: 'startup',
          name: 'benchmark.phase.measurement_end',
          ts: 600,
          phase: 'instant',
        }),
      ],
    });

    expect(summary.derivedMetrics?.['backend.core.queue_wait_p95_ms']).toBe(20);
    expect(summary.derivedMetrics?.['backend.core.interactive_queue_wait_p95_ms']).toBe(20);
    expect(summary.derivedMetrics?.['backend.core.setup_queue_wait_p95_ms']).toBe(300);
    expect(summary.derivedMetrics?.['backend.core.setup_read_pool_queue_wait_p95_ms']).toBe(300);
    expect(summary.derivedMetrics?.['harness.ready_latency_p95_ms']).toBe(90);
    expect(summary.derivedMetrics?.['harness.overhead_p95_ms']).toBe(40);
  });

  it('reports zero interactive queue wait when measured actions are served from cache', () => {
    const summary = buildScenarioSummary({
      runId: 'run-1',
      scenario: 'work',
      events: [
        benchmarkEvent({
          category: 'core-command',
          name: 'backend.core.request.resolve',
          phase: 'end',
          ts: 100,
          command: 'sena.listOrderBatches',
          durationMs: 28,
          detail: { queueWaitMs: 12 },
        }),
        benchmarkEvent({
          category: 'startup',
          name: 'benchmark.phase.measurement_start',
          ts: 200,
          phase: 'instant',
        }),
        benchmarkEvent({
          category: 'ipc',
          name: 'main.cache.sena-read.hit',
          ts: 220,
          phase: 'instant',
          detail: { key: 'order-batches:{}' },
        }),
        benchmarkEvent({
          category: 'interaction',
          name: 'interaction.work_supplier_filter_ms',
          phase: 'end',
          ts: 250,
          durationMs: 80,
        }),
        benchmarkEvent({
          category: 'startup',
          name: 'benchmark.phase.measurement_end',
          ts: 300,
          phase: 'instant',
        }),
      ],
    });

    expect(summary.derivedMetrics?.['backend.core.queue_wait_p95_ms']).toBe(0);
    expect(summary.derivedMetrics?.['backend.core.interactive_queue_wait_p95_ms']).toBe(0);
    expect(summary.derivedMetrics?.['backend.core.read_pool_queue_wait_p95_ms']).toBe(0);
    expect(summary.derivedMetrics?.['backend.core.setup_queue_wait_p95_ms']).toBe(12);
    expect(summary.targets?.find((target) => target.metricName === 'backend.core.interactive_queue_wait_p95_ms')).toMatchObject({
      value: 0,
      status: 'pass',
    });
  });

  it('falls back to whole-run metrics when measurement markers are missing', () => {
    const summary = buildScenarioSummary({
      runId: 'run-1',
      scenario: 'work',
      events: [
        benchmarkEvent({
          category: 'core-command',
          name: 'backend.core.request.resolve',
          phase: 'end',
          ts: 100,
          command: 'sena.listOrderBatches',
          durationMs: 48,
          detail: { queueWaitMs: 33 },
        }),
      ],
    });

    expect(summary.derivedMetrics?.['backend.core.queue_wait_p95_ms']).toBe(33);
    expect(summary.derivedMetrics?.['backend.core.setup_queue_wait_p95_ms']).toBeUndefined();
  });
});

describe('benchmark fixture sizing', () => {
  it('normalizes the Power User fixture and documents the generated datapoint count', () => {
    expect(normalizeBenchmarkWorkspaceSize('power-user', 'medium')).toBe('power-user');
    expect(BENCHMARK_WORKSPACE_HISTORY_SIZES['power-user']).toEqual({
      years: 10,
      intervalDays: 1,
      expectedObservationCount: 3653,
    });
  });
});
