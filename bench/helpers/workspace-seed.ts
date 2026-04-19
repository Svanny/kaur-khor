import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type BenchmarkWorkspaceSize = 'minimal' | 'medium' | 'heavy' | 'power-user';

export interface BenchmarkWorkspaceSeed {
  dataDirectory: string;
  size: BenchmarkWorkspaceSize;
}

export const BENCHMARK_WORKSPACE_HISTORY_SIZES: Record<BenchmarkWorkspaceSize, { years: number; intervalDays: number; expectedObservationCount: number }> = {
  minimal: { years: 0, intervalDays: 7, expectedObservationCount: 0 },
  medium: { years: 1, intervalDays: 7, expectedObservationCount: 53 },
  heavy: { years: 3, intervalDays: 3.5, expectedObservationCount: 314 },
  'power-user': { years: 10, intervalDays: 1, expectedObservationCount: 3653 },
};

export function normalizeBenchmarkWorkspaceSize(
  value: string | undefined,
  fallback: BenchmarkWorkspaceSize,
): BenchmarkWorkspaceSize {
  return value === 'minimal' ||
    value === 'medium' ||
    value === 'heavy' ||
    value === 'power-user'
    ? value
    : fallback;
}

export async function prepareBenchmarkWorkspace(seed: BenchmarkWorkspaceSeed) {
  await mkdir(seed.dataDirectory, { recursive: true });
  const repoRoot = resolve('.');
  const fixtureSize = normalizeBenchmarkWorkspaceSize(process.env.BANJI_BENCHMARK_FIXTURE_SIZE, seed.size);
  const historySize = BENCHMARK_WORKSPACE_HISTORY_SIZES[fixtureSize];
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
      ...(fixtureSize === 'power-user' ? ['--startup-only-read-model'] : []),
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
