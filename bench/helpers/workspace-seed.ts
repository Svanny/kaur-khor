import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type BenchmarkWorkspaceSize = 'minimal' | 'medium' | 'heavy';

export interface BenchmarkWorkspaceSeed {
  dataDirectory: string;
  size: BenchmarkWorkspaceSize;
}

export async function prepareBenchmarkWorkspace(seed: BenchmarkWorkspaceSeed) {
  await mkdir(seed.dataDirectory, { recursive: true });
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
    mode: 'dev-seed',
  };
}
