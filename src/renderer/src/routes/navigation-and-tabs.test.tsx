import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { getTranslation } from '@/lib/translations';
import { InventoryRoute } from './inventory';
import { ServiceDetailRoute } from './service-detail';
import { SkuDetailRoute } from './sku-detail';
import { NavigationHistoryProvider } from '@/state/navigation-history';

const inventoryHook = vi.fn();
const preferenceState = {
  currency: 'USD',
  language: 'en',
  showRightRailCards: true,
};

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    currency: preferenceState.currency,
    language: preferenceState.language,
    showRightRailCards: preferenceState.showRightRailCards,
    t: (key: string, variables?: Record<string, string | number | null | undefined>) =>
      getTranslation('en', key as never, variables),
  }),
}));

const sampleCatalog = {
  schemaVersion: 1,
  skus: [
    {
      costPerUnit: 4,
      description: 'Cotton tee',
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'SKU 1',
      productPrice: 9,
      skuId: 'sku-1',
      soldAsProduct: true,
    },
  ],
  services: [
    {
      bundle: false,
      description: 'Service',
      name: 'Service 1',
      price: 15,
      serviceId: 'service-1',
    },
  ],
  bundles: [],
  sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: null }],
};

describe('SENA routes', () => {
  beforeEach(() => {
    preferenceState.showRightRailCards = true;
    inventoryHook.mockReturnValue({
      snapshot: {
        skus: [
          {
            skuId: 'sku-1',
            name: 'SKU 1',
            description: 'Cotton tee',
            unitsInStock: 12,
            costPerUnit: 4,
            soldAsProduct: true,
            productPrice: 9,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
        ],
        services: [
          {
            serviceId: 'service-1',
            name: 'Service 1',
            description: 'Service',
            price: 15,
            skuIds: ['sku-1'],
          },
        ],
        ranking: [],
        sist: {
          status: { state: 'ready', updatedAt: '2026-04-02T00:00:00Z', reportCount: 1, confidence: 'medium', reason: null },
          settings: { targetServiceLevel: 0.95, forecastHorizonDays: 14, particleCount: 512, smoothingWindowReports: 90 },
          asOf: '2026-04-02T00:00:00Z',
          topRegime: 'normal',
          pendingReorderCount: 1,
          highRiskSkuIds: ['sku-1'],
          skuInsights: [],
        },
      },
      reports: [],
      catalog: sampleCatalog,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: [],
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      workspaceSummary: {
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 1,
        serviceCount: 1,
        intervalCount: 1,
        pendingReorderCount: 1,
        topRegime: 'normal',
        highRiskSkuIds: ['sku-1'],
        skuSummaries: [],
      },
      reload: vi.fn(),
      loadInventorySnapshot: vi.fn(async () => ({
        skus: [
          {
            skuId: 'sku-1',
            name: 'SKU 1',
            description: 'Cotton tee',
            unitsInStock: 12,
            costPerUnit: 4,
            soldAsProduct: true,
            productPrice: 9,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
        ],
        services: [
          {
            serviceId: 'service-1',
            name: 'Service 1',
            description: 'Service',
            price: 15,
            skuIds: ['sku-1'],
          },
        ],
        ranking: [],
        sist: {
          status: { state: 'ready', updatedAt: '2026-04-02T00:00:00Z', reportCount: 1, confidence: 'medium', reason: null },
          settings: { targetServiceLevel: 0.95, forecastHorizonDays: 14, particleCount: 512, smoothingWindowReports: 90 },
          asOf: '2026-04-02T00:00:00Z',
          topRegime: 'normal',
          pendingReorderCount: 1,
          highRiskSkuIds: ['sku-1'],
          skuInsights: [],
        },
      })),
      listStockReports: vi.fn(async () => []),
      runWorkspacePreparation: vi.fn(async (task: () => Promise<unknown>) => task()),
      loadSenaCatalog: vi.fn(async () => sampleCatalog),
      loadSenaObservations: vi.fn(async () => []),
      listSenaObservations: vi.fn(async () => []),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
      ingestSenaObservation: vi.fn(),
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-1' })),
      retrySenaRun: vi.fn(async () => ({ runId: 'run-1' })),
      loadSenaWorkspaceSummary: vi.fn(async () => ({
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 1,
        serviceCount: 1,
        intervalCount: 1,
        pendingReorderCount: 1,
        topRegime: 'normal',
        highRiskSkuIds: ['sku-1'],
        skuSummaries: [],
      })),
      loadSenaSkuDetail: vi.fn(async () => ({
        summary: {
          skuId: 'sku-1',
          latestPosteriorUnits: 9,
          credibleIntervalLow: 6,
          credibleIntervalHigh: 12,
          demandPerDayMean: 2,
          stockoutRisk: 0.4,
          daysOfCover: 4,
          expectedLeadTimeDemand: 8,
          safetyStock: 3,
          reorderPoint: 7,
          reorderTriggerProbability: 0.55,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
          regimeProbabilities: { normal: 1 },
        },
        inventoryPosterior: [],
        demandPosterior: [],
        pipelinePosterior: [],
        leadTimePosterior: [],
      })),
      loadSenaDiagnostics: vi.fn(async () => ({
        effectiveSampleSizeMean: 0.81,
        resamplingCount: 3,
        smoothingEnabled: false,
        changePointProbability: 0.2,
        seasonalityActive: false,
        posteriorPredictiveErrorMean: 0.1,
        coverageEstimate: 0.88,
        regimeHistory: [],
      })),
      loadSenaServiceDetail: vi.fn(async () => ({
        serviceId: 'service-1',
        activityMean: 3,
        activityIntervalLow: 2,
        activityIntervalHigh: 4,
        bottleneckProbability: 0.3,
        contributors: [
          {
            skuId: 'sku-1',
            usageProbability: 0.85,
            bottleneckProbability: 0.3,
          },
        ],
        regimeTimeline: [
          {
            intervalIndex: 0,
            startAt: '2026-04-01T00:00:00Z',
            endAt: '2026-04-01T23:59:00Z',
            dominantRegime: 'normal',
            regimeProbabilities: { normal: 1 },
          },
        ],
      })),
      loadSenaRunStatus: vi.fn(async () => ({
        runId: 'run-1',
        ownerSub: 'desktop-owner',
        algorithmVersion: 'sena-analysis-v3',
        status: 'succeeded',
        observationCount: 0,
        createdAt: '2026-04-02T00:00:00Z',
        completedAt: '2026-04-02T00:01:00Z',
        summary: null,
        diagnostics: null,
        primaryArtifactKey: null,
        error: null,
      })),
      updateSenaMeta: vi.fn(),
    });
  });

  function renderWithProviders(route: string, element: ReactNode, path: string) {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <NavigationHistoryProvider>
          <Routes>
            <Route element={element} path={path} />
          </Routes>
        </NavigationHistoryProvider>
      </MemoryRouter>,
    );
  }

  async function renderWithProvidersSettled(route: string, element: ReactNode, path: string) {
    let view!: ReturnType<typeof renderWithProviders>;
    await act(async () => {
      view = renderWithProviders(route, element, path);
      await Promise.resolve();
    });
    return view;
  }

  test('renders the catalog route', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');
    await waitFor(() => {
      expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalled();
    });

    expect(screen.getByText('Offered Selections')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search name or description…')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'SKUs' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByText('SKU 1')).toBeInTheDocument();
    expect(screen.getByText('Service 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SKU 1' })).toHaveAttribute('href', '/catalog/skus/sku-1');
    expect(screen.getByRole('link', { name: 'Service 1' })).toHaveAttribute('href', '/catalog/services/service-1');
    expect(screen.getByText('1 linked services · sellable · price $9.00 · cost $4.00')).toBeInTheDocument();
    expect(screen.getByText('1 linked SKUs · price $15.00')).toBeInTheDocument();
  });

  test('renders the catalog wireframe while the catalog is still loading', () => {
    const baseState = inventoryHook();
    inventoryHook.mockReturnValue({
      ...baseState,
      catalog: null,
      isLoading: true,
      workspaceSummary: null,
    });

    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    expect(screen.getByText('Offered Selections')).toBeInTheDocument();
    expect(screen.getByText('SKUs')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.queryByText('No catalog loaded yet')).not.toBeInTheDocument();
  });

  test('renders inline catalog actions for SKU and service rows', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');
    await waitFor(() => {
      expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalled();
    });

    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    fireEvent.click(within(skuRow!).getByRole('button', { name: 'More actions for SKU 1' }));

    expect(screen.getByRole('button', { name: 'Record stock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log receipt' })).toBeInTheDocument();
  });

  test('preloads visible service actions without repeatedly rehydrating the same service detail', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    await waitFor(() => {
      expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalledTimes(1);
    });
    expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalledWith('service-1');
  });

  test('opens the SKU action flow in catalog without showing the inline detail rail', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    fireEvent.click(within(skuRow!).getByRole('button', { name: 'More actions for SKU 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log order' }));

    await waitFor(() => {
      expect(screen.getByText('Approximate order quantity')).toBeInTheDocument();
    });

    expect(screen.getByText('Log order for SKU 1')).toBeInTheDocument();

    expect(screen.queryByText('Incoming stock')).not.toBeInTheDocument();
    expect(screen.queryByText('Next check')).not.toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: /Ledger for SKU 1/ })).not.toBeInTheDocument();
  });

  test('asks before closing a dirty SKU action sheet', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    fireEvent.click(within(skuRow!).getByRole('button', { name: 'More actions for SKU 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log order' }));

    await waitFor(() => {
      expect(screen.getByText('Approximate order quantity')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Approximate order quantity'), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Approximate order quantity')).toHaveValue(22);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.queryByText('Approximate order quantity')).not.toBeInTheDocument();
    });
  });

  test('opens the service action flow in catalog without showing the inline detail rail', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    const serviceRow = screen.getByRole('link', { name: 'Service 1' }).closest('div.group');
    expect(serviceRow).not.toBeNull();

    await waitFor(() => {
      fireEvent.click(within(serviceRow!).getByRole('button', { name: 'More actions for Service 1' }));
      expect(screen.getByRole('button', { name: 'Update price' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update price' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('15')).toBeInTheDocument();
    });

    expect(screen.getByText('Update price for Service 1')).toBeInTheDocument();

    expect(screen.queryByText('What could restore service')).not.toBeInTheDocument();
    expect(screen.queryByText('Main blockers')).not.toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: /Ledger for Service 1/ })).not.toBeInTheDocument();
  });

  test('asks before closing a dirty service action sheet', async () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    const serviceRow = screen.getByRole('link', { name: 'Service 1' }).closest('div.group');
    expect(serviceRow).not.toBeNull();

    await waitFor(() => {
      fireEvent.click(within(serviceRow!).getByRole('button', { name: 'More actions for Service 1' }));
      expect(screen.getByRole('button', { name: 'Update price' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update price' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('15')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('15'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('18')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(screen.queryByText('Update price for Service 1')).not.toBeInTheDocument();
    });
  });

  test('omits the SKU price action for non-sellable catalog rows', async () => {
    const baseState = inventoryHook();
    inventoryHook.mockReturnValue({
      ...baseState,
      catalog: {
        ...sampleCatalog,
        skus: [
          ...sampleCatalog.skus,
          {
            costPerUnit: 3,
            description: 'Backroom supply',
            leadTimeMeanDaysHint: 7,
            leadTimeStdDaysHint: 2,
            name: 'SKU 2',
            productPrice: null,
            skuId: 'sku-2',
            soldAsProduct: false,
          },
        ],
      },
      snapshot: {
        ...baseState.snapshot,
        skus: [
          ...baseState.snapshot.skus,
          {
            skuId: 'sku-2',
            name: 'SKU 2',
            description: 'Backroom supply',
            unitsInStock: 5,
            costPerUnit: 3,
            soldAsProduct: false,
            productPrice: null,
            leadTimeMeanDays: 7,
            leadTimeStdDays: 2,
          },
        ],
      },
      workspaceSummary: {
        ...baseState.workspaceSummary,
        skuCount: 2,
      },
      loadSenaSkuDetail: vi.fn(async (skuId: string) => ({
        summary: {
          skuId,
          latestPosteriorUnits: skuId === 'sku-2' ? 5 : 9,
          credibleIntervalLow: 4,
          credibleIntervalHigh: 12,
          demandPerDayMean: 2,
          stockoutRisk: 0.4,
          daysOfCover: 4,
          expectedLeadTimeDemand: 8,
          safetyStock: 3,
          reorderPoint: 7,
          reorderTriggerProbability: 0.55,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
          regimeProbabilities: { normal: 1 },
        },
        inventoryPosterior: [],
        demandPosterior: [],
        pipelinePosterior: [],
        leadTimePosterior: [],
      })),
    });

    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');
    await waitFor(() => {
      expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalled();
    });

    const unsellableRow = screen.getByRole('link', { name: 'SKU 2' }).closest('div.group');
    expect(unsellableRow).not.toBeNull();
    fireEvent.click(within(unsellableRow!).getByRole('button', { name: 'More actions for SKU 2' }));
    expect(screen.queryByRole('button', { name: 'Update price' })).not.toBeInTheDocument();
  });

  test('disables catalog service stock mutations when no active bottleneck exists', async () => {
    const baseState = inventoryHook();
    inventoryHook.mockReturnValue({
      ...baseState,
      snapshot: {
        ...baseState.snapshot,
        sist: {
          ...baseState.snapshot.sist,
          highRiskSkuIds: [],
        },
      },
      loadInventorySnapshot: vi.fn(async () => ({
        ...baseState.snapshot,
        sist: {
          ...baseState.snapshot.sist,
          highRiskSkuIds: [],
        },
      })),
      loadSenaServiceDetail: vi.fn(async () => ({
        serviceId: 'service-1',
        activityMean: 3,
        activityIntervalLow: 2,
        activityIntervalHigh: 4,
        bottleneckProbability: 0,
        contributors: [
          {
            skuId: 'sku-1',
            usageProbability: 0.2,
            bottleneckProbability: 0,
          },
        ],
        regimeTimeline: [
          {
            intervalIndex: 0,
            startAt: '2026-04-01T00:00:00Z',
            endAt: '2026-04-01T23:59:00Z',
            dominantRegime: 'normal',
            regimeProbabilities: { normal: 1 },
          },
        ],
      })),
    });

    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    await waitFor(() => {
      const serviceRow = screen.getByRole('link', { name: 'Service 1' }).closest('div.group');
      expect(serviceRow).not.toBeNull();
      fireEvent.click(within(serviceRow!).getByRole('button', { name: 'More actions for Service 1' }));
      const serviceLogReceiptButton = screen.getByRole('button', { name: 'Log receipt' });
      expect(serviceLogReceiptButton).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Record stock' })).toBeDisabled();
    });

    const disabledLogReceiptButton = screen.getByRole('button', { name: 'Log receipt' });
    fireEvent.click(disabledLogReceiptButton.parentElement as HTMLElement);

    await waitFor(() => {
      expect(screen.getByRole('tooltip', { name: 'No linked SKU is limiting this service right now.' })).toBeInTheDocument();
    });
  });

  test('filters the catalog route from the title-card search and toggle pill', async () => {
    const user = userEvent.setup();
    await renderWithProvidersSettled('/catalog', <InventoryRoute />, '/catalog');

    await user.type(screen.getByPlaceholderText('Search name or description…'), 'service-1');

    await waitFor(() => {
      expect(screen.queryByText('SKU 1')).not.toBeInTheDocument();
      expect(screen.getByText('Service 1')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('radio', { name: 'SKUs' }));

    await waitFor(() => {
      expect(screen.queryByText('Service 1')).not.toBeInTheDocument();
      expect(screen.getByText('No matching catalog items')).toBeInTheDocument();
    });
  });

  test('loads SKU detail without snapshot bootstrap', async () => {
    renderWithProviders('/catalog/skus/sku-1', <SkuDetailRoute />, '/catalog/skus/:skuId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for SKU 1/ })).toBeInTheDocument();
    });

    expect(screen.getByText('banji')).toBeInTheDocument();

    expect(inventoryHook().loadSenaSkuDetail).toHaveBeenCalledWith('sku-1', expect.objectContaining({ limit: 5 }));
    expect(inventoryHook().loadInventorySnapshot).not.toHaveBeenCalled();
    expect(screen.getAllByText('Service impact').length).toBeGreaterThan(0);
  });

  test('renders SKU detail even when the legacy snapshot is stale', async () => {
    inventoryHook.mockReturnValue({
      ...inventoryHook(),
      loadInventorySnapshot: vi.fn(async () => ({
        skus: [],
        services: [],
        ranking: [],
        sist: {
          status: { state: 'empty', updatedAt: null, reportCount: 0, confidence: 'low', reason: null },
          settings: { targetServiceLevel: 0.95, forecastHorizonDays: 14, particleCount: 512, smoothingWindowReports: 90 },
          asOf: null,
          topRegime: null,
          pendingReorderCount: 0,
          highRiskSkuIds: [],
          skuInsights: [],
        },
      })),
    });

    renderWithProviders('/catalog/skus/sku-1', <SkuDetailRoute />, '/catalog/skus/:skuId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for SKU 1/ })).toBeInTheDocument();
    });

    expect(screen.getByText('banji')).toBeInTheDocument();

    expect(screen.queryByText('SKU not found')).not.toBeInTheDocument();
  });

  test('renders service detail', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for Service 1/ })).toBeInTheDocument();
    });

    expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalledWith('service-1', expect.objectContaining({ limit: INTERVAL_PAGE_SIZE }));
    expect(screen.getByText('Linked SKU impact')).toBeInTheDocument();
    expect(screen.getByText('Log receipt')).toBeInTheDocument();
    expect(screen.getByText('Record stock')).toBeInTheDocument();
    expect(screen.getByText('Update price')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit service' })).toHaveAttribute('href', '/catalog/services/service-1/edit');
  });

  test('shows the shared service chart controls on the detail ledger', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for Service 1/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Indicators' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recent' })).toBeInTheDocument();
  });

  test('uses semantic status tones for service detail pills', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for Service 1/ })).toBeInTheDocument();
    });

    expect(screen.getAllByText('Main blocker now').length).toBeGreaterThan(0);
  });

  test('hides the sku detail right rail when the global toggle is off', async () => {
    preferenceState.showRightRailCards = false;

    renderWithProviders('/catalog/skus/sku-1', <SkuDetailRoute />, '/catalog/skus/:skuId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for SKU 1/ })).toBeInTheDocument();
    });

    expect(screen.queryByText('Selected period')).not.toBeInTheDocument();
    expect(screen.queryByText('Next step')).not.toBeInTheDocument();
  });

  test('hides the service detail right rail when the global toggle is off', async () => {
    preferenceState.showRightRailCards = false;

    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ledger for Service 1/ })).toBeInTheDocument();
    });

    expect(screen.queryByText('Next step')).not.toBeInTheDocument();
    expect(screen.queryByText('What could restore service')).not.toBeInTheDocument();
    expect(screen.queryByText('Next check')).not.toBeInTheDocument();
  });

  test('opens service receipt sheet with bottleneck SKU context', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByText('Log receipt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Log receipt'));

    await waitFor(() => {
      expect(screen.getByText('Approximate receipt quantity')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('12')).toBeInTheDocument();
  });

  test('submits service price updates through existing observation flows', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByText('Update price')).toBeInTheDocument();
    });

    const context = inventoryHook();
    fireEvent.click(screen.getByText('Update price'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('15')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('15'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and refresh view' }));

    await waitFor(() => {
      expect(context.ingestSenaObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          stockSnapshot: [],
          servicePrices: [{ serviceId: 'service-1', price: 18 }],
        }),
      );
      expect(context.runWorkspacePreparation).toHaveBeenCalledTimes(1);
      expect(context.triggerSenaRun).toHaveBeenCalled();
    });
  });

  test('disables bottleneck SKU mutation buttons when no active bottleneck exists', async () => {
    inventoryHook.mockReturnValue({
      ...inventoryHook(),
      snapshot: {
        ...inventoryHook().snapshot,
        sist: {
          ...inventoryHook().snapshot.sist,
          highRiskSkuIds: [],
        },
      },
      loadInventorySnapshot: vi.fn(async () => ({
        ...inventoryHook().snapshot,
        sist: {
          ...inventoryHook().snapshot.sist,
          highRiskSkuIds: [],
        },
      })),
    });

    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByText('Log receipt')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Log receipt' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record stock' })).toBeDisabled();
  });
});
