import { execFile } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type BenchmarkWorkspaceSize = 'minimal' | 'medium' | 'heavy' | 'power-user';

export interface BenchmarkWorkspaceHistorySize {
  years: number;
  intervalDays: number;
  expectedObservationCount: number;
  startupOnlyReadModel: boolean;
}

export interface GeneratedWorkspaceSeed {
  dataDirectory: string;
  size: BenchmarkWorkspaceSize;
}

export interface GeneratedWorkspaceSeedResult extends GeneratedWorkspaceSeed {
  mode: 'generated-history';
  seeded: boolean;
}

export interface DevWorkspaceSeedState {
  hasBlankWorkspaceMarker: boolean;
  hasGeneratedHistoryMarker: boolean;
  hasWorkspaceStore: boolean;
  mode: 'generated-history';
}

export const BENCHMARK_WORKSPACE_HISTORY_SIZES: Record<BenchmarkWorkspaceSize, BenchmarkWorkspaceHistorySize> = {
  minimal: { years: 0, intervalDays: 7, expectedObservationCount: 0, startupOnlyReadModel: false },
  medium: { years: 1, intervalDays: 7, expectedObservationCount: 53, startupOnlyReadModel: false },
  heavy: { years: 3, intervalDays: 3.5, expectedObservationCount: 314, startupOnlyReadModel: false },
  'power-user': { years: 10, intervalDays: 1, expectedObservationCount: 3653, startupOnlyReadModel: true },
};

export function normalizeBenchmarkWorkspaceSize(
  value: string | undefined,
  fallback: BenchmarkWorkspaceSize,
): BenchmarkWorkspaceSize {
  return value === 'minimal'
    || value === 'medium'
    || value === 'heavy'
    || value === 'power-user'
    ? value
    : fallback;
}

export function buildGenerateDevHistoryArgs({
  repoRoot,
  dataDirectory,
  size,
}: {
  repoRoot: string;
  dataDirectory: string;
  size: BenchmarkWorkspaceSize;
}) {
  const historySize = BENCHMARK_WORKSPACE_HISTORY_SIZES[size];
  return [
    './scripts/generate_dev_history.py',
    '--repo-root',
    repoRoot,
    '--sena-db',
    join(dataDirectory, 'desktop-sena-store.sqlite3'),
    '--seed-marker',
    join(dataDirectory, 'desktop-sena-dev-history.json'),
    '--years',
    String(historySize.years),
    '--interval-days',
    String(historySize.intervalDays),
    ...(historySize.startupOnlyReadModel ? ['--startup-only-read-model'] : []),
  ];
}

export function shouldPrepareGeneratedWorkspace({
  hasBlankWorkspaceMarker,
  hasGeneratedHistoryMarker,
  hasWorkspaceStore,
}: {
  hasBlankWorkspaceMarker: boolean;
  hasGeneratedHistoryMarker: boolean;
  hasWorkspaceStore: boolean;
}, options: { allowBlankWorkspaceSeed?: boolean } = {}) {
  return (options.allowBlankWorkspaceSeed || !hasBlankWorkspaceMarker) && (!hasGeneratedHistoryMarker || !hasWorkspaceStore);
}

export function shouldSeedGeneratedDevWorkspace(env: Record<string, string | undefined> = process.env) {
  return env.KAUR_KHOR_DEV_SEED === '1';
}

export async function detectDevWorkspaceSeedState(dataDirectory: string): Promise<DevWorkspaceSeedState> {
  const blankMarkerPath = join(dataDirectory, '.kaur-khor-blank-workspace.json');
  const seedMarkerPath = join(dataDirectory, 'desktop-sena-dev-history.json');
  const storePath = join(dataDirectory, 'desktop-sena-store.sqlite3');
  let hasBlankWorkspaceMarker = false;
  let hasGeneratedHistoryMarker = false;
  let hasWorkspaceStore = false;

  try {
    const markerStats = await stat(blankMarkerPath);
    hasBlankWorkspaceMarker = markerStats.isFile() && markerStats.size > 0;
  } catch {
    hasBlankWorkspaceMarker = false;
  }

  try {
    const markerStats = await stat(seedMarkerPath);
    hasGeneratedHistoryMarker = markerStats.isFile() && markerStats.size > 0;
  } catch {
    hasGeneratedHistoryMarker = false;
  }

  try {
    const storeStats = await stat(storePath);
    hasWorkspaceStore = storeStats.isFile() && storeStats.size > 0;
  } catch {
    hasWorkspaceStore = false;
  }

  return {
    hasBlankWorkspaceMarker,
    hasGeneratedHistoryMarker,
    hasWorkspaceStore,
    mode: 'generated-history',
  };
}

export async function markDevWorkspaceBlank(dataDirectory: string) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(
    join(dataDirectory, '.kaur-khor-blank-workspace.json'),
    `${JSON.stringify({ clearedAt: new Date().toISOString(), version: 1 }, null, 2)}\n`,
    'utf8',
  );
}

export async function prepareGeneratedWorkspace(
  seed: GeneratedWorkspaceSeed,
  options?: { fixtureSize?: string; repoRoot?: string },
): Promise<GeneratedWorkspaceSeedResult> {
  await mkdir(seed.dataDirectory, { recursive: true });
  const repoRoot = options?.repoRoot ?? process.cwd();
  const fixtureSize = normalizeBenchmarkWorkspaceSize(options?.fixtureSize, seed.size);
  const { stdout } = await execFileAsync(
    'python3',
    buildGenerateDevHistoryArgs({
      repoRoot,
      dataDirectory: seed.dataDirectory,
      size: fixtureSize,
    }),
    {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 4,
    },
  );
  let seeded = true;
  try {
    const payload = JSON.parse(stdout);
    seeded = payload?.skipped !== true;
  } catch {
    seeded = true;
  }
  if (seeded) {
    await writeFile(
      join(seed.dataDirectory, 'desktop-preferences.json'),
      `${JSON.stringify({
        onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
        showExplanatoryTooltips: true,
        showFloatingTitleActions: true,
        showRightRailCards: true,
        showOverviewTaskTabs: true,
        showAutomationsPage: true,
        showAnalysisPage: true,
        showPerformanceCompareToggle: true,
        showPerformanceTimelineCard: true,
        showLogsViewToggle: true,
        showHeartbeatRibbons: true,
        customShowExplanatoryTooltips: true,
        customShowFloatingTitleActions: true,
        customShowRightRailCards: true,
        customShowOverviewTaskTabs: true,
        customShowAutomationsPage: true,
        customShowAnalysisPage: true,
        customShowPerformanceCompareToggle: true,
        customShowPerformanceTimelineCard: true,
        customShowLogsViewToggle: true,
        customShowHeartbeatRibbons: true,
        seenUnlockedNavItems: {
          catalog: true,
          insights: true,
          work: true,
        },
      }, null, 2)}\n`,
      'utf8',
    );
  }
  return {
    ...seed,
    size: fixtureSize,
    mode: 'generated-history',
    seeded,
  };
}
