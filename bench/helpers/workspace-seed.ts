import {
  BENCHMARK_WORKSPACE_HISTORY_SIZES as GENERATED_HISTORY_SIZES,
  normalizeBenchmarkWorkspaceSize,
  prepareGeneratedWorkspace,
  type BenchmarkWorkspaceSize,
  type GeneratedWorkspaceSeed,
} from '../../src/main/dev-history-generator';

export type BenchmarkWorkspaceSeed = GeneratedWorkspaceSeed;

export const BENCHMARK_WORKSPACE_HISTORY_SIZES = Object.fromEntries(
  Object.entries(GENERATED_HISTORY_SIZES).map(([size, profile]) => [
    size,
    {
      years: profile.years,
      intervalDays: profile.intervalDays,
      expectedObservationCount: profile.expectedObservationCount,
    },
  ]),
) as Record<BenchmarkWorkspaceSize, {
  years: number;
  intervalDays: number;
  expectedObservationCount: number;
}>;

export { normalizeBenchmarkWorkspaceSize, type BenchmarkWorkspaceSize };

export async function prepareBenchmarkWorkspace(seed: GeneratedWorkspaceSeed) {
  return prepareGeneratedWorkspace(seed, {
    fixtureSize: process.env.KAUR_KHOR_BENCHMARK_FIXTURE_SIZE,
    repoRoot: process.cwd(),
  });
}
