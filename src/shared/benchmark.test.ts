import { describe, expect, it } from 'vitest';
import {
  BANJI_BENCHMARK_TARGETS,
  classifyBenchmarkTarget,
  evaluateBenchmarkTargets,
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

  it('evaluates every canonical target with stable metadata', () => {
    const evaluations = evaluateBenchmarkTargets({
      'startup.app_to_workspace_ready_ms': 2000,
    });

    expect(evaluations).toHaveLength(BANJI_BENCHMARK_TARGETS.length);
    expect(evaluations.find((target) => target.metricName === 'startup.app_to_workspace_ready_ms')).toMatchObject({
      status: 'pass',
      value: 2000,
    });
    expect(evaluations.find((target) => target.metricName === 'nav.dashboard_to_catalog_ms')).toMatchObject({
      status: 'missing',
      value: null,
    });
  });
});
