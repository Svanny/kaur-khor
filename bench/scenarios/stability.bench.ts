import { test } from '@playwright/test';
import {
  clickSidebarNavigation,
  closeKaurKhorBenchmarkApp,
  launchKaurKhorForBenchmark,
  markBenchmarkMeasurementEnd,
  markBenchmarkMeasurementStart,
  persistedBenchmarkEventCount,
  recordPlaywrightDuration,
  snapshotRendererBenchmarkMemory,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

const CYCLE_SECTIONS: Array<{
  label: string;
  metricName?: string;
  path: `/${string}`;
  readyEvent: string;
}> = [
  { label: 'Work', path: '/work/queue', readyEvent: 'route.work.queue.ready' },
  { label: 'Catalog', path: '/catalog', readyEvent: 'route.catalog.ready' },
  { label: 'Insights', metricName: 'nav.work_to_insights_ms', path: '/insights/pressure', readyEvent: 'route.insights.pressure.ready' },
  { label: 'Settings', path: '/settings', readyEvent: 'route.settings.ready' },
  { label: 'Back to app', path: '/insights/explain', readyEvent: 'route.insights.explain.ready' },
];

async function switchInsightsMode(
  launched: Awaited<ReturnType<typeof launchKaurKhorForBenchmark>>,
  {
    cycle,
    label,
    metricName,
    readyEvent,
    route,
  }: {
    cycle: number;
    label: string;
    metricName: string;
    readyEvent: string;
    route: `/${string}`;
  },
) {
  const previousCount = await persistedBenchmarkEventCount(launched, readyEvent);
  const startedAt = Date.now();
  await launched.page.getByRole('link', { name: new RegExp(label, 'i') }).click();
  await waitForPersistedBenchmarkEventCount(launched, readyEvent, previousCount + 1);
  await recordPlaywrightDuration(launched.page, {
    metricName,
    durationMs: Date.now() - startedAt,
    route,
    category: 'navigation',
    detail: { cycle },
  });
}

test('repeated sidebar navigation stays crash-free and records memory slope inputs', async ({}, testInfo) => {
  const launched = await launchKaurKhorForBenchmark('stability-sidebar-cycle', testInfo);
  let scenarioError: unknown = null;
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await markBenchmarkMeasurementStart(launched, { workflow: 'stability' });

    for (let cycle = 0; cycle < 4; cycle += 1) {
      for (const section of CYCLE_SECTIONS) {
        if (section.label === 'Insights') {
          const startedAt = Date.now();
          await clickSidebarNavigation(launched.page, section.label);
          await launched.page.waitForFunction(() => window.location.hash.includes('/insights'));
          const currentHash = await launched.page.evaluate(() => window.location.hash);
          if (!currentHash.includes('/insights/pressure')) {
            await launched.page.getByRole('link', { name: /Pressure/i }).click();
            await launched.page.waitForFunction(() => {
              const hash = window.location.hash;
              return hash.includes('/insights/pressure');
            });
          }
          if (section.metricName) {
            await recordPlaywrightDuration(launched.page, {
              metricName: section.metricName,
              durationMs: Date.now() - startedAt,
              route: section.path,
              category: 'navigation',
              detail: { cycle: cycle + 1 },
            });
          }
          await switchInsightsMode(launched, {
            cycle: cycle + 1,
            label: 'Money',
            metricName: 'nav.insights_pressure_to_money_ms',
            readyEvent: 'route.insights.money.ready',
            route: '/insights/money',
          });
          await switchInsightsMode(launched, {
            cycle: cycle + 1,
            label: 'Explain',
            metricName: 'nav.insights_money_to_explain_ms',
            readyEvent: 'route.insights.explain.ready',
            route: '/insights/explain',
          });
          continue;
        }
        const previousCount = await persistedBenchmarkEventCount(launched, section.readyEvent);
        const startedAt = Date.now();
        await clickSidebarNavigation(launched.page, section.label);
        await waitForPersistedBenchmarkEventCount(launched, section.readyEvent, previousCount + 1);
        if (section.metricName) {
          await recordPlaywrightDuration(launched.page, {
            metricName: section.metricName,
            durationMs: Date.now() - startedAt,
            route: section.path,
            category: 'navigation',
            detail: { cycle: cycle + 1 },
          });
        }
      }
      await snapshotRendererBenchmarkMemory(launched.page, `memory.renderer_stability_cycle_${cycle + 1}_mb`);
    }

    await snapshotRendererBenchmarkMemory(launched.page, 'memory.renderer_after_stability_mb');
  } catch (error) {
    scenarioError = error;
  } finally {
    await markBenchmarkMeasurementEnd(launched, {
      workflow: 'stability',
      ok: scenarioError == null,
    });
    await closeKaurKhorBenchmarkApp(launched, 'stability');
  }
  if (scenarioError) {
    throw scenarioError;
  }
});
