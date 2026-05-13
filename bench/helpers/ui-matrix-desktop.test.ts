import type { Page, TestInfo } from '@playwright/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  attachPageIssueCollector: vi.fn(),
  benchmarkDataDirectory: vi.fn(),
  benchmarkOutputDirectory: vi.fn(),
  benchmarkRunId: vi.fn(),
  launchKaurKhorForBenchmark: vi.fn(),
  prepareBenchmarkWorkspace: vi.fn(),
}));

vi.mock('../../bench/helpers/artifact-paths', () => ({
  benchmarkDataDirectory: mocks.benchmarkDataDirectory,
  benchmarkOutputDirectory: mocks.benchmarkOutputDirectory,
  benchmarkRunId: mocks.benchmarkRunId,
}));

vi.mock('../../bench/helpers/electron-app', () => ({
  closeKaurKhorBenchmarkSession: vi.fn(),
  launchKaurKhorForBenchmark: mocks.launchKaurKhorForBenchmark,
  waitForPersistedBenchmarkEventCount: vi.fn(),
}));

vi.mock('../../bench/helpers/workspace-seed', () => ({
  prepareBenchmarkWorkspace: mocks.prepareBenchmarkWorkspace,
}));

vi.mock('../../ui-matrix/helpers/runtime-guards', () => ({
  attachPageIssueCollector: mocks.attachPageIssueCollector,
}));

import { launchDesktopUiMatrix } from '../../ui-matrix/helpers/desktop';

describe('launchDesktopUiMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.benchmarkRunId.mockImplementation((name: string) => `run-${name}`);
    mocks.benchmarkDataDirectory.mockImplementation(async (runId: string) => `/tmp/${runId}/data`);
    mocks.benchmarkOutputDirectory.mockImplementation(async (runId: string) => `/tmp/${runId}/out`);
    mocks.attachPageIssueCollector.mockReturnValue({ assertClean: vi.fn() });
  });

  it('launches the desktop app in benchmark background-window mode', async () => {
    const page = { on: vi.fn() } as unknown as Page;
    mocks.launchKaurKhorForBenchmark.mockResolvedValue({
      app: {},
      dataDirectory: '/tmp/data',
      outputDirectory: '/tmp/out',
      page,
      runId: 'run-ui-matrix-background-0',
      tracePath: null,
    });

    await launchDesktopUiMatrix({
      fresh: true,
      name: 'background',
      testInfo: { retry: 0 } as TestInfo,
    });

    expect(mocks.launchKaurKhorForBenchmark).toHaveBeenCalledWith(
      'ui-matrix-background',
      expect.objectContaining({ retry: 0 }),
      expect.objectContaining({
        backgroundWindow: true,
        prepareWorkspace: false,
      }),
    );
  });
});
