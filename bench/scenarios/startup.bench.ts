import { test } from '@playwright/test';
import {
  closeBanjiBenchmarkApp,
  launchBanjiForBenchmark,
  snapshotRendererBenchmarkMemory,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

test('cold dev launch reaches a usable workspace', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('startup-cold-dev', testInfo);
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'preload.bridge.exposed');
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.app.getAppContext');
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await waitForPersistedBenchmarkEventCount(launched, 'route.dashboard.ready');
    await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_startup_mb');
  } finally {
    await closeBanjiBenchmarkApp(launched, 'startup');
  }
});
