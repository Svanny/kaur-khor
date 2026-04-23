import React, { type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import type { SenaDiagnostics, SenaObservationRecord, SenaSkuDetail, SenaWorkspaceSummary } from '@shared/sena';
import { RECENT_TIMEFRAME_MIN_REPORTS } from '@/components/system/chart-timeframe';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { getTranslation } from '@/lib/translations';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { SkuDetailLedgerRoute, SkuDetailRoute } from './sku-detail';
import { buildLeadTimeHintFromInputs } from './sku-detail/actions';
import { SkuDetailEvidence } from './sku-detail/evidence';
import { SkuDetailExposure } from './sku-detail/exposure';
import { formatSenaCompactIntervalDate, formatSenaCompactIntervalDay, formatSenaLongDateTime24 } from './sku-detail/format';
import { ribbonGridClassName } from './sku-detail/hero';
import { SkuDetailLedger } from './sku-detail/ledger';
import {
  buildSparsePolylineSegments,
  classifyWheelIntent,
  deriveAxisContentWidth,
  deriveAnchoredZoomScrollLeft,
  deriveCenteredIntervalScrollLeft,
  deriveLabelGutterOffset,
  deriveSlotCenterX,
  deriveSlotLeftX,
  deriveVisibleWindow,
  isPinchZoomGesture,
  intervalLabelForWidth,
  intervalTooltipLabel,
  responsivePillLabel,
} from './sku-detail/ledger';
import { regimeInitials } from './detail-regime-overlay';
import { bootstrapSkuDetail, shouldTriggerBootstrapRun } from './sku-detail/bootstrap';
import { hashSenaCatalog, seedSenaCatalogFromSnapshot } from './sku-detail/catalog-seed';
import { deriveIntervalPriceMarkers, deriveRecommendedOrderBand, deriveSenaSkuDetailViewModel, extractEvidence, type SenaSkuDetailViewModel } from './sku-detail/view-model';

const inventoryHook = vi.fn();

vi.mock('../state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('../state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
    showRightRailCards: true,
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
      adjustmentDelta: -1,
      approximateOrderQuantity: 8,
      approximateReceiptQuantity: 6,
      notes: 'Cycle count write-off.',
    },
  ],
  serviceSignals: [{ serviceId: 'service-1', stockout: true }],
  servicePriceAdjustments: [],
  topServiceRanking: ['service-1'],
  topRetailRanking: ['sku-1'],
  regimeHint: 'stockout_constrained',
  notes: 'Front shelf was restocked.',
};

function observationInputFromReport(source: StockReport): SenaObservationRecord['input'] {
  return {
    observedAt: source.reportedAt,
    stockSnapshot: source.skuObservations.map((item) => ({
      skuId: item.skuId,
      unitsInStock: item.unitsInStock,
      costPerUnit: item.costPerUnit ?? null,
      productPrice: item.productPrice ?? null,
    })),
    serviceRankings: source.topServiceRanking,
    retailRankings: source.topRetailRanking,
    serviceStockouts: source.serviceSignals
      .filter((signal) => signal.stockout)
      .map((signal) => signal.serviceId),
    retailStockouts: source.skuObservations
      .filter((item) => item.retailStockout)
      .map((item) => item.skuId),
    orderSignals: source.skuObservations.map((item) => ({
      skuId: item.skuId,
      orderPlaced: item.approximateOrderQuantity != null,
      receiptArrived: item.approximateReceiptQuantity != null || Boolean(item.restockIncluded),
      approximateOrderQuantity: item.approximateOrderQuantity ?? null,
      approximateReceiptQuantity: item.approximateReceiptQuantity ?? null,
      receiptTimestamp: item.approximateReceiptQuantity != null ? source.reportedAt : null,
    })),
    servicePrices: source.servicePriceAdjustments.map((item) => ({
      serviceId: item.serviceId,
      price: item.price,
    })),
    retailPrices: source.skuObservations
      .filter((item) => item.productPrice != null)
      .map((item) => ({
        skuId: item.skuId,
        price: item.productPrice!,
      })),
    leadTimeHints: [],
    regimeHint: source.regimeHint ?? null,
    adjustmentSignals: source.skuObservations
      .filter((item) => item.adjustmentDelta != null && item.adjustmentDelta !== 0)
      .map((item) => ({
        skuId: item.skuId,
        quantityDelta: item.adjustmentDelta!,
        reason: item.notes ?? 'manual_adjustment',
      })),
    recipeUsageHints: [],
    notes: source.notes,
  };
}

const observations: SenaObservationRecord[] = [
  {
    observationId: 'obs-1',
    ownerSub: 'desktop-owner',
    input: observationInputFromReport(report),
  },
  {
    observationId: 'obs-2',
    ownerSub: 'desktop-owner',
    input: {
      ...observationInputFromReport(report),
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
      leadTimeHints: [
        {
          skuId: 'sku-1',
          typicalDays: 5,
          lowDays: 4,
          highDays: 6,
          variabilityClass: 'tight',
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
    reorderQuantity: {
      recommendedUnits: 14.2,
      ungatedRecommendedUnits: 14.2,
      likelyRangeLow: 10,
      likelyRangeHigh: 18,
      needProbability: 0.78,
      recommendationIssued: true,
      recommendationQuantile: 0.7,
      intervalLowQuantile: 0.1,
      intervalHighQuantile: 0.9,
      needProbabilityGate: 0.5,
      reviewDelayDays: 0,
    },
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
      observedVariabilityClass: 'tight',
      observedRelativeWidth: 0.4,
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

function sampleCatalogForBootstrap() {
  return seedSenaCatalogFromSnapshot(snapshot);
}

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

function buildLedgerModel(intervalCount: number): SenaSkuDetailViewModel {
  const intervals = Array.from({ length: intervalCount }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return {
      intervalIndex: index,
      startAt: `2026-03-${day}T09:00:00Z`,
      endAt: `2026-03-${day}T21:00:00Z`,
    };
  });

  return {
    identity: {
      skuId: 'sku-ledger',
      name: 'Ledger Test SKU',
      description: 'Test',
      soldAsProduct: true,
      statusLabel: 'Healthy',
      statusTone: 'success',
      topRegime: 'normal',
      legacyFallbackAvailable: false,
    },
    heartbeat: {
      headlineUnits: '12 units likely on hand',
      credibleBandLabel: '10-14 credible band',
      coverLabel: '6d cover',
      reorderLabel: 'reorder trigger 12%',
      pipelineLabel: '1 open order',
      receiptWindowLabel: '2-4 days',
      variabilityLabel: 'Normal variability',
      heroSentence: 'Steady signal',
    },
    ribbon: [],
    selectedInterval: {
      index: intervalCount - 1,
      label: 'Mar 12',
    },
    lanes: {
      regimePriceLane: {
        intervals: intervals.map((interval, index) => ({
          ...interval,
          dominantRegime: index % 4 === 0 ? 'promo' : 'normal',
          regimeProbabilities: index % 4 === 0 ? { promo: 0.7, normal: 0.3 } : { normal: 0.8, lull: 0.2 },
        })),
        priceMarkers: intervals.map((interval, index) => ({
          observedAt: interval.startAt,
          price: 10 + index,
          intervalIndex: interval.intervalIndex,
        })),
        summary: 'Price summary',
        currentPriceLabel: '$19.00',
      },
      inventoryLane: {
        summary: 'Inventory summary',
        points: intervals.map((interval, index) => ({
          at: interval.endAt,
          mean: 20 - index,
          low: 18 - index,
          high: 22 - index,
        })),
        reorderPointLabel: '10',
        safetyStockLabel: '4',
      },
      flowLane: {
        summary: 'Flow summary',
        intervals: intervals.map((interval, index) => ({
          intervalIndex: interval.intervalIndex,
          startAt: interval.startAt,
          endAt: interval.endAt,
          deltaDays: 1,
          serviceDemandMean: 1 + (index % 3),
          retailDemandMean: index % 2,
          unconstrainedDemandMean: 2 + (index % 3),
          realizedConsumptionMean: 1.5 + (index % 2),
          adjustmentsMean: 0,
          receiptsMean: index % 5 === 0 ? 2 : 0,
        })),
      },
      pipelineLane: {
        summary: 'Pipeline summary',
        intervals: intervals.map((interval, index) => ({
          intervalIndex: interval.intervalIndex,
          inTransitMean: index % 4 === 0 ? 3 : 0,
          orderProbability: 0.2,
          orderQuantityMean: index % 4 === 0 ? 4 : 0,
          receiptQuantityMean: index % 5 === 0 ? 2 : 0,
          ageDaysMean: 1 + (index % 3),
        })),
      },
    },
    rail: {
      selectedIntervalSummary: {
        label: 'Mar 12',
        dominantRegime: 'normal',
        serviceDemand: '2',
        retailDemand: '1',
        receipts: '0',
        adjustments: '0',
      },
      actNow: {
        headline: 'Hold',
        quantityBand: '0-0 units',
        rationale: ['Reason 1', 'Reason 2', 'Reason 3'],
      },
      openPipeline: {
        summary: ['0 open orders', '0 in transit', 'No delays', 'Stable'],
        events: [],
      },
      exposure: [],
      nextTouch: {
        dateLabel: 'Tomorrow',
        reason: 'Check stock',
      },
    },
    dependencyImpact: [],
    evidence: [],
    actionContext: {
      currentStock: 12,
      costPerUnit: 5,
      leadTimeVariability: 'normal',
      productPrice: 19,
      latestObservationAt: intervals.at(-1)?.endAt ?? null,
      soldAsProduct: true,
    },
    uiState: 'ready',
  };
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

  test('decides when the bootstrap should trigger a v2 run', () => {
    expect(
      shouldTriggerBootstrapRun({
        detail,
        latestObservationAt: '2026-03-29T09:00:00Z',
        latestRunObservationCount: 1,
        observationCount: 2,
        workspaceSummary: workspace,
      }),
    ).toBe(true);
  });

  test('bootstrap requests explicit preload limits for sku and linked service detail', async () => {
    const inventory = {
      ingestSenaObservation: vi.fn(async () => observations[0]),
      listSenaObservations: vi.fn(async () => observations),
      loadSenaCatalog: vi.fn(async () => sampleCatalogForBootstrap()),
      loadInventorySnapshot: vi.fn(async () => snapshot),
      listStockReports: vi.fn(async () => []),
      loadSenaDiagnostics: vi.fn(async () => diagnostics),
      loadSenaRunStatus: vi.fn(async () => null),
      loadSenaServiceDetail: vi.fn(async () => ({
        serviceId: 'service-1',
        activityMean: 3,
        activityIntervalLow: 2,
        activityIntervalHigh: 4,
        bottleneckProbability: 0.2,
        contributors: [],
        regimeTimeline: [],
      })),
      loadSenaSkuDetail: vi.fn(async () => detail),
      loadSenaWorkspaceSummary: vi.fn(async () => workspace),
      senaMeta: { catalogHash: hashSenaCatalog(sampleCatalogForBootstrap()), lastBootstrapSkuId: null, lastCompletedRunId: null },
      triggerSenaRun: vi.fn(async () => ({ runId: 'run-1' })),
      updateSenaMeta: vi.fn(),
      upsertSenaCatalog: vi.fn(async (catalog) => catalog),
    };

    await bootstrapSkuDetail({ inventory, skuId: 'sku-1' });

    expect(inventory.loadSenaSkuDetail).toHaveBeenCalledWith('sku-1', { limit: RECENT_TIMEFRAME_MIN_REPORTS });
    expect(inventory.loadSenaServiceDetail).toHaveBeenCalledWith('service-1', { limit: INTERVAL_PAGE_SIZE });
  });

  test('falls back from full pill labels to compact labels without ellipsis', () => {
    expect(formatSenaCompactIntervalDate('2026-02-14T09:00:00Z')).toBe('F-14');
    expect(formatSenaCompactIntervalDate('2026-01-01T09:00:00Z')).toBe('J-1');
    expect(formatSenaCompactIntervalDay('2026-02-14T09:00:00Z')).toBe('14');

    expect(intervalLabelForWidth('2026-02-14T09:00:00Z', 11, 120)).toBe('F-14');
    expect(intervalLabelForWidth('2026-02-14T09:00:00Z', 11, 38)).toBe('14');
    expect(intervalLabelForWidth('2026-02-14T09:00:00Z', 11, 20)).toBe('');
    expect(intervalLabelForWidth(null, 11, 42)).toBe('12');
    expect(intervalTooltipLabel('2026-02-14T09:00:00Z', 11, 'en')).toBe(
      formatSenaLongDateTime24('2026-02-14T09:00:00Z', 'en'),
    );
    expect(intervalTooltipLabel(null, 11, 'en')).toBe('Interval 12');

    expect(responsivePillLabel('stockout-constrained', '12', 42)).toBe('12');
    expect(responsivePillLabel('stockout-constrained', '120', 20)).toBe('');
  });

  test('derives the visible interval window from the strip viewport', () => {
    expect(deriveVisibleWindow(30, 0, 480, 48, 8)).toEqual({ start: 0, end: 8 });
    expect(deriveVisibleWindow(30, 560, 480, 48, 8)).toEqual({ start: 10, end: 18 });
    expect(deriveVisibleWindow(30, 1120, 480, 48, 8)).toEqual({ start: 20, end: 28 });
  });

  test('uses pinch gestures for zoom and ignores plain vertical wheel movement', () => {
    expect(classifyWheelIntent(40, 10, { isPinchZoom: false })).toBe('pan');
    expect(classifyWheelIntent(0, 40, { isPinchZoom: false })).toBe('ignore');
    expect(classifyWheelIntent(10, 40, { isPinchZoom: true })).toBe('zoom');
    expect(isPinchZoomGesture({ ctrlKey: true })).toBe(true);
    expect(isPinchZoomGesture({ ctrlKey: false, metaKey: false })).toBe(false);
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

  test('uses one shared axis contract for slot left and center positions', () => {
    expect(
      deriveAxisContentWidth({
        itemCount: 3,
        slotWidth: 72,
        axisStartPadding: 20,
        axisEndPadding: 36,
      }),
    ).toBe(272);
    expect(deriveSlotLeftX({ index: 0, slotWidth: 72, axisStartPadding: 20 })).toBe(20);
    expect(deriveSlotCenterX({ index: 0, slotWidth: 72, axisStartPadding: 20 })).toBe(56);
    expect(deriveSlotCenterX({ index: 2, slotWidth: 72, axisStartPadding: 20 })).toBe(200);
  });

  test('centers selected scroll targeting using the same shared axis padding', () => {
    expect(
      deriveCenteredIntervalScrollLeft({
        contentWidth: 272,
        intervalIndex: 2,
        axisStartPadding: 20,
        slotWidth: 72,
        viewportWidth: 160,
      }),
    ).toBe(112);
  });

  test('keeps label placement inside a reserved top gutter for highest points', () => {
    expect(deriveLabelGutterOffset({ plotY: 0 })).toBe(32);
    expect(deriveLabelGutterOffset({ plotY: 21 })).toBe(92);
  });

  test('compresses regime labels into short pill initials', () => {
    expect(regimeInitials('promo')).toBe('P');
    expect(regimeInitials('spike')).toBe('S');
    expect(regimeInitials('normal')).toBe('N');
    expect(regimeInitials('stockout-constrained')).toBe('SC');
  });

  test('sizes the operational ribbon grid to the rendered metric count', () => {
    expect(ribbonGridClassName(5)).toBe('xl:grid-cols-5');
    expect(ribbonGridClassName(6)).toBe('xl:grid-cols-6');
    expect(ribbonGridClassName(0)).toBe('xl:grid-cols-1');
    expect(ribbonGridClassName(9)).toBe('xl:grid-cols-8');
  });

  test('maps retail price markers to interval slots without drawing an extra regime point', () => {
    const intervalMarkers = deriveIntervalPriceMarkers({
      intervals: [
        {
          intervalIndex: 0,
          startAt: '2026-03-27T00:00:00Z',
          endAt: '2026-03-27T23:59:59Z',
          dominantRegime: 'promo',
          regimeProbabilities: { promo: 1 },
        },
        {
          intervalIndex: 1,
          startAt: '2026-03-28T00:00:00Z',
          endAt: '2026-03-28T23:59:59Z',
          dominantRegime: 'promo',
          regimeProbabilities: { promo: 1 },
        },
      ],
      observations: [
        {
          observationId: 'obs-a',
          ownerSub: 'desktop-owner',
          input: {
            ...observations[0].input,
            observedAt: '2026-03-27T08:00:00Z',
            retailPrices: [{ skuId: 'sku-1', price: 9.5 }],
          },
        },
        {
          observationId: 'obs-b',
          ownerSub: 'desktop-owner',
          input: {
            ...observations[0].input,
            observedAt: '2026-03-27T19:00:00Z',
            retailPrices: [{ skuId: 'sku-1', price: 10 }],
          },
        },
        {
          observationId: 'obs-c',
          ownerSub: 'desktop-owner',
          input: {
            ...observations[0].input,
            observedAt: '2026-03-28T09:00:00Z',
            retailPrices: [{ skuId: 'sku-1', price: 11 }],
          },
        },
      ],
      skuId: 'sku-1',
    });

    expect(intervalMarkers).toEqual([
      { observedAt: '2026-03-27T19:00:00Z', price: 10, intervalIndex: 0 },
      { observedAt: '2026-03-28T09:00:00Z', price: 11, intervalIndex: 1 },
    ]);

    const sparseSeries = buildSparsePolylineSegments(intervalMarkers, [0, 1], 72, 42, {
      topPadding: 6,
      bottomPadding: 6,
    });

    expect(sparseSeries.points).toHaveLength(2);
    expect(sparseSeries.points[0]?.x).toBe(36);
    expect(sparseSeries.points[1]?.x).toBe(108);
    expect(sparseSeries.segments).toHaveLength(1);
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
    expect(model.heartbeat.heroSentence).toContain('reorder signal');
    expect(model.rail.selectedIntervalSummary.dominantRegime).toBe('spike');
    expect(model.rail.actNow.headline).toBe('Reorder now');
    expect(model.rail.actNow.quantityBand).toBe('Recommended order 15 units');
    expect(model.rail.actNow.rationale).toContain('Recommended range 10-18 units');
    expect(deriveRecommendedOrderBand(detail)).toEqual({ low: 0, high: 0 });
  });

  test('keeps a quiet order quantity available when the reorder gate is not triggered', () => {
    const quietDetail: SenaSkuDetail = {
      ...detail,
      summary: {
        ...detail.summary,
        stockoutRisk: 0.18,
        reorderTriggerProbability: 0.24,
        reorderQuantity: {
          ...detail.summary.reorderQuantity!,
          recommendedUnits: 0,
          ungatedRecommendedUnits: 7.2,
          likelyRangeLow: 4,
          likelyRangeHigh: 9,
          needProbability: 0.34,
          recommendationIssued: false,
        },
      },
      pipelinePosterior: [],
    };
    const model = deriveSenaSkuDetailViewModel({
      currency: 'USD',
      diagnostics,
      observations,
      linkedServiceDetails: [],
      selectedIntervalIndex: 0,
      skuId: 'sku-1',
      snapshot,
      detail: quietDetail,
      uiState: 'ready',
      workspaceSummary: workspace,
      language: 'en',
    });

    expect(model.rail.actNow.headline).toBe('Keep watching');
    expect(model.rail.actNow.quantityBand).toBe('No order quantity recommended · optional order 8 units');
    expect(model.actionContext.recommendedOrderQuantity).toBe(8);
    expect(model.actionContext.reorderRecommendation.quietLabel).toBe('Keep watching · optional order 8 units · order likelihood 34%');
  });

  test('gives manual order guidance when no reorder backend field is available', () => {
    const uncachedDetail: SenaSkuDetail = {
      ...detail,
      summary: {
        ...detail.summary,
        stockoutRisk: 0.18,
        reorderPoint: 3,
        reorderTriggerProbability: 0.24,
        reorderQuantity: undefined,
      },
      pipelinePosterior: [],
    };
    const model = deriveSenaSkuDetailViewModel({
      currency: 'USD',
      diagnostics,
      observations,
      linkedServiceDetails: [],
      selectedIntervalIndex: 0,
      skuId: 'sku-1',
      snapshot,
      detail: uncachedDetail,
      uiState: 'ready',
      workspaceSummary: workspace,
      language: 'en',
    });

    expect(model.rail.actNow.quantityBand).toBe('No order quantity recommended');
    expect(model.actionContext.recommendedOrderQuantity).toBe(0);
    expect(model.actionContext.reorderRecommendation.quietLabel).toBe('Recommendation pending · enter quantity manually');
  });

  test('extracts normalized evidence rows from observations', () => {
    expect(extractEvidence(observations, 'sku-1').map((entry) => entry.type)).toEqual([
      'stock_reported',
      'order_placed',
      'price_changed',
      'retail_stockout',
      'lead_time_hint',
      'notes',
      'stock_reported',
      'order_placed',
      'receipt_logged',
      'price_changed',
      'retail_stockout',
      'notes',
    ]);
    expect(extractEvidence(observations, 'sku-1')[4]?.detail).toContain('Tight variability');
  });

  test('includes ticket events in the SKU evidence timeline', () => {
    const ticketedObservations: SenaObservationRecord[] = [
      {
        ...observations[0]!,
        input: {
          ...observations[0]!.input,
          ticketEvents: [
            {
              ticketId: 'supplier-ticket-1',
              ticketFamily: 'supplier',
              eventType: 'created',
              lifecycle: 'open',
              stage: 'ordered_waiting',
              revision: 1,
              occurredAt: '2026-03-27T09:00:00Z',
              lineItems: [
                {
                  entityType: 'sku',
                  entityId: 'sku-1',
                  quantity: 12,
                },
              ],
            },
          ],
        },
      },
    ];

    const evidence = extractEvidence(ticketedObservations, 'sku-1');

    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Supplier order placed',
          detail: '12 units · ordered_waiting',
          type: 'ticket_event',
        }),
      ]),
    );
  });

  test('builds a lead-time hint payload from typical days and ordinal variability', () => {
    const hint = buildLeadTimeHintFromInputs({
      skuId: 'sku-1',
      typicalLeadTimeDays: '5',
      variabilityClass: 'wide',
    });

    expect(hint?.skuId).toBe('sku-1');
    expect(hint?.typicalDays).toBe(5);
    expect(hint?.variabilityClass).toBe('wide');
    expect(hint?.lowDays).toBeCloseTo(2.75);
    expect(hint?.highDays).toBeCloseTo(7.25);
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

  test('renders the TradingView-style chart shell with indicator controls and legend rows', async () => {
    inventoryHook.mockReturnValue({
      snapshot,
      reports: [report],
      catalog: seedSenaCatalogFromSnapshot(snapshot),
      diagnostics,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations,
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      workspaceSummary: workspace,
      reload: vi.fn(),
      loadInventorySnapshot: vi.fn(async () => snapshot),
      listStockReports: vi.fn(async () => [report]),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
      loadSenaCatalog: vi.fn(async () => seedSenaCatalogFromSnapshot(snapshot)),
      ingestSenaObservation: vi.fn(async () => observations[0]),
      listSenaObservations: vi.fn(async () => observations),
      loadSenaObservations: vi.fn(async () => observations),
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

    expect(await screen.findByTestId('sku-trading-chart')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Indicators' }));
    const indicatorsDialog = screen.getByRole('dialog', { name: 'Chart indicators' });
    expect(within(indicatorsDialog).getByText('Inventory')).toBeInTheDocument();
    expect(within(indicatorsDialog).getByText('Stock')).toBeInTheDocument();
    expect(within(indicatorsDialog).getByText('Customer flow')).toBeInTheDocument();
    expect(within(indicatorsDialog).getByText('Supplier flow')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show Customer demand' })).toBeInTheDocument();
    expect(screen.getByText('Expected customer demand across services and retail for each interval.')).toBeInTheDocument();
    const demandLabel = within(indicatorsDialog).getByText('Customer demand');
    const inventoryLabel = within(indicatorsDialog).getByText('Inventory');
    expect(inventoryLabel.compareDocumentPosition(demandLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close indicators' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Inventory color')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Inventory plot style')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Chart intervals')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Chart timeframe')).toBeInTheDocument();
  });

  test('renders reorder point as a color-coded chart legend row', async () => {
    inventoryHook.mockReturnValue({
      snapshot,
      reports: [report],
      catalog: seedSenaCatalogFromSnapshot(snapshot),
      diagnostics,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations,
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      workspaceSummary: workspace,
      reload: vi.fn(),
      loadInventorySnapshot: vi.fn(async () => snapshot),
      listStockReports: vi.fn(async () => [report]),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
      loadSenaCatalog: vi.fn(async () => seedSenaCatalogFromSnapshot(snapshot)),
      ingestSenaObservation: vi.fn(async () => observations[0]),
      listSenaObservations: vi.fn(async () => observations),
      loadSenaObservations: vi.fn(async () => observations),
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

    await screen.findByTestId('sku-trading-chart');
    const legendItem = screen
      .getAllByText('Reorder point')
      .map((label) => label.parentElement)
      .find((entry) => entry?.textContent?.includes('8u'));
    const marker = legendItem?.querySelector('span[aria-hidden="true"]');

    expect(legendItem).not.toBeNull();
    expect(marker).toHaveClass('size-2', 'rounded-full');
    expect(legendItem).toHaveTextContent('8u');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByLabelText('Reorder point color')).toBeInTheDocument();
    expect(screen.getByLabelText('Reorder point plot style')).toBeInTheDocument();
    expect(screen.getByLabelText('Reorder point precision')).toBeInTheDocument();
    expect(screen.getByLabelText('Reorder point labels on price scale')).toBeInTheDocument();
    expect(screen.getByLabelText('Reorder point values in status line')).toBeInTheDocument();
    expect(screen.queryByLabelText('Reorder point inputs in status line')).not.toBeInTheDocument();
  });

  test('calls the timeframe change handler from bottom timeframe buttons', async () => {
    const handleTimeframeChange = vi.fn();
    const LedgerHarness = () => {
      const [selectedIntervalIndex, setSelectedIntervalIndex] = React.useState<number | null>(0);
      return (
        <SkuDetailLedger
          model={buildLedgerModel(12)}
          selectedIntervalIndex={selectedIntervalIndex}
          setSelectedIntervalIndex={setSelectedIntervalIndex}
          onTimeframeChange={handleTimeframeChange}
        />
      );
    };

    render(<LedgerHarness />);

    fireEvent.click(screen.getAllByRole('button', { name: '1M' })[0]!);

    expect(handleTimeframeChange).toHaveBeenCalledWith('1M');
  });

  test.skip('expanded pipeline lane stretches tiles to the full plot height while preserving inset gaps', async () => {
    const resizeCallbacks: Array<() => void> = [];
    const originalResizeObserver = globalThis.ResizeObserver;

    class ResizeObserverMock {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(target: Element) {
        Object.defineProperty(target, 'offsetHeight', {
          configurable: true,
          value: 520,
        });
        resizeCallbacks.push(() => this.callback([], this as unknown as ResizeObserver));
      }

      disconnect() {}
    }

    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    const LedgerHarness = () => {
      const [selectedIntervalIndex, setSelectedIntervalIndex] = React.useState<number | null>(0);
      return <SkuDetailLedger model={buildLedgerModel(12)} selectedIntervalIndex={selectedIntervalIndex} setSelectedIntervalIndex={setSelectedIntervalIndex} />;
    };

    try {
      const { container } = render(<LedgerHarness />);
      const initialPipelineTile = container.querySelector('[data-pipeline-tile="true"]') as HTMLElement | null;

      expect(initialPipelineTile).not.toBeNull();
      const initialTileHeight = Number.parseFloat(initialPipelineTile?.style.height ?? '0');
      const initialTileMarginLeft = Number.parseFloat(initialPipelineTile?.style.marginLeft ?? '0');
      const initialTileMarginRight = Number.parseFloat(initialPipelineTile?.style.marginRight ?? '0');

      resizeCallbacks.forEach((callback) => callback());
      fireEvent.click(screen.getByRole('button', { name: 'Expand Pipeline lane' }));

      await waitFor(() => {
        const expandedPipelineTile = container.querySelector('[data-pipeline-tile="true"]') as HTMLElement | null;

        expect(expandedPipelineTile).not.toBeNull();
        expect(Number.parseFloat(expandedPipelineTile?.style.height ?? '0')).toBeGreaterThan(initialTileHeight);
        expect(Number.parseFloat(expandedPipelineTile?.style.marginLeft ?? '0')).toBe(initialTileMarginLeft);
        expect(Number.parseFloat(expandedPipelineTile?.style.marginRight ?? '0')).toBe(initialTileMarginRight);
      });
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });
});

describe('SKU detail route', () => {
  test('redirects the legacy ledger route into expanded chart state on the sku detail route', async () => {
    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="route-location">{`${location.pathname}${location.search}`}</output>;
    }

    render(
      <MemoryRouter initialEntries={['/catalog/skus/sku-1/ledger?action=log-order']}>
        <Routes>
          <Route element={<SkuDetailLedgerRoute />} path="/catalog/skus/:skuId/ledger" />
          <Route element={<LocationProbe />} path="/catalog/skus/:skuId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('route-location')).toHaveTextContent('/catalog/skus/sku-1?action=log-order&chart=expanded');
  });

  test('keeps ledger expand and collapse on the sku detail route', async () => {
    const storageState = new Map<string, string>();
    const storageMock = {
      getItem(key: string) {
        return storageState.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storageState.set(key, value);
      },
      removeItem(key: string) {
        storageState.delete(key);
      },
      clear() {
        storageState.clear();
      },
    };
    const originalLocalStorage = window.localStorage;
    const originalSessionStorage = window.sessionStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storageMock,
    });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: storageMock,
    });
    const user = userEvent.setup();

    inventoryHook.mockReturnValue({
      snapshot,
      reports: [report],
      catalog: seedSenaCatalogFromSnapshot(snapshot),
      diagnostics,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations,
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      workspaceSummary: workspace,
      reload: vi.fn(),
      loadInventorySnapshot: vi.fn(async () => snapshot),
      listStockReports: vi.fn(async () => [report]),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
      loadSenaCatalog: vi.fn(async () => seedSenaCatalogFromSnapshot(snapshot)),
      ingestSenaObservation: vi.fn(async () => observations[0]),
      listSenaObservations: vi.fn(async () => observations),
      loadSenaObservations: vi.fn(async () => observations),
      triggerSenaRun: vi.fn(),
      retrySenaRun: vi.fn(),
      loadSenaWorkspaceSummary: vi.fn(async () => workspace),
      loadSenaSkuDetail: vi.fn(async () => detail),
      loadSenaServiceDetail: vi.fn(async () => null),
      loadSenaDiagnostics: vi.fn(async () => diagnostics),
      loadSenaRunStatus: vi.fn(async () => null),
      updateSenaMeta: vi.fn(),
    });

    function RouteHarness() {
      const location = useLocation();

      return (
        <>
          <SkuDetailRoute />
          <output data-testid="route-location">{`${location.pathname}${location.search}`}</output>
        </>
      );
    }

    try {
      render(
        <MemoryRouter initialEntries={['/catalog/skus/sku-1']}>
          <NavigationHistoryProvider>
            <Routes>
              <Route element={<RouteHarness />} path="/catalog/skus/:skuId" />
            </Routes>
          </NavigationHistoryProvider>
        </MemoryRouter>,
      );

      expect(await screen.findByTestId('sku-trading-chart')).toBeInTheDocument();
      expect(screen.getByTestId('route-location')).toHaveTextContent('/catalog/skus/sku-1');

      await user.click(screen.getByRole('button', { name: 'Expand chart' }));

      await waitFor(() => {
        expect(screen.getByTestId('route-location')).toHaveTextContent('/catalog/skus/sku-1?chart=expanded');
      });
      expect(screen.getByRole('button', { name: 'Collapse chart' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Collapse chart' }));

      await waitFor(() => {
        expect(screen.getByTestId('route-location')).toHaveTextContent('/catalog/skus/sku-1');
      });
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      });
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: originalSessionStorage,
      });
    }
  });

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
      expect(screen.getByText('banji needs at least two saved updates for this view')).toBeInTheDocument();
    });

    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    expect(screen.getByText('Record stock')).toBeInTheDocument();
  });

  test('renders the log order sheet with banji field primitives and shared select trigger', async () => {
    inventoryHook.mockReturnValue({
      snapshot,
      reports: [report],
      catalog: seedSenaCatalogFromSnapshot(snapshot),
      diagnostics,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations,
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      workspaceSummary: workspace,
      reload: vi.fn(),
      loadInventorySnapshot: vi.fn(async () => snapshot),
      listStockReports: vi.fn(async () => [report]),
      upsertSenaCatalog: vi.fn(async (payload) => payload),
      loadSenaCatalog: vi.fn(async () => seedSenaCatalogFromSnapshot(snapshot)),
      ingestSenaObservation: vi.fn(async () => observations[0]),
      listSenaObservations: vi.fn(async () => observations),
      loadSenaObservations: vi.fn(async () => observations),
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
      expect(screen.getByText('Record stock')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Log order'));

    await waitFor(() => {
      expect(screen.getByText('Approximate order quantity')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('15')).toBeInTheDocument();
    expect(screen.getAllByText('Recommended range 10-18 units. Order likelihood 78%.').length).toBeGreaterThan(0);
    expect(screen.getByRole('combobox', { name: 'Lead time variability' })).toBeInTheDocument();
    expect(document.querySelector('select')).toBeNull();
  });

  test('shows the loading state instead of not-found while a sku detail bootstrap is in flight', async () => {
    let resolveSnapshot: ((value: InventorySnapshot) => void) | null = null;

    inventoryHook.mockReturnValue({
      snapshot: null,
      reports: [],
      catalog: null,
      diagnostics: null,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: [],
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      workspaceSummary: null,
      reload: vi.fn(),
      loadInventorySnapshot: vi.fn(() => new Promise<InventorySnapshot>((resolve) => {
        resolveSnapshot = resolve;
      })),
      listStockReports: vi.fn(async () => [report]),
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

    expect(screen.queryByText('sku-1')).not.toBeInTheDocument();
    expect(screen.queryByText('SKU not found')).not.toBeInTheDocument();

    resolveSnapshot?.(snapshot);
    await waitFor(() => {
      expect(screen.getByText('banji needs at least two saved updates for this view')).toBeInTheDocument();
    });
  });
});
