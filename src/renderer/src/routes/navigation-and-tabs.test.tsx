import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { InventoryRoute } from './inventory';
import { ServiceDetailRoute } from './service-detail';
import { SkuDetailRoute } from './sku-detail';
import { NavigationHistoryProvider } from '@/state/navigation-history';

const inventoryHook = vi.fn();

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
    t: (key: string) => key,
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
        contributors: [],
        regimeTimeline: [],
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

    expect(screen.getByText('SENA catalog')).toBeInTheDocument();
    expect(screen.getByText('SKU 1')).toBeInTheDocument();
    expect(screen.getByText('Service 1')).toBeInTheDocument();
  });

  test('loads SENA SKU detail without snapshot bootstrap', async () => {
    renderWithProviders('/catalog/skus/sku-1', <SkuDetailRoute />, '/catalog/skus/:skuId');

    await waitFor(() => {
      expect(screen.getByText('SENA ledger')).toBeInTheDocument();
    });

    expect(inventoryHook().loadSenaSkuDetail).toHaveBeenCalledWith('sku-1');
    expect(screen.getAllByText('Dependency impact').length).toBeGreaterThan(0);
  });

  test('renders SENA service detail', async () => {
    renderWithProviders('/catalog/services/service-1', <ServiceDetailRoute />, '/catalog/services/:serviceId');

    await waitFor(() => {
      expect(screen.getByText('Contributors')).toBeInTheDocument();
    });

    expect(inventoryHook().loadSenaServiceDetail).toHaveBeenCalledWith('service-1');
  });
});
