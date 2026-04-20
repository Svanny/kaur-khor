import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
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

  it('keeps startup summaries scoped to startup targets and captures warm launch metrics', () => {
    const summary = buildScenarioSummary({
      runId: 'run-1',
      scenario: 'startup',
      events: [
        benchmarkEvent({ layer: 'main', name: 'main.boot.start', ts: 0 }),
        benchmarkEvent({ layer: 'preload', name: 'preload.bridge.exposed', ts: 100 }),
        benchmarkEvent({ layer: 'renderer', name: 'renderer.app.getAppContext', ts: 160 }),
        benchmarkEvent({ layer: 'renderer', name: 'renderer.workspace.ready', ts: 450 }),
        benchmarkEvent({ layer: 'renderer', name: 'route.dashboard.ready', ts: 480 }),
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
    expect(summary.targets?.find((target) => target.metricName === 'nav.dashboard_to_catalog_ms')).toBeUndefined();
  });

  it('keeps stability summaries scoped to stability-owned metrics', () => {
    const summary = buildScenarioSummary({
      runId: 'run-1',
      scenario: 'stability',
      events: [
        benchmarkEvent({ layer: 'main', name: 'main.boot.ready', category: 'memory', detail: { heapUsedMb: 10 } }),
        benchmarkEvent({
          category: 'navigation',
          name: 'nav.dashboard_to_performance_ms',
          phase: 'end',
          durationMs: 320,
        }),
        benchmarkEvent({
          category: 'interaction',
          name: 'renderer.long-task',
          detail: { durationMs: 60 },
        }),
        benchmarkEvent({
          category: 'interaction',
          name: 'renderer.long-animation-frame',
          detail: { blockingDuration: 45 },
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

    expect(summary.targets?.find((target) => target.metricName === 'nav.dashboard_to_performance_ms')).toMatchObject({
      value: 320,
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
          name: 'nav.dashboard_to_performance_ms',
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

    expect(summary.targets?.find((target) => target.metricName === 'nav.dashboard_to_performance_ms')).toMatchObject({
      value: 320,
    });
    expect(summary.targets?.find((target) => target.metricName === 'ipc.sena_get_workspace_summary_ms')).toBeUndefined();
    expect(summary.targets?.find((target) => target.metricName === 'ipc.sena_list_observation_page_ms')).toBeUndefined();
  });

  it('derives record-update-context IPC metrics for record-update scenarios', () => {
    const summary = buildScenarioSummary({
      runId: 'run-1',
      scenario: 'record-update',
      events: [
        benchmarkEvent({
          category: 'ipc',
          name: 'ipc.banji:sena:get-record-update-context.handle',
          phase: 'end',
          durationMs: 42,
        }),
      ],
    });

    expect(summary.targets?.find((target) => target.metricName === 'ipc.sena_get_record_update_context_ms')).toMatchObject({
      value: 42,
      status: 'pass',
    });
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
