import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
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
    t: (key: string) => getTranslation('en', key as never),
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
      submitLegacyReport: vi.fn(),
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
      loadSenaRunStatus: vi.fn(async () => null),
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

  test('renders the SENA catalog route', () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    expect(screen.getByText('SENA Integrated')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search name, description, or id…')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'SKUs' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByText('SKU 1')).toBeInTheDocument();
    expect(screen.getByText('Service 1')).toBeInTheDocument();
  });

  test('filters the catalog route from the title-card search and toggle pill', () => {
    renderWithProviders('/catalog', <InventoryRoute />, '/catalog');

    fireEvent.change(screen.getByPlaceholderText('Search name, description, or id…'), {
      target: { value: 'service-1' },
    });

    expect(screen.queryByText('SKU 1')).not.toBeInTheDocument();
    expect(screen.getByText('Service 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'SKUs' }));

    expect(screen.queryByText('Service 1')).not.toBeInTheDocument();
    expect(screen.getByText('No matching catalog items')).toBeInTheDocument();
  });

  test('loads SENA SKU detail without snapshot bootstrap', async () => {
    renderWithProviders('/catalog/skus/sku-1', <SkuDetailRoute />, '/catalog/skus/:skuId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Ledger' })).toBeInTheDocument();
    });

    expect(screen.getByText('SENA')).toBeInTheDocument();

    expect(inventoryHook().loadSenaSkuDetail).toHaveBeenCalledWith('sku-1');
    expect(inventoryHook().loadInventorySnapshot).not.toHaveBeenCalled();
    expect(screen.getAllByText('Dependency impact').length).toBeGreaterThan(0);
  });

  test('renders SENA SKU detail even when the legacy snapshot is stale', async () => {
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
      expect(screen.getByRole('heading', { name: 'Ledger' })).toBeInTheDocument();
    });

    expect(screen.getByText('SENA')).toBeInTheDocument();

    expect(screen.queryByText('SKU not found')).not.toBeInTheDocument();
  });

  test('renders SENA service detail', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Service viability ledger' })).toBeInTheDocument();
    });

    expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalledWith('service-1');
    expect(screen.getByText('Dependency impact')).toBeInTheDocument();
    expect(screen.getByText('Log receipt')).toBeInTheDocument();
    expect(screen.getByText('Record stock')).toBeInTheDocument();
    expect(screen.getByText('Update price')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit service' })).toHaveAttribute('href', '/catalog/services/service-1/edit');
  });

  test('hides the sku detail right rail when the global toggle is off', async () => {
    preferenceState.showRightRailCards = false;

    renderWithProviders('/catalog/skus/sku-1', <SkuDetailRoute />, '/catalog/skus/:skuId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Ledger' })).toBeInTheDocument();
    });

    expect(screen.queryByText('Selected interval')).not.toBeInTheDocument();
    expect(screen.queryByText('Act now')).not.toBeInTheDocument();
  });

  test('hides the service detail right rail when the global toggle is off', async () => {
    preferenceState.showRightRailCards = false;

    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Service viability ledger' })).toBeInTheDocument();
    });

    expect(screen.queryByText('Act now')).not.toBeInTheDocument();
    expect(screen.queryByText('Recovery path')).not.toBeInTheDocument();
    expect(screen.queryByText('Next touch')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Save and refresh' }));

    await waitFor(() => {
      expect(context.submitLegacyReport).toHaveBeenCalledWith(
        expect.objectContaining({
          servicePriceAdjustments: [
            expect.objectContaining({
              serviceId: 'service-1',
              price: 18,
              previousPrice: 15,
            }),
          ],
        }),
      );
      expect(context.ingestSenaObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          servicePrices: [{ serviceId: 'service-1', price: 18 }],
        }),
      );
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
