// @vitest-environment node

import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE_ENV = {
  BANJI_BENCHMARK: process.env.BANJI_BENCHMARK,
  BANJI_BENCHMARK_OUTPUT_DIR: process.env.BANJI_BENCHMARK_OUTPUT_DIR,
  BANJI_BENCHMARK_RUN_ID: process.env.BANJI_BENCHMARK_RUN_ID,
};

async function loadBenchmarkModule() {
  return import('./benchmark');
}

describe('benchmark event counter hydration', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    process.env.BANJI_BENCHMARK = BASE_ENV.BANJI_BENCHMARK;
    process.env.BANJI_BENCHMARK_OUTPUT_DIR = BASE_ENV.BANJI_BENCHMARK_OUTPUT_DIR;
    process.env.BANJI_BENCHMARK_RUN_ID = BASE_ENV.BANJI_BENCHMARK_RUN_ID;
  });

  it('hydrates prior persisted event counts so warm-launch waiters can use cumulative targets', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'banji-benchmark-events-'));
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
    process.env.BANJI_BENCHMARK = '1';
    process.env.BANJI_BENCHMARK_OUTPUT_DIR = outputDirectory;
    process.env.BANJI_BENCHMARK_RUN_ID = 'startup-cold-dev';

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
});
