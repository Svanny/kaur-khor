import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type BenchmarkWorkspaceSize = 'minimal' | 'medium' | 'heavy';

export interface BenchmarkWorkspaceSeed {
  dataDirectory: string;
  size: BenchmarkWorkspaceSize;
}

export async function prepareBenchmarkWorkspace(seed: BenchmarkWorkspaceSeed) {
  await mkdir(seed.dataDirectory, { recursive: true });
  const repoRoot = resolve('.');
  const fixtureSize = process.env.BANJI_BENCHMARK_FIXTURE_SIZE === 'minimal' ||
    process.env.BANJI_BENCHMARK_FIXTURE_SIZE === 'medium' ||
    process.env.BANJI_BENCHMARK_FIXTURE_SIZE === 'heavy'
    ? process.env.BANJI_BENCHMARK_FIXTURE_SIZE
    : seed.size;
  const historySize = {
    minimal: { years: 0, intervalDays: 7 },
    medium: { years: 1, intervalDays: 7 },
    heavy: { years: 3, intervalDays: 3.5 },
  }[fixtureSize];
  await execFileAsync(
    'python3',
    [
      './scripts/generate_dev_history.py',
      '--repo-root',
      repoRoot,
      '--sena-db',
      join(seed.dataDirectory, 'desktop-sena-store.sqlite3'),
      '--seed-marker',
      join(seed.dataDirectory, 'desktop-sena-dev-history.json'),
      '--years',
      String(historySize.years),
      '--interval-days',
      String(historySize.intervalDays),
    ],
    {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 4,
    },
  );
  await writeFile(
    join(seed.dataDirectory, 'desktop-preferences.json'),
    `${JSON.stringify({
      onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
      seenUnlockedNavItems: {
        catalog: true,
        operations: true,
        performance: true,
        financials: true,
      },
    }, null, 2)}\n`,
    'utf8',
  );
  return {
    ...seed,
    size: fixtureSize,
    mode: 'generated-history',
  };
}
