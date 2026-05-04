import { test } from '@playwright/test';
import {
  benchmarkEventCount,
  closeKaurKhorBenchmarkSession,
  finalizeKaurKhorBenchmarkScenario,
  type LaunchedKaurKhorBenchmarkApp,
  launchKaurKhorForBenchmark,
  markBenchmarkMeasurementEnd,
  markBenchmarkMeasurementStart,
  recordPlaywrightDuration,
  snapshotRendererBenchmarkMemory,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

test('cold dev launch reaches a usable workspace', async ({}, testInfo) => {
  const launched: LaunchedKaurKhorBenchmarkApp = await launchKaurKhorForBenchmark('startup-cold-dev', testInfo);
  await markBenchmarkMeasurementStart(launched, {
    workflow: 'startup',
    launchType: 'cold+warm-reload',
  });
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'preload.bridge.exposed');
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.app.getAppContext');
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await waitForPersistedBenchmarkEventCount(launched, 'route.home.ready');
    await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_startup_cold_mb');

    const priorWorkspaceReadyCount = await benchmarkEventCount(launched, 'renderer.workspace.ready');
    const warmStartedAt = Date.now();
    await launched.page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready', priorWorkspaceReadyCount + 1);
    await waitForPersistedBenchmarkEventCount(launched, 'route.home.ready');
    await recordPlaywrightDuration(launched.page, {
      metricName: 'startup.warm_workspace_ready_ms',
      durationMs: Date.now() - warmStartedAt,
      route: '/',
      category: 'startup',
      detail: { launchType: 'warm-reload' },
    });
    await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_startup_warm_mb');
    await markBenchmarkMeasurementEnd(launched, {
      workflow: 'startup',
      launchType: 'cold+warm-reload',
      ok: true,
    });
  } finally {
    await closeKaurKhorBenchmarkSession(launched);
  }

  await finalizeKaurKhorBenchmarkScenario({
    outputDirectory: launched.outputDirectory,
    runId: launched.runId,
    scenario: 'startup',
  });
});
