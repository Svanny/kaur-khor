import { describe, expect, it } from 'vitest';
import {
  KAUR_KHOR_BENCHMARK_SCENARIOS,
  KAUR_KHOR_BENCHMARK_TARGETS,
  aggregateBenchmarkScenarioSummaries,
  benchmarkRunStatusForTargets,
  benchmarkTargetStatusCounts,
  benchmarkTargetsForScenario,
  classifyBenchmarkTarget,
  evaluateBenchmarkTargets,
  summarizeBenchmarkDistribution,
  type KaurKhorBenchmarkScenarioSummary,
} from './benchmark';

describe('benchmark targets', () => {
  const startupTarget = KAUR_KHOR_BENCHMARK_TARGETS.find(
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
    expect(benchmarkTargetsForScenario('work').map((target) => target.metricName)).toContain(
      'interaction.open_work_supplier_drawer_ms',
    );
  });

  it('registers minimal workspace scenarios and removes stale task drawer targets', () => {
    expect(KAUR_KHOR_BENCHMARK_SCENARIOS.map((scenario) => scenario.id)).toContain('work');
    expect(KAUR_KHOR_BENCHMARK_SCENARIOS.map((scenario) => scenario.id)).toContain('capture');
    expect(KAUR_KHOR_BENCHMARK_SCENARIOS.map((scenario) => scenario.id)).not.toContain('automations');
    expect(KAUR_KHOR_BENCHMARK_TARGETS.some((target) => target.metricName === 'interaction.open_task_drawer_ms')).toBe(false);
    expect(KAUR_KHOR_BENCHMARK_TARGETS.some((target) => target.metricName === 'interaction.open_automation_intake_drawer_ms')).toBe(false);
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
    expect(evaluations.find((target) => target.metricName === 'nav.work_to_catalog_ms')).toBeUndefined();
  });

  it('summarizes repeat values as a distribution', () => {
    expect(summarizeBenchmarkDistribution([500, 100, 300, 200, 400])).toMatchObject({
      count: 5,
      iqr: 200,
      max: 500,
      mean: 300,
      median: 300,
      min: 100,
      p95: 500,
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
      status: 'fail',
      value: 2300,
      p95: 8000,
      jitterBudget: 2500,
      distribution: expect.objectContaining({
        count: 3,
        max: 8000,
        median: 2300,
        min: 2000,
      }),
    });
  });

  it('keeps repeat metrics in pass when p95 stays within jitter budget', () => {
    const evaluations = evaluateBenchmarkTargets(
      {},
      'startup',
      {
        'startup.app_to_workspace_ready_ms': summarizeBenchmarkDistribution([2100, 2400, 4700]),
      },
    );

    expect(evaluations.find((target) => target.metricName === 'startup.app_to_workspace_ready_ms')).toMatchObject({
      status: 'pass',
      value: 2400,
      p95: 4700,
      jitterBudget: 2500,
    });
  });

  it('aggregates repeat scenario summaries into per-target distributions', () => {
    const summary = (value: number): KaurKhorBenchmarkScenarioSummary => ({
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

  it('derives run warning status from watch targets without treating them as passed', () => {
    const summaries: KaurKhorBenchmarkScenarioSummary[] = [
      {
        scenario: 'startup',
        runId: 'run-1',
        generatedAt: '2026-04-18T16:32:10.000Z',
        metrics: {},
        slowestCore: [],
        slowestIpc: [],
        targets: evaluateBenchmarkTargets({
          'startup.app_to_workspace_ready_ms': 3000,
          'startup.warm_workspace_ready_ms': 1200,
          'ipc.system_get_app_context_ms': 35,
          'ipc.sena_get_startup_workspace_ms': 40,
          'backend.core.interactive_queue_wait_p95_ms': 0,
          'backend.core.read_pool_queue_wait_p95_ms': 0,
          'backend.core.setup_queue_wait_p95_ms': 0,
        }, 'startup'),
      },
    ];

    expect(benchmarkTargetStatusCounts(summaries)).toMatchObject({
      watch: 1,
      fail: 0,
      missing: 0,
    });
    expect(benchmarkRunStatusForTargets(summaries)).toBe('warning');
  });

  it('fails benchmark status when no summaries were collected', () => {
    expect(benchmarkTargetStatusCounts([], ['startup'])).toMatchObject({
      summaries: 0,
      total: 0,
      missingScenarios: 1,
    });
    expect(benchmarkRunStatusForTargets([], ['startup'])).toBe('failed');
  });

  it('fails benchmark status when a requested scenario summary is missing', () => {
    const summaries: KaurKhorBenchmarkScenarioSummary[] = [
      {
        scenario: 'startup',
        runId: 'run-1',
        generatedAt: '2026-04-18T16:32:10.000Z',
        metrics: {},
        slowestCore: [],
        slowestIpc: [],
        targets: evaluateBenchmarkTargets({
          'startup.app_to_workspace_ready_ms': 2000,
          'startup.warm_workspace_ready_ms': 1200,
          'ipc.system_get_app_context_ms': 35,
          'ipc.sena_get_startup_workspace_ms': 40,
          'backend.core.interactive_queue_wait_p95_ms': 0,
          'backend.core.read_pool_queue_wait_p95_ms': 0,
          'backend.core.setup_queue_wait_p95_ms': 0,
        }, 'startup'),
      },
    ];

    expect(benchmarkTargetStatusCounts(summaries, ['startup', 'navigation'])).toMatchObject({
      summaries: 1,
      missingScenarios: 1,
      zeroTargetSummaries: 0,
    });
    expect(benchmarkRunStatusForTargets(summaries, ['startup', 'navigation'])).toBe('failed');
  });

  it('fails benchmark status when a collected summary has zero targets', () => {
    const summaries: KaurKhorBenchmarkScenarioSummary[] = [
      {
        scenario: 'startup',
        runId: 'run-1',
        generatedAt: '2026-04-18T16:32:10.000Z',
        metrics: {},
        slowestCore: [],
        slowestIpc: [],
        targets: [],
      },
    ];

    expect(benchmarkTargetStatusCounts(summaries, ['startup'])).toMatchObject({
      summaries: 1,
      total: 0,
      missingScenarios: 0,
      zeroTargetSummaries: 1,
    });
    expect(benchmarkRunStatusForTargets(summaries, ['startup'])).toBe('failed');
  });
});
