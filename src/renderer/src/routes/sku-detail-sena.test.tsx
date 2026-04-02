import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import type { SenaDiagnostics, SenaObservationRecord, SenaSkuDetail, SenaWorkspaceSummary } from '@shared/sena';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { SkuDetailRoute } from './sku-detail';
import { backfillLegacyReportsIntoSenaIfEmpty, mapLegacyReportToSenaObservation, shouldTriggerBootstrapRun } from './sku-detail/bootstrap';
import { hashSenaCatalog, seedSenaCatalogFromSnapshot } from './sku-detail/catalog-seed';
import { deriveRecommendedOrderBand, deriveSenaSkuDetailViewModel, extractEvidence } from './sku-detail/view-model';

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

const snapshot: InventorySnapshot = {
  skus: [
    {
      skuId: 'sku-1',
      name: 'Bangkok Market Tee',
      description: 'Bestselling imported cotton tee',
      unitsInStock: 12,
      costPerUnit: 5,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1.5,
    },
  ],
  services: [
    {
      serviceId: 'service-1',
      name: 'Market Day Outfit Set',
      description: 'Front-rack outfit bundle',
      price: 22,
      skuIds: ['sku-1'],
    },
  ],
  ranking: [],
  sist: {
    status: {
      state: 'ready',
      updatedAt: '2026-03-27T09:00:00Z',
      reportCount: 1,
      confidence: 'medium',
      reason: null,
    },
    settings: {
      targetServiceLevel: 0.95,
      forecastHorizonDays: 14,
      particleCount: 512,
      smoothingWindowReports: 90,
    },
    asOf: '2026-03-27T09:00:00Z',
    topRegime: 'spike',
    pendingReorderCount: 1,
    highRiskSkuIds: ['sku-1'],
    skuInsights: [],
  },
};

const report: StockReport = {
  reportId: 'report-1',
  reportSource: 'manual',
  reportedAt: '2026-03-27T09:00:00Z',
  skuObservations: [
    {
      skuId: 'sku-1',
      unitsInStock: 12,
      costPerUnit: 5,
      productPrice: 10,
      restockIncluded: true,
      retailStockout: true,
    },
  ],
  serviceSignals: [{ serviceId: 'service-1', stockout: true }],
  servicePriceAdjustments: [],
  topServiceRanking: ['service-1'],
  topRetailRanking: ['sku-1'],
  notes: 'Front shelf was restocked.',
};

const observations: SenaObservationRecord[] = [
  {
    observationId: 'obs-1',
    ownerSub: 'desktop-owner',
    input: mapLegacyReportToSenaObservation(report),
  },
  {
    observationId: 'obs-2',
    ownerSub: 'desktop-owner',
    input: {
      ...mapLegacyReportToSenaObservation(report),
      observedAt: '2026-03-29T09:00:00Z',
      orderSignals: [
        {
          skuId: 'sku-1',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 6,
          approximateReceiptQuantity: null,
        },
      ],
      stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 9, costPerUnit: 5, productPrice: 10 }],
    },
  },
];

const detail: SenaSkuDetail = {
  summary: {
    skuId: 'sku-1',
    latestPosteriorUnits: 11,
    credibleIntervalLow: 9,
    credibleIntervalHigh: 13,
    demandPerDayMean: 2.4,
    stockoutRisk: 0.47,
    daysOfCover: 4.2,
    expectedLeadTimeDemand: 12,
    safetyStock: 4,
    reorderPoint: 8,
    reorderTriggerProbability: 0.61,
    leadTimeMeanDays: 5,
    leadTimeStdDays: 1.5,
    regimeProbabilities: { spike: 0.55, normal: 0.3, lull: 0.15 },
  },
  inventoryPosterior: [{ at: '2026-03-29T09:00:00Z', mean: 11, low: 9, high: 13 }],
  demandPosterior: [
    {
      intervalIndex: 0,
      startAt: '2026-03-27T09:00:00Z',
      endAt: '2026-03-29T09:00:00Z',
      deltaDays: 2,
      serviceDemandMean: 1.2,
      retailDemandMean: 1.1,
      unconstrainedDemandMean: 2.6,
      realizedConsumptionMean: 2.4,
      adjustmentsMean: 0.1,
      receiptsMean: 0.3,
    },
  ],
  pipelinePosterior: [
    {
      intervalIndex: 0,
      inTransitMean: 3,
      orderProbability: 0.6,
      orderQuantityMean: 5,
      receiptQuantityMean: 4,
      ageDaysMean: 2,
    },
  ],
  leadTimePosterior: [
    {
      intervalIndex: 0,
      logMeanDays: 1,
      logStdDays: 0.2,
      meanDays: 5,
      stdDays: 1.5,
    },
  ],
};

const diagnostics: SenaDiagnostics = {
  effectiveSampleSizeMean: 82,
  resamplingCount: 2,
  smoothingEnabled: true,
  changePointProbability: 0.22,
  seasonalityActive: false,
  posteriorPredictiveErrorMean: 0.14,
  coverageEstimate: 0.93,
  regimeHistory: [
    {
      intervalIndex: 0,
      startAt: '2026-03-27T09:00:00Z',
      endAt: '2026-03-29T09:00:00Z',
      dominantRegime: 'spike',
      regimeProbabilities: { spike: 0.55, normal: 0.3, lull: 0.15 },
    },
  ],
};

const workspace: SenaWorkspaceSummary = {
  ownerSub: 'desktop-owner',
  runId: 'run-1',
  latestObservedAt: '2026-03-29T09:00:00Z',
  skuCount: 1,
  serviceCount: 1,
  intervalCount: 1,
  pendingReorderCount: 1,
  topRegime: 'spike',
  highRiskSkuIds: ['sku-1'],
  skuSummaries: [detail.summary],
};

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

describe('SKU detail SENA helpers', () => {
  test('seeds and hashes the deterministic SENA catalog from the legacy snapshot', () => {
    const catalog = seedSenaCatalogFromSnapshot(snapshot);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.sharingMask[0]).toEqual({
      serviceId: 'service-1',
      skuId: 'sku-1',
      enabled: true,
      usageProbability: null,
    });
    expect(hashSenaCatalog(catalog)).toMatch(/^catalog-/);
  });

  test('maps legacy reports into SENA observations and backfills once', async () => {
    const ingest = vi.fn(async () => observations[0]);
    const list = vi
      .fn<() => Promise<SenaObservationRecord[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([observations[0]]);

    const mapped = mapLegacyReportToSenaObservation(report);
    expect(mapped.serviceStockouts).toEqual(['service-1']);
    expect(mapped.retailStockouts).toEqual(['sku-1']);
    expect(mapped.orderSignals[0]?.receiptArrived).toBe(true);

    const result = await backfillLegacyReportsIntoSenaIfEmpty({
      reports: [report],
      ingestSenaObservation: ingest,
      listSenaObservations: list,
    });

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(result).toEqual([observations[0]]);
  });

  test('decides when the bootstrap should trigger a v2 run', () => {
    expect(
      shouldTriggerBootstrapRun({
        catalogHash: 'catalog-next',
        cachedCatalogHash: 'catalog-prev',
        detail,
        latestObservationAt: '2026-03-29T09:00:00Z',
        observationCount: 2,
        workspaceSummary: workspace,
      }),
    ).toBe(true);
  });

  test('derives hero and order-band data from the SENA detail payload', () => {
    const model = deriveSenaSkuDetailViewModel({
      currency: 'USD',
      diagnostics,
      observations,
      linkedServiceDetails: [
        {
          serviceId: 'service-1',
          activityMean: 2,
          activityIntervalLow: 1.5,
          activityIntervalHigh: 2.5,
          bottleneckProbability: 0.62,
          contributors: [],
          regimeTimeline: [],
        },
      ],
      selectedIntervalIndex: 0,
      skuId: 'sku-1',
      snapshot,
      detail,
      uiState: 'ready',
      workspaceSummary: workspace,
      language: 'en',
    });

    expect(model.heartbeat.headlineUnits).toContain('11 units likely on hand');
    expect(model.heartbeat.heroSentence).toContain('Reorder trigger');
    expect(model.rail.selectedIntervalSummary.dominantRegime).toBe('spike');
    expect(deriveRecommendedOrderBand(detail)).toEqual({ low: 0, high: 0 });
  });

  test('extracts normalized evidence rows from observations', () => {
    expect(extractEvidence(observations, 'sku-1').map((entry) => entry.type)).toEqual([
      'stock_reported',
      'order_placed',
      'price_changed',
      'retail_stockout',
      'notes',
      'stock_reported',
      'receipt_logged',
      'price_changed',
      'retail_stockout',
      'notes',
    ]);
  });
});

describe('SKU detail route', () => {
  test('renders the onboarding state without the old tab chrome', async () => {
    inventoryHook.mockReturnValue({
      snapshot,
      reports: [report],
      catalog: seedSenaCatalogFromSnapshot(snapshot),
      diagnostics,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: [observations[0]],
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      workspaceSummary: workspace,
      reload: vi.fn(),
      loadInventorySnapshot: vi.fn(async () => snapshot),
      listStockReports: vi.fn(async () => [report]),
      submitLegacyReport: vi.fn(async () => report),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
      loadSenaCatalog: vi.fn(async () => seedSenaCatalogFromSnapshot(snapshot)),
      ingestSenaObservation: vi.fn(async () => observations[0]),
      listSenaObservations: vi.fn(async () => [observations[0]]),
      loadSenaObservations: vi.fn(async () => [observations[0]]),
      triggerSenaRun: vi.fn(),
      retrySenaRun: vi.fn(),
      loadSenaWorkspaceSummary: vi.fn(async () => workspace),
      loadSenaSkuDetail: vi.fn(async () => detail),
      loadSenaServiceDetail: vi.fn(async () => null),
      loadSenaDiagnostics: vi.fn(async () => diagnostics),
      loadSenaRunStatus: vi.fn(async () => null),
      updateSenaMeta: vi.fn(),
    });

    renderWithProviders('/catalog/skus/sku-1', <SkuDetailRoute />, '/catalog/skus/:skuId');

    await waitFor(() => {
      expect(screen.getByText('SENA needs at least two observations')).toBeInTheDocument();
    });

    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    expect(screen.getByText('Record stock')).toBeInTheDocument();
  });
});
