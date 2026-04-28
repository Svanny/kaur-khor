import { test, expect } from '@playwright/test';
import { launchBanjiForBenchmark, closeBanjiBenchmarkSession, navigateBenchmarkRoute, waitForBenchmarkEventCount } from '../helpers/electron-app';

test('insights explain main view does not scroll', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('explain-main-view-scroll', testInfo, {
    fixtureSize: 'minimal',
    prepareWorkspace: true,
  });

  try {
    await navigateBenchmarkRoute(launched.page, '/insights/explain');
    await waitForBenchmarkEventCount(launched, 'route.insights.explain.ready', 1, { timeoutMs: 30_000 });

    const main = launched.page.locator('main#main-content');
    await main.waitFor({ state: 'visible', timeout: 10_000 });

    const scrollData = await main.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflow: window.getComputedStyle(el).overflow,
    }));

    expect(scrollData.clientHeight).toBeGreaterThan(0);
    expect(scrollData.scrollHeight).toBeLessThanOrEqual(scrollData.clientHeight);
  } finally {
    await closeBanjiBenchmarkSession(launched);
  }
});
