// @vitest-environment node

import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BANJI_BENCHMARK_SCENARIOS } from '@shared/benchmark';
import {
  benchmarkChildSpawnOptions,
  benchmarkOutputDirectoryForRun,
  SCENARIO_FILE_BY_ID,
  terminateBenchmarkChild,
} from './benchmark-runner';

describe('benchmark runner helpers', () => {
  it('keeps GUI scenario files aligned with shared benchmark metadata', () => {
    for (const scenario of BANJI_BENCHMARK_SCENARIOS) {
      expect(SCENARIO_FILE_BY_ID[scenario.id]).toBe(scenario.file);
    }
  });

  it('isolates each GUI run under its own output directory', () => {
    expect(benchmarkOutputDirectoryForRun('/tmp/banji/bench-results', 'gui-123')).toBe(
      join('/tmp/banji/bench-results', 'gui-123'),
    );
    expect(() => benchmarkOutputDirectoryForRun('/tmp/banji/bench-results', '../bad')).toThrow(
      'Invalid benchmark run id.',
    );
  });

  it('uses process groups for benchmark children on POSIX', () => {
    expect(benchmarkChildSpawnOptions('/repo', { BANJI_BENCHMARK: '1' })).toMatchObject({
      cwd: '/repo',
      detached: process.platform !== 'win32',
      env: { BANJI_BENCHMARK: '1' },
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
});
