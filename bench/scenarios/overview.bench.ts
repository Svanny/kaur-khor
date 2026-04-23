import { test } from '@playwright/test';
import {
  assertLocatorCountAtLeast,
  clickWaitReadyAndRecordDuration,
  closeBanjiBenchmarkAppWithTargetCoverage,
  closeVisibleDialog,
  ensureAutomationBenchmarkSeed,
  launchBanjiForBenchmark,
  navigateBenchmarkRouteAndMeasureDuration,
  openOverviewCustomerIntakeDrawerAndRecordDuration,
  openOverviewSupplierDrawerAndRecordDuration,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';

test('overview measures current supplier and customer workflows', async ({}, testInfo) => {
  const launched = await launchBanjiForBenchmark('overview-current-workflows', testInfo);
  let scenarioError: unknown = null;
  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    await ensureAutomationBenchmarkSeed(launched, {
      minimumExposedRows: 2,
      minimumIntakes: 2,
    });

    await navigateBenchmarkRouteAndMeasureDuration(launched, {
      route: '/?workflow=customer&customerFilter=review',
      readyEvent: 'route.dashboard.ready',
      metricName: 'interaction.overview_workflow_toggle_ms',
      category: 'interaction',
      waitFor: async () => {
        await launched.page.getByRole('heading', { name: 'Customer queue' }).waitFor({ state: 'visible', timeout: 30_000 });
      },
    });

    const customerIntakeButtons = launched.page.locator('[data-customer-task-id] button');
    await assertLocatorCountAtLeast(customerIntakeButtons, 1, 'overview customer intake action button(s)');

    await openOverviewCustomerIntakeDrawerAndRecordDuration(launched);
    await closeVisibleDialog(launched.page);

    await navigateBenchmarkRouteAndMeasureDuration(launched, {
      route: '/?workflow=supplier',
      readyEvent: 'route.dashboard.ready',
      metricName: 'interaction.overview_workflow_toggle_ms',
      category: 'interaction',
      waitFor: async () => {
        await launched.page.getByRole('heading', { name: 'Task queue' }).waitFor({ state: 'visible', timeout: 30_000 });
      },
    });

    await navigateBenchmarkRouteAndMeasureDuration(launched, {
      route: '/?workflow=supplier&filter=to_order',
      readyEvent: 'route.dashboard.ready',
      metricName: 'interaction.overview_task_tab_transition_ms',
      category: 'interaction',
    });

    await navigateBenchmarkRouteAndMeasureDuration(launched, {
      route: '/?workflow=supplier&filter=all',
      readyEvent: 'route.dashboard.ready',
      metricName: 'interaction.overview_task_tab_transition_ms',
      category: 'interaction',
    });

    await openOverviewSupplierDrawerAndRecordDuration(launched);
    await closeVisibleDialog(launched.page);

    await clickWaitReadyAndRecordDuration(launched, {
      action: async () => {
        const supplierTrigger = launched.page.getByRole('combobox', { name: 'Filter by supplier' });
        await supplierTrigger.click();
        const options = launched.page.getByRole('option');
        const optionCount = await assertLocatorCountAtLeast(options, 2, 'supplier filter option(s)');
        for (let index = 0; index < optionCount; index += 1) {
          const option = options.nth(index);
          const label = (await option.textContent())?.trim().toLowerCase() ?? '';
          if (label && label !== 'all suppliers') {
            await option.click();
            return;
          }
        }
        throw new Error('Overview supplier filter has no selectable supplier option besides "All suppliers".');
      },
      readyEvent: 'route.dashboard.ready',
      metricName: 'interaction.overview_supplier_filter_ms',
      route: '/?workflow=supplier',
      category: 'interaction',
    });
  } catch (error) {
    scenarioError = error;
  }

  await closeBanjiBenchmarkAppWithTargetCoverage(
    launched,
    'overview',
    [
      'interaction.overview_workflow_toggle_ms',
      'interaction.open_overview_customer_intake_drawer_ms',
      'interaction.open_overview_supplier_drawer_ms',
      'interaction.overview_task_tab_transition_ms',
      'interaction.overview_supplier_filter_ms',
      'backend.core.queue_wait_p95_ms',
      'backend.core.read_pool_queue_wait_p95_ms',
    ],
    scenarioError,
  );
});
