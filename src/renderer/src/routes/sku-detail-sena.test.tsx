import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import type { SenaDiagnostics, SenaObservationRecord, SenaSkuDetail, SenaWorkspaceSummary } from '@shared/sena';
import { getTranslation } from '@/lib/translations';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { SkuDetailRoute } from './sku-detail';
import { SkuDetailEvidence } from './sku-detail/evidence';
import { SkuDetailExposure } from './sku-detail/exposure';
import { formatSenaCompactIntervalDate } from './sku-detail/format';
import {
  classifyWheelIntent,
  deriveAnchoredZoomScrollLeft,
  deriveVisibleWindow,
  intervalLabelForWidth,
  intervalTooltipLabel,
  regimeCompactLabel,
  responsivePillLabel,
} from './sku-detail/ledger';
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
    t: (key: string) => getTranslation('en', key as never),
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

  test('falls back from full pill labels to compact labels without ellipsis', () => {
    expect(formatSenaCompactIntervalDate('2026-02-14T09:00:00Z')).toBe('F-14');
    expect(formatSenaCompactIntervalDate('2026-01-01T09:00:00Z')).toBe('J-1');

    expect(intervalLabelForWidth('2026-02-14T09:00:00Z', 11, 120)).toBe('F-14');
    expect(intervalLabelForWidth('2026-02-14T09:00:00Z', 11, 20)).toBe('');
    expect(intervalLabelForWidth(null, 11, 42)).toBe('12');
    expect(intervalTooltipLabel('2026-02-14T09:00:00Z', 11, 'en')).toBe('Feb 14');
    expect(intervalTooltipLabel(null, 11, 'en')).toBe('Interval 12');

    expect(responsivePillLabel('stockout-constrained', '12', 42)).toBe('12');
    expect(responsivePillLabel('stockout-constrained', '120', 20)).toBe('');
  });

  test('derives the visible interval window from the strip viewport', () => {
    expect(deriveVisibleWindow(30, 0, 480, 48, 8)).toEqual({ start: 0, end: 8 });
    expect(deriveVisibleWindow(30, 560, 480, 48, 8)).toEqual({ start: 10, end: 18 });
    expect(deriveVisibleWindow(30, 1120, 480, 48, 8)).toEqual({ start: 20, end: 28 });
  });

  test('classifies wheel gestures into pan vs zoom', () => {
    expect(classifyWheelIntent(40, 10)).toBe('pan');
    expect(classifyWheelIntent(10, 40)).toBe('zoom');
    expect(classifyWheelIntent(16, 16)).toBe('pan');
  });

  test('anchors zoom to the hovered interval and clamps at the viewport bounds', () => {
    expect(
      deriveAnchoredZoomScrollLeft({
        contentWidth: 2400,
        hoveredPointerX: 180,
        intervalCount: 30,
        nextSlotWidth: 80,
        previousScrollLeft: 320,
        previousSlotWidth: 60,
        viewportWidth: 480,
      }),
    ).toBe(500);

    expect(
      deriveAnchoredZoomScrollLeft({
        contentWidth: 2400,
        hoveredPointerX: 440,
        intervalCount: 30,
        nextSlotWidth: 80,
        previousScrollLeft: 1320,
        previousSlotWidth: 60,
        viewportWidth: 480,
      }),
    ).toBe(1920);
  });

  test('compresses regime labels into short pill initials', () => {
    expect(regimeCompactLabel('promo')).toBe('P');
    expect(regimeCompactLabel('spike')).toBe('S');
    expect(regimeCompactLabel('normal')).toBe('N');
    expect(regimeCompactLabel('stockout-constrained')).toBe('SC');
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
    expect(model.heartbeat.heroSentence).toContain('reorder trigger');
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

  test('pages evidence timeline rows in groups of five', () => {
    const evidence = Array.from({ length: 11 }, (_, index) => ({
      id: `evidence-${index}`,
      observedAt: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      title: `Evidence ${index + 1}`,
      detail: `Detail ${index + 1}`,
      type: 'notes' as const,
    }));

    render(<SkuDetailEvidence evidence={evidence} />);

    expect(screen.getByText('Evidence 1')).toBeInTheDocument();
    expect(screen.getByText('Evidence 5')).toBeInTheDocument();
    expect(screen.queryByText('Evidence 6')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next evidence page'));

    expect(screen.getByText('Evidence 6')).toBeInTheDocument();
    expect(screen.getByText('Evidence 10')).toBeInTheDocument();
    expect(screen.queryByText('Evidence 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Last'));

    expect(screen.getByText('Evidence 11')).toBeInTheDocument();
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByText('First'));

    expect(screen.getByText('Evidence 1')).toBeInTheDocument();
    expect(screen.queryByText('Evidence 11')).not.toBeInTheDocument();
  });

  test('pages dependency impact only when rows overflow the default panel height', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      serviceId: `service-${index}`,
      name: `Service ${index + 1}`,
      severity: 'linked',
      usageProbability: '0.4',
      bottleneckProbability: '12%',
    }));

    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function mockDependencyRect() {
      if ((this as HTMLElement).closest('[data-testid="dependency-impact-list"]')) {
        return {
          bottom: 120,
          height: 120,
          left: 0,
          right: 0,
          top: 0,
          width: 800,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalGetBoundingClientRect.call(this);
    };

    try {
      render(<SkuDetailExposure rows={rows} />);
      const visibleList = within(screen.getByTestId('dependency-impact-list'));

      expect(visibleList.getByText('Service 1')).toBeInTheDocument();
      expect(visibleList.getByText('Service 3')).toBeInTheDocument();
      expect(visibleList.queryByText('Service 4')).not.toBeInTheDocument();
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Next evidence page'));

      expect(visibleList.getByText('Service 4')).toBeInTheDocument();
      expect(visibleList.getByText('Service 5')).toBeInTheDocument();
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
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
