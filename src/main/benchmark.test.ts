// @vitest-environment node

import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE_ENV = {
  KAUR_KHOR_BENCHMARK: process.env.KAUR_KHOR_BENCHMARK,
  KAUR_KHOR_BENCHMARK_OUTPUT_DIR: process.env.KAUR_KHOR_BENCHMARK_OUTPUT_DIR,
  KAUR_KHOR_BENCHMARK_RUN_ID: process.env.KAUR_KHOR_BENCHMARK_RUN_ID,
};

async function loadBenchmarkModule() {
  return import('./benchmark');
}

describe('benchmark event counter hydration', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    process.env.KAUR_KHOR_BENCHMARK = BASE_ENV.KAUR_KHOR_BENCHMARK;
    process.env.KAUR_KHOR_BENCHMARK_OUTPUT_DIR = BASE_ENV.KAUR_KHOR_BENCHMARK_OUTPUT_DIR;
    process.env.KAUR_KHOR_BENCHMARK_RUN_ID = BASE_ENV.KAUR_KHOR_BENCHMARK_RUN_ID;
  });

  it('hydrates prior persisted event counts so warm-launch waiters can use cumulative targets', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'kaur-khor-benchmark-events-'));
    await writeFile(
      join(outputDirectory, 'events.jsonl'),
      `${JSON.stringify({
        runId: 'startup-cold-dev',
        ts: 1710000000000,
        layer: 'renderer',
        category: 'startup',
        name: 'route.dashboard.ready',
        phase: 'instant',
      })}\n`,
      'utf8',
    );
    process.env.KAUR_KHOR_BENCHMARK = '1';
    process.env.KAUR_KHOR_BENCHMARK_OUTPUT_DIR = outputDirectory;
    process.env.KAUR_KHOR_BENCHMARK_RUN_ID = 'startup-cold-dev';

    const {
      benchmarkEventCount,
      recordBenchmarkEvent,
      waitForBenchmarkEventCount,
    } = await loadBenchmarkModule();

    expect(benchmarkEventCount('route.dashboard.ready')).toBe(1);

    const waitPromise = waitForBenchmarkEventCount({
      name: 'route.dashboard.ready',
      minimumCount: 2,
      timeoutMs: 250,
    });
    setTimeout(() => {
      recordBenchmarkEvent({
        layer: 'renderer',
        category: 'startup',
        name: 'route.dashboard.ready',
        phase: 'instant',
      });
    }, 10);

    await expect(waitPromise).resolves.toEqual({
      count: 2,
      ts: expect.any(Number),
    });
  });

  it('rejects invalid waiter count and timeout values before scheduling timers', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'kaur-khor-benchmark-events-'));
    process.env.KAUR_KHOR_BENCHMARK = '1';
    process.env.KAUR_KHOR_BENCHMARK_OUTPUT_DIR = outputDirectory;
    process.env.KAUR_KHOR_BENCHMARK_RUN_ID = 'startup-cold-dev';

    const { waitForBenchmarkEventCount } = await loadBenchmarkModule();

    await expect(waitForBenchmarkEventCount({
      name: 'route.dashboard.ready',
      minimumCount: 1.5,
      timeoutMs: 250,
    })).rejects.toThrow('Benchmark minimumCount must be a positive integer.');
    await expect(waitForBenchmarkEventCount({
      name: 'route.dashboard.ready',
      minimumCount: 1,
      timeoutMs: Number.POSITIVE_INFINITY,
    })).rejects.toThrow('Benchmark timeoutMs must be a positive integer.');
  });
});
