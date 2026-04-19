import { describe, expect, it } from 'vitest';
import {
  BANJI_BENCHMARK_TARGETS,
  aggregateBenchmarkScenarioSummaries,
  benchmarkTargetsForScenario,
  classifyBenchmarkTarget,
  evaluateBenchmarkTargets,
  summarizeBenchmarkDistribution,
  type BanjiBenchmarkScenarioSummary,
} from './benchmark';

describe('benchmark targets', () => {
  const startupTarget = BANJI_BENCHMARK_TARGETS.find(
    (target) => target.metricName === 'startup.app_to_workspace_ready_ms',
  );

  it('classifies latency targets into pass, watch, and fail bands', () => {
    expect(startupTarget).toBeDefined();
    if (!startupTarget) {
      return;
    }

    expect(classifyBenchmarkTarget(2000, startupTarget)).toBe('pass');
    expect(classifyBenchmarkTarget(3000, startupTarget)).toBe('watch');
    expect(classifyBenchmarkTarget(6000, startupTarget)).toBe('fail');
    expect(classifyBenchmarkTarget(null, startupTarget)).toBe('missing');
  });

  it('returns only targets owned by the selected scenario', () => {
    expect(benchmarkTargetsForScenario('startup').map((target) => target.metricName)).toContain(
      'startup.app_to_workspace_ready_ms',
    );
    expect(benchmarkTargetsForScenario('startup').map((target) => target.metricName)).not.toContain(
      'detail.sku_first_load_ms',
    );
    expect(benchmarkTargetsForScenario('stability').map((target) => target.metricName)).toContain(
      'renderer.long_task_max_ms',
    );
  });

  it('evaluates scenario targets with stable metadata', () => {
    const evaluations = evaluateBenchmarkTargets({
      'startup.app_to_workspace_ready_ms': 2000,
    }, 'startup');

    expect(evaluations).toHaveLength(benchmarkTargetsForScenario('startup').length);
    expect(evaluations.find((target) => target.metricName === 'startup.app_to_workspace_ready_ms')).toMatchObject({
      status: 'pass',
      value: 2000,
    });
    expect(evaluations.find((target) => target.metricName === 'nav.dashboard_to_catalog_ms')).toBeUndefined();
  });

  it('summarizes repeat values as a distribution', () => {
    expect(summarizeBenchmarkDistribution([500, 100, 300, 200, 400])).toMatchObject({
      count: 5,
      iqr: 200,
      max: 500,
      mean: 300,
      median: 300,
      min: 100,
      q1: 200,
      q3: 400,
    });
  });

  it('evaluates repeat targets by the median value', () => {
    const evaluations = evaluateBenchmarkTargets(
      {},
      'startup',
      {
        'startup.app_to_workspace_ready_ms': summarizeBenchmarkDistribution([2000, 2300, 8000]),
      },
    );

    expect(evaluations.find((target) => target.metricName === 'startup.app_to_workspace_ready_ms')).toMatchObject({
      status: 'pass',
      value: 2300,
      distribution: expect.objectContaining({
        count: 3,
        max: 8000,
        median: 2300,
        min: 2000,
      }),
    });
  });

  it('aggregates repeat scenario summaries into per-target distributions', () => {
    const summary = (value: number): BanjiBenchmarkScenarioSummary => ({
      scenario: 'startup',
      runId: `repeat-${value}`,
      generatedAt: `2026-04-18T16:32:${value}.000Z`,
      metrics: {},
      derivedMetrics: {
        'startup.app_to_workspace_ready_ms': value,
      },
      slowestIpc: [{ name: `ipc-${value}`, durationMs: value / 100 }],
      slowestCore: [],
      targets: evaluateBenchmarkTargets({
        'startup.app_to_workspace_ready_ms': value,
      }, 'startup'),
    });

    const [aggregated] = aggregateBenchmarkScenarioSummaries({
      runId: 'gui-run',
      summaries: [summary(2400), summary(2600), summary(7000)],
    });

    expect(aggregated?.runId).toBe('gui-run');
    expect(aggregated?.scenario).toBe('startup');
    expect(aggregated?.derivedMetrics).toMatchObject({
      'startup.app_to_workspace_ready_ms': 2600,
    });
    expect(aggregated?.targets?.find((target) =>
      target.metricName === 'startup.app_to_workspace_ready_ms',
    )).toMatchObject({
      status: 'watch',
      value: 2600,
      distribution: expect.objectContaining({
        count: 3,
        max: 7000,
        mean: 4000,
        median: 2600,
        min: 2400,
      }),
    });
    expect(aggregated?.slowestIpc.map((entry) => entry.name)).toEqual(['ipc-7000', 'ipc-2600', 'ipc-2400']);
  });
});
