// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { KaurKhorBenchmarkRunRecord } from '@shared/benchmark';
import {
  benchmarkRunCompletionNotification,
  cancelBenchmarkRunRecord,
  isBenchmarkRunInFlight,
  isBenchmarkRunTerminal,
  reconcileBenchmarkRunRecord,
} from './benchmark-runner-state';

function benchmarkRunRecord(overrides: Partial<KaurKhorBenchmarkRunRecord> = {}): KaurKhorBenchmarkRunRecord {
  return {
    runId: 'gui-1',
    scenarios: ['startup'],
    status: 'running',
    startedAt: '2026-04-19T04:45:00.000Z',
    completedAt: null,
    fixtureSize: 'medium',
    traceEnabled: false,
    repeatCount: 1,
    buildBeforeRun: true,
    outputDirectory: '/tmp/kaur-khor/bench-results',
    exitCode: null,
    summaries: [],
    stdoutTail: [],
    stderrTail: [],
    error: null,
    ...overrides,
  };
}

describe('benchmark runner state helpers', () => {
  it('recognizes in-flight benchmark statuses', () => {
    expect(isBenchmarkRunInFlight('queued')).toBe(true);
    expect(isBenchmarkRunInFlight('running')).toBe(true);
    expect(isBenchmarkRunInFlight('passed')).toBe(false);
    expect(isBenchmarkRunInFlight('warning')).toBe(false);
    expect(isBenchmarkRunInFlight('failed')).toBe(false);
    expect(isBenchmarkRunInFlight('cancelled')).toBe(false);
  });

  it('recognizes terminal benchmark statuses', () => {
    expect(isBenchmarkRunTerminal('queued')).toBe(false);
    expect(isBenchmarkRunTerminal('running')).toBe(false);
    expect(isBenchmarkRunTerminal('passed')).toBe(true);
    expect(isBenchmarkRunTerminal('warning')).toBe(true);
    expect(isBenchmarkRunTerminal('failed')).toBe(true);
    expect(isBenchmarkRunTerminal('cancelled')).toBe(true);
  });

  it('formats completion notifications for terminal benchmark runs', () => {
    expect(benchmarkRunCompletionNotification(benchmarkRunRecord({ status: 'passed' }))).toEqual({
      title: 'Benchmark run passed',
      body: '1 scenario completed with all targets passing.',
    });
    expect(benchmarkRunCompletionNotification(benchmarkRunRecord({
      status: 'warning',
      summaries: [
        {
          scenario: 'startup',
          runId: 'gui-1',
          generatedAt: '2026-04-19T04:46:00.000Z',
          metrics: {},
          slowestCore: [],
          slowestIpc: [],
          targets: [
            {
              acceptable: 5000,
              label: 'App to usable workspace',
              metricName: 'startup.app_to_workspace_ready_ms',
              nonNegotiable: 2500,
              rationale: 'Startup ends when the workspace can be used.',
              source: 'RAIL',
              status: 'watch',
              unit: 'ms',
              value: 3000,
            },
          ],
        },
      ],
    }))).toEqual({
      title: 'Benchmark run needs attention',
      body: '1 scenario completed with 1 watch target.',
    });
    expect(benchmarkRunCompletionNotification(benchmarkRunRecord({ status: 'failed', error: 'boom' }))).toEqual({
      title: 'Benchmark run failed',
      body: '1 scenario failed: boom',
    });
    expect(benchmarkRunCompletionNotification(benchmarkRunRecord({ status: 'cancelled' }))).toEqual({
      title: 'Benchmark run cancelled',
      body: '1 scenario stopped before completion.',
    });
    expect(benchmarkRunCompletionNotification(benchmarkRunRecord({ status: 'running' }))).toBeNull();
  });

  it('marks stale persisted in-flight runs as failed when no active run matches', () => {
    const record = benchmarkRunRecord();

    expect(reconcileBenchmarkRunRecord(record, null, '2026-04-19T04:50:00.000Z')).toEqual({
      ...record,
      status: 'failed',
      completedAt: '2026-04-19T04:50:00.000Z',
      exitCode: 1,
      error: 'Benchmark runner stopped before this run completed.',
    });
  });

  it('keeps the active in-flight run unchanged', () => {
    const record = benchmarkRunRecord();

    expect(reconcileBenchmarkRunRecord(record, 'gui-1')).toBe(record);
  });

  it('treats stale cancel requests as idempotent terminal cancellations', () => {
    const record = benchmarkRunRecord({ status: 'queued' });

    expect(cancelBenchmarkRunRecord(record, '2026-04-19T04:55:00.000Z')).toEqual({
      ...record,
      status: 'cancelled',
      completedAt: '2026-04-19T04:55:00.000Z',
      exitCode: null,
      error: null,
    });
  });

  it('leaves completed runs unchanged during cancellation', () => {
    const record = benchmarkRunRecord({ status: 'warning', completedAt: '2026-04-19T04:46:00.000Z', exitCode: 0 });

    expect(cancelBenchmarkRunRecord(record)).toBe(record);
  });
});
