import { benchmarkTargetStatusCounts, type KaurKhorBenchmarkRunRecord, type KaurKhorBenchmarkRunStatus } from '@shared/benchmark';

export function isBenchmarkRunInFlight(status: KaurKhorBenchmarkRunStatus) {
  return status === 'queued' || status === 'running';
}

export function isBenchmarkRunTerminal(status: KaurKhorBenchmarkRunStatus) {
  return status === 'passed' || status === 'warning' || status === 'failed' || status === 'cancelled';
}

export function benchmarkRunCompletionNotification(record: KaurKhorBenchmarkRunRecord) {
  if (!isBenchmarkRunTerminal(record.status)) {
    return null;
  }

  const scenarioLabel = `${record.scenarios.length} scenario${record.scenarios.length === 1 ? '' : 's'}`;
  if (record.status === 'passed') {
    return {
      title: 'Benchmark run passed',
      body: `${scenarioLabel} completed with all targets passing.`,
    };
  }
  if (record.status === 'warning') {
    const counts = benchmarkTargetStatusCounts(record.summaries);
    return {
      title: 'Benchmark run needs attention',
      body: `${scenarioLabel} completed with ${counts.watch} watch target${counts.watch === 1 ? '' : 's'}.`,
    };
  }
  if (record.status === 'cancelled') {
    return {
      title: 'Benchmark run cancelled',
      body: `${scenarioLabel} stopped before completion.`,
    };
  }
  return {
    title: 'Benchmark run failed',
    body: record.error ? `${scenarioLabel} failed: ${record.error}` : `${scenarioLabel} failed. Open Benchmarks to inspect artifacts.`,
  };
}

export function reconcileBenchmarkRunRecord(
  record: KaurKhorBenchmarkRunRecord,
  activeRunId: string | null,
  now = new Date().toISOString(),
) {
  if (!isBenchmarkRunInFlight(record.status) || record.runId === activeRunId) {
    return record;
  }
  return {
    ...record,
    status: 'failed' as const,
    completedAt: record.completedAt ?? now,
    exitCode: record.exitCode ?? 1,
    error: record.error ?? 'Benchmark runner stopped before this run completed.',
  };
}

export function cancelBenchmarkRunRecord(
  record: KaurKhorBenchmarkRunRecord,
  now = new Date().toISOString(),
) {
  if (!isBenchmarkRunInFlight(record.status)) {
    return record;
  }
  return {
    ...record,
    status: 'cancelled' as const,
    completedAt: record.completedAt ?? now,
    exitCode: null,
    error: null,
  };
}
