// @vitest-environment node

import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { KAUR_KHOR_BENCHMARK_SCENARIOS } from '@shared/benchmark';
import type { KaurKhorBenchmarkRunRecord } from '@shared/benchmark';
import {
  benchmarkChildSpawnOptions,
  benchmarkOutputDirectoryForRun,
  buildFlamegraphHtml,
  normalizeBenchmarkComparisonPayload,
  normalizeBenchmarkFlamegraphRequest,
  normalizePersistedBenchmarkRunRecord,
  normalizeBenchmarkRunRecordOutputDirectory,
  normalizeRunOptions,
  readBenchmarkJsonFile,
  SCENARIO_FILE_BY_ID,
  terminateBenchmarkChild,
} from './benchmark-runner';

describe('benchmark runner helpers', () => {
  it('keeps GUI scenario files aligned with shared benchmark metadata', () => {
    for (const scenario of KAUR_KHOR_BENCHMARK_SCENARIOS) {
      expect(SCENARIO_FILE_BY_ID[scenario.id]).toBe(scenario.file);
    }
  });

  it('isolates each GUI run under its own output directory', () => {
    expect(benchmarkOutputDirectoryForRun('/tmp/kaur-khor/bench-results', 'gui-123')).toBe(
      join('/tmp/kaur-khor/bench-results', 'gui-123'),
    );
    expect(() => benchmarkOutputDirectoryForRun('/tmp/kaur-khor/bench-results', '.')).toThrow(
      'Invalid benchmark run id.',
    );
    expect(() => benchmarkOutputDirectoryForRun('/tmp/kaur-khor/bench-results', '..')).toThrow(
      'Invalid benchmark run id.',
    );
    expect(() => benchmarkOutputDirectoryForRun('/tmp/kaur-khor/bench-results', '../bad')).toThrow(
      'Invalid benchmark run id.',
    );
    expect(() => benchmarkOutputDirectoryForRun('/tmp/kaur-khor/bench-results', undefined as never)).toThrow(
      'Invalid benchmark run id.',
    );
  });

  it('derives persisted GUI run output directories from the trusted run id', () => {
    const record: KaurKhorBenchmarkRunRecord = {
      runId: 'gui-123',
      scenarios: ['startup'],
      status: 'passed',
      startedAt: '2026-04-30T00:00:00.000Z',
      completedAt: '2026-04-30T00:01:00.000Z',
      fixtureSize: 'power-user',
      traceEnabled: false,
      repeatCount: 1,
      buildBeforeRun: false,
      outputDirectory: '/Users/svanny/Documents',
      exitCode: 0,
      summaries: [],
      stdoutTail: [],
      stderrTail: [],
      error: null,
    };

    expect(normalizeBenchmarkRunRecordOutputDirectory('/tmp/kaur-khor/bench-results', record)).toMatchObject({
      runId: 'gui-123',
      outputDirectory: join('/tmp/kaur-khor/bench-results', 'gui-123'),
    });
  });

  it('ignores persisted GUI run records with invalid critical fields', () => {
    expect(normalizePersistedBenchmarkRunRecord('/tmp/kaur-khor/bench-results', {
      runId: '../bad',
      scenarios: ['startup'],
      status: 'passed',
      startedAt: '2026-04-30T00:00:00.000Z',
    })).toBeNull();

    expect(normalizePersistedBenchmarkRunRecord('/tmp/kaur-khor/bench-results', {
      runId: 'gui-123',
      scenarios: ['unknown'],
      status: 'passed',
      startedAt: '2026-04-30T00:00:00.000Z',
    })).toBeNull();

    expect(normalizePersistedBenchmarkRunRecord('/tmp/kaur-khor/bench-results', {
      runId: 'gui-123',
      scenarios: ['startup'],
      status: 'passed',
      startedAt: '2026-02-31T00:00:00.000Z',
    })).toBeNull();
  });

  it('normalizes dirty persisted GUI run records before UI consumption', () => {
    const record = normalizePersistedBenchmarkRunRecord('/tmp/kaur-khor/bench-results', {
      runId: 'gui-123',
      scenarios: ['startup', '../bad'],
      status: 'queued',
      startedAt: '2026-04-30T00:00:00Z',
      completedAt: '2026-04-31T00:00:00.000Z',
      fixtureSize: 'oversized',
      repeatCount: 99,
      outputDirectory: '/Users/svanny/Documents',
      summaries: [
        null,
        {
          scenario: 'startup',
          metrics: null,
          slowestIpc: 'dirty',
        },
      ],
      stdoutTail: ['ok', 42, 'next'],
      stderrTail: 'dirty',
      error: 123,
    });

    expect(record).toMatchObject({
      runId: 'gui-123',
      scenarios: ['startup'],
      status: 'queued',
      startedAt: '2026-04-30T00:00:00.000Z',
      completedAt: null,
      fixtureSize: 'medium',
      repeatCount: 5,
      outputDirectory: join('/tmp/kaur-khor/bench-results', 'gui-123'),
      stdoutTail: ['ok', 'next'],
      stderrTail: [],
      error: null,
    });
    expect(record?.summaries).toEqual([
      expect.objectContaining({
        scenario: 'startup',
        metrics: {},
        slowestIpc: [],
        slowestCore: [],
      }),
    ]);
  });

  it('drops malformed persisted benchmark summary internals before comparison and panels use them', () => {
    const record = normalizePersistedBenchmarkRunRecord('/tmp/kaur-khor/bench-results', {
      runId: 'gui-123',
      scenarios: ['startup'],
      status: 'passed',
      startedAt: '2026-04-30T00:00:00.000Z',
      fixtureSize: 'power-user',
      summaries: [
        {
          scenario: 'startup',
          metrics: {
            valid_metric: {
              count: 2,
              min: 1,
              median: 2,
              max: 3,
              p95: 3,
            },
            dirty_metric: {
              count: 'many',
              median: 'slow',
            },
          },
          derivedMetrics: {
            valid_derived: 42,
            dirty_derived: 'fast',
          },
          targets: [
            {
              metricName: 'valid_metric',
              label: 'Valid metric',
              category: 'startup',
              scenarios: ['startup'],
              unit: 'ms',
              nonNegotiable: 10,
              acceptable: 20,
              source: 'test',
              rationale: 'test',
              value: 2,
              status: 'pass',
            },
            {
              metricName: 'dirty_metric',
              label: 'Dirty metric',
              category: 'startup',
              scenarios: ['startup'],
              unit: 'ms',
              nonNegotiable: 10,
              acceptable: 20,
              source: 'test',
              rationale: 'test',
              value: 'fast',
              status: 'pass',
            },
          ],
          slowestIpc: [
            { name: 'ipc.valid', durationMs: 12 },
            { name: 'ipc.dirty', durationMs: 'slow' },
          ],
          slowestCore: [
            { name: 'core.valid', command: 'list', durationMs: 14 },
            { name: 'core.dirty', command: 'list', durationMs: 'slow' },
          ],
        },
      ],
    });

    expect(record?.summaries[0]).toMatchObject({
      metrics: {
        valid_metric: {
          count: 2,
          min: 1,
          median: 2,
          max: 3,
          p95: 3,
        },
      },
      derivedMetrics: {
        valid_derived: 42,
      },
      slowestIpc: [{ name: 'ipc.valid', durationMs: 12 }],
      slowestCore: [{ name: 'core.valid', command: 'list', durationMs: 14 }],
    });
    expect(record?.summaries[0]?.metrics.dirty_metric).toBeUndefined();
    expect(record?.summaries[0]?.derivedMetrics?.dirty_derived).toBeUndefined();
    expect(record?.summaries[0]?.targets).toEqual([
      expect.objectContaining({
        metricName: 'valid_metric',
        value: 2,
        status: 'pass',
      }),
      expect.objectContaining({
        metricName: 'dirty_metric',
        value: null,
        status: 'pass',
      }),
    ]);
  });

  it('rejects malformed benchmark runner payloads before reading run files', () => {
    expect(() => normalizeRunOptions(undefined as never)).toThrow('Benchmark run options must be an object.');
    expect(() => normalizeRunOptions({ scenarios: [] } as never)).toThrow('Select at least one benchmark scenario.');
    expect(() => normalizeBenchmarkComparisonPayload({ baselineRunId: 'gui-1', candidateRunId: '../bad' })).toThrow(
      'Invalid benchmark run id.',
    );
    expect(() => normalizeBenchmarkFlamegraphRequest(null as never)).toThrow(
      'Benchmark flame graph request must be an object.',
    );
  });

  it('uses process groups for benchmark children on POSIX', () => {
    expect(benchmarkChildSpawnOptions('/repo', { KAUR_KHOR_BENCHMARK: '1' })).toMatchObject({
      cwd: '/repo',
      detached: process.platform !== 'win32',
      env: { KAUR_KHOR_BENCHMARK: '1' },
      stdio: 'pipe',
    });
  });

  it('terminates the child process group when available', () => {
    const killProcess = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const childKill = vi.fn();

    terminateBenchmarkChild({ kill: childKill, killed: false, pid: 1234 });

    if (process.platform === 'win32') {
      expect(childKill).toHaveBeenCalledWith('SIGTERM');
    } else {
      expect(killProcess).toHaveBeenCalledWith(-1234, 'SIGTERM');
      expect(childKill).not.toHaveBeenCalled();
    }

    killProcess.mockRestore();
  });

  it('generates self-contained flamegraph HTML without remote asset URLs', () => {
    const html = buildFlamegraphHtml({
      data: {
        name: 'startup flame graph - gui-test',
        value: 125,
        children: [
          {
            name: 'startup repeat - observed 125 ms',
            value: 125,
            children: [{ name: 'renderer/startup: ready - 125 ms', value: 125 }],
          },
        ],
      },
      record: {
        runId: 'gui-test',
        scenarios: ['startup'],
        status: 'passed',
        startedAt: '2026-04-30T00:00:00.000Z',
        completedAt: '2026-04-30T00:01:00.000Z',
        fixtureSize: 'power-user',
        traceEnabled: false,
        repeatCount: 1,
        buildBeforeRun: false,
        outputDirectory: '/tmp/kaur-khor/bench-results/gui-test',
        exitCode: 0,
        summaries: [],
        stdoutTail: [],
        stderrTail: [],
        error: null,
      },
      scenario: 'startup',
    });

    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)="https?:\/\//i);
    expect(html).not.toMatch(/https:\/\/(?:d3js\.org|cdn\.jsdelivr\.net)\//i);
    expect(html).not.toContain('d3-flame-graph');
    expect(html).toContain('This self-contained static flame graph');
    expect(html).toContain('renderer/startup: ready - 125 ms');
  });

  it('ignores malformed persisted benchmark JSON files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kaur-khor-benchmark-json-'));
    const file = join(directory, 'run.json');
    await writeFile(file, '{not json', 'utf8');

    await expect(readBenchmarkJsonFile(file)).resolves.toBeNull();
  });

  it('ignores persisted benchmark JSON files with non-record shapes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kaur-khor-benchmark-json-shape-'));
    const stringFile = join(directory, 'string-run.json');
    const arrayFile = join(directory, 'array-run.json');
    await writeFile(stringFile, '"not-a-record"', 'utf8');
    await writeFile(arrayFile, '[]', 'utf8');

    await expect(readBenchmarkJsonFile(stringFile)).resolves.toBeNull();
    await expect(readBenchmarkJsonFile(arrayFile)).resolves.toBeNull();
  });
});
