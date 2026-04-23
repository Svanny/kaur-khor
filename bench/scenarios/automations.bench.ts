import { test } from '@playwright/test';
import {
  assertLocatorCountAtLeast,
  clickSidebarNavigationAndMeasureDuration,
  clickWaitReadyAndRecordDuration,
  closeBanjiBenchmarkAppWithTargetCoverage,
  closeVisibleDialog,
  ensureAutomationBenchmarkSeed,
  launchBanjiForBenchmark,
  openAutomationIntakeDrawerAndRecordDuration,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

test('automations measures current connection, intake, and exceptions flows', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('automations-current-flows', testInfo);
  let scenarioError: unknown = null;
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await ensureAutomationBenchmarkSeed(launched, {
      minimumExposedRows: 2,
      minimumIntakes: 2,
    });

    await clickSidebarNavigationAndMeasureDuration(launched, {
      label: 'Automations',
      readyEvent: 'route.automations.ready',
      metricName: 'nav.to_automations_ms',
      route: '/automations',
      category: 'navigation',
      waitFor: async () => {
        await launched.page.getByText(/Last webhook/i).first().waitFor({ state: 'visible', timeout: 30_000 });
      },
    });

    await clickWaitReadyAndRecordDuration(launched, {
      action: async () => {
        await launched.page.getByRole('tab', { name: 'Catalog' }).click();
      },
      readyEvent: 'route.automations.ready',
      metricName: 'interaction.automations_exposure_filter_ms',
      route: '/automations?section=catalog',
      category: 'interaction',
      waitFor: async () => {
        await launched.page.getByRole('heading', { name: 'Sellables exposed to Telegram' }).waitFor({ state: 'visible', timeout: 30_000 });
      },
    });

    await clickWaitReadyAndRecordDuration(launched, {
      action: async () => {
        const allButton = launched.page.getByRole('button', { name: 'All' }).first();
        const exposedButton = launched.page.getByRole('button', { name: 'Exposed' }).first();
        if ((await exposedButton.getAttribute('data-state')) === 'on') {
          await allButton.click();
        }
        await exposedButton.click();
      },
      metricName: 'interaction.automations_exposure_filter_ms',
      route: '/automations?section=catalog&exposure=exposed',
      category: 'interaction',
      waitFor: async () => {
        const exposedToggles = launched.page.locator('[role="switch"]');
        await assertLocatorCountAtLeast(exposedToggles, 1, 'automations exposure row toggle(s)');
      },
    });

    await clickWaitReadyAndRecordDuration(launched, {
      action: async () => {
        await launched.page.getByRole('tab', { name: 'Live intake' }).click();
      },
      readyEvent: 'route.automations.ready',
      metricName: 'interaction.automations_live_intake_table_ms',
      route: '/automations?section=intake',
      category: 'interaction',
      waitFor: async () => {
        await assertLocatorCountAtLeast(
          launched.page.getByRole('button', { name: /Open intake/i }),
          1,
          'automations live intake action button(s)',
        );
      },
    });

    await openAutomationIntakeDrawerAndRecordDuration(launched);
    await closeVisibleDialog(launched.page);

    await clickWaitReadyAndRecordDuration(launched, {
      action: async () => {
        await launched.page.getByRole('tab', { name: 'Needs review' }).click();
      },
      readyEvent: 'route.automations.ready',
      metricName: 'interaction.automations_exceptions_section_ms',
      route: '/automations?section=exceptions',
      category: 'interaction',
      waitFor: async () => {
        await assertLocatorCountAtLeast(
          launched.page.getByRole('button', { name: /Open intake/i }),
          1,
          'automations exception action button(s)',
        );
      },
    });
  } catch (error) {
    scenarioError = error;
  }

  await closeBanjiBenchmarkAppWithTargetCoverage(
    launched,
    'automations',
    [
      'nav.to_automations_ms',
      'interaction.automations_exposure_filter_ms',
      'interaction.automations_live_intake_table_ms',
      'interaction.open_automation_intake_drawer_ms',
      'interaction.automations_exceptions_section_ms',
      'backend.core.queue_wait_p95_ms',
      'backend.core.read_pool_queue_wait_p95_ms',
    ],
    scenarioError,
  );
});
