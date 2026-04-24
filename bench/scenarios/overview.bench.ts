import { test } from '@playwright/test';
import {
  assertLocatorCountAtLeast,
  clickWaitReadyAndRecordDuration,
  closeBanjiBenchmarkAppWithTargetCoverage,
  closeVisibleDialog,
  ensureAutomationBenchmarkSeed,
  launchBanjiForBenchmark,
  markBenchmarkMeasurementEnd,
  markBenchmarkMeasurementStart,
  recordBenchmarkPhaseMarker,
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
    const seedSummary = await ensureAutomationBenchmarkSeed(launched, {
      minimumExposedRows: 2,
      minimumIntakes: 2,
    });
    await recordBenchmarkPhaseMarker(launched.page, 'seed_end', {
      exposedRows: seedSummary.exposedRows,
      intakeRows: seedSummary.intakeRows,
      needsReviewRows: seedSummary.needsReviewRows,
      targetSupplierFilterLabel: seedSummary.targetSupplierFilterLabel,
    });
    await markBenchmarkMeasurementStart(launched, {
      workflow: 'overview',
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

    const supplierTrigger = launched.page.getByRole('combobox', { name: 'Filter by supplier' });
    await supplierTrigger.click();
    const targetSupplierOption = launched.page.getByRole('option', {
      name: seedSummary.targetSupplierFilterLabel,
      exact: true,
    });
    await targetSupplierOption.waitFor({ state: 'visible', timeout: 30_000 });

    await clickWaitReadyAndRecordDuration(launched, {
      action: async () => {
        await targetSupplierOption.evaluate((element) => {
          const benchmarkWindow = window as Window & {
            __BANJI_BENCHMARK_ACTION_STARTED_AT__?: number;
          };
          benchmarkWindow.__BANJI_BENCHMARK_ACTION_STARTED_AT__ = undefined;
          element.addEventListener('pointerdown', () => {
            benchmarkWindow.__BANJI_BENCHMARK_ACTION_STARTED_AT__ = Date.now();
          }, { capture: true, once: true });
        });
        await targetSupplierOption.click();
        const startedAt = await launched.page.evaluate(() =>
          (window as Window & { __BANJI_BENCHMARK_ACTION_STARTED_AT__?: number })
            .__BANJI_BENCHMARK_ACTION_STARTED_AT__);
        return { startedAt };
      },
      readyEvent: 'route.dashboard.ready',
      metricName: 'interaction.overview_supplier_filter_ms',
      route: '/?workflow=supplier',
      category: 'interaction',
    });
  } catch (error) {
    scenarioError = error;
  } finally {
    await markBenchmarkMeasurementEnd(launched, {
      workflow: 'overview',
      ok: scenarioError == null,
    });
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
      'backend.core.interactive_queue_wait_p95_ms',
      'backend.core.read_pool_queue_wait_p95_ms',
    ],
    scenarioError,
  );
});
