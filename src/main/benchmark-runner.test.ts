// @vitest-environment node

import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { KAUR_KHOR_BENCHMARK_SCENARIOS } from '@shared/benchmark';
import {
  benchmarkChildSpawnOptions,
  benchmarkOutputDirectoryForRun,
  buildFlamegraphHtml,
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
    expect(() => benchmarkOutputDirectoryForRun('/tmp/kaur-khor/bench-results', '../bad')).toThrow(
      'Invalid benchmark run id.',
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
});
