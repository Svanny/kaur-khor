import { test } from '@playwright/test';
import {
  closeBanjiBenchmarkSession,
  finalizeBanjiBenchmarkScenario,
  launchBanjiForBenchmark,
  recordPlaywrightDuration,
  snapshotRendererBenchmarkMemory,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

test('cold dev launch reaches a usable workspace', async ({}, testInfo) => {
  let launched = await launchBanjiForBenchmark('startup-cold-dev', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'preload.bridge.exposed');
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.app.getAppContext');
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready');
    await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_startup_cold_mb');
  } finally {
    await closeBanjiBenchmarkSession(launched);
  }

  const warmStartedAt = Date.now();
  launched = await launchBanjiForBenchmark('startup-cold-dev', testInfo, {
    dataDirectory: launched.dataDirectory,
    outputDirectory: launched.outputDirectory,
    prepareWorkspace: false,
    runId: launched.runId,
  });

  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready', 2);
    await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready', 2);
    await recordPlaywrightDuration(launched.page, {
      metricName: 'startup.warm_workspace_ready_ms',
      durationMs: Date.now() - warmStartedAt,
      route: '/',
      category: 'startup',
      detail: { launchType: 'warm' },
    });
    await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_startup_warm_mb');
  } finally {
    await closeBanjiBenchmarkSession(launched);
  }

  await finalizeBanjiBenchmarkScenario({
    outputDirectory: launched.outputDirectory,
    runId: launched.runId,
    scenario: 'startup',
  });
});
