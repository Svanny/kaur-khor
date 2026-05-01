import { describe, expect, test } from 'vitest';
import type { SenaCatalog, SenaDiagnostics, SenaObservationRecord, SenaServiceDetail, SenaSkuDetail, SenaWorkspaceSummary } from '@shared/sena';
import { deriveAnalysisViewModel, PIPELINE_PILL_END_OFFSET, PIPELINE_PILL_START_OFFSET } from './analysis-view-model';

const catalog: SenaCatalog = {
  schemaVersion: 1,
  bundles: [],
  services: [
    {
      archived: false,
      bundle: false,
      description: 'Signature haircut',
      name: 'Haircut',
      price: 18,
      serviceId: 'service-haircut',
    },
  ],
  sharingMask: [{ enabled: true, serviceId: 'service-haircut', skuId: 'sku-razor', usageProbability: 1 }],
  skus: [
    {
      archived: false,
      costPerUnit: 6,
      description: 'Refill cartridge',
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'Razor Refill',
      productPrice: 18,
      skuId: 'sku-razor',
      soldAsProduct: true,
    },
  ],
};

const workspaceSummary: SenaWorkspaceSummary = {
  highRiskSkuIds: ['sku-razor'],
  intervalCount: 2,
  latestObservedAt: '2026-04-03T08:00:00.000Z',
  ownerSub: 'desktop-owner',
  pendingReorderCount: 1,
  runId: 'run-1',
  serviceCount: 1,
  skuCount: 1,
  skuSummaries: [
    {
      credibleIntervalHigh: 13,
      credibleIntervalLow: 9,
      daysOfCover: 3,
      demandPerDayMean: 4,
      expectedLeadTimeDemand: 12,
      latestPosteriorUnits: 11,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1.5,
      reorderPoint: 14,
      reorderTriggerProbability: 0.68,
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
      regimeProbabilities: { normal: 0.35, promo: 0.65 },
      safetyStock: 4,
      skuId: 'sku-razor',
      stockoutRisk: 0.54,
    },
  ],
  topRegime: 'promo',
};

const diagnostics: SenaDiagnostics = {
  changePointProbability: 0.22,
  coverageEstimate: 0.89,
  effectiveSampleSizeMean: 84,
  posteriorPredictiveErrorMean: 0.18,
  regimeHistory: [
    {
      dominantRegime: 'normal',
      endAt: '2026-03-05T08:00:00.000Z',
      intervalIndex: 0,
      regimeProbabilities: { normal: 0.7, promo: 0.3 },
      startAt: '2026-02-20T08:00:00.000Z',
    },
    {
      dominantRegime: 'promo',
      endAt: '2026-04-03T08:00:00.000Z',
      intervalIndex: 1,
      regimeProbabilities: { normal: 0.25, promo: 0.75 },
      startAt: '2026-03-06T08:00:00.000Z',
    },
  ],
  resamplingCount: 8,
  seasonalityActive: false,
  smoothingEnabled: true,
};

const observations: SenaObservationRecord[] = [
  {
    input: {
      leadTimeHints: [],
      notes: 'Demand softened after a price move.',
      observedAt: '2026-03-01T08:00:00.000Z',
      orderSignals: [{ approximateOrderQuantity: 10, approximateReceiptQuantity: null, orderPlaced: true, receiptArrived: false, skuId: 'sku-razor' }],
      retailPrices: [{ price: 17, skuId: 'sku-razor' }],
      retailRankings: ['sku-razor'],
      servicePrices: [],
      serviceRankings: ['service-haircut'],
      serviceStockouts: [],
      stockSnapshot: [],
      retailStockouts: [],
    },
    observationId: 'obs-1',
    ownerSub: 'desktop-owner',
  },
  {
    input: {
      leadTimeHints: [{ highDays: 8, lowDays: 4, skuId: 'sku-razor', typicalDays: 6, variabilityClass: 'wide' }],
      notes: 'Stockout alert while receipt landed.',
      observedAt: '2026-03-28T08:00:00.000Z',
      orderSignals: [{ approximateOrderQuantity: 0, approximateReceiptQuantity: 8, orderPlaced: false, receiptArrived: true, skuId: 'sku-razor' }],
      retailPrices: [],
      retailRankings: ['sku-razor'],
      servicePrices: [],
      serviceRankings: ['service-haircut'],
      serviceStockouts: [],
      stockSnapshot: [],
      retailStockouts: ['sku-razor'],
    },
    observationId: 'obs-2',
    ownerSub: 'desktop-owner',
  },
];

const serviceDetailsById: Record<string, SenaServiceDetail | null> = {
  'service-haircut': {
    activityIntervalHigh: 8,
    activityIntervalLow: 6,
    activityMean: 7,
    bottleneckProbability: 0.65,
    contributors: [{ bottleneckProbability: 0.65, skuId: 'sku-razor', usageProbability: 1 }],
    regimeTimeline: [],
    serviceId: 'service-haircut',
  },
};

const skuDetailsById: Record<string, SenaSkuDetail | null> = {
  'sku-razor': {
    demandPosterior: [
      {
        adjustmentsMean: -1,
        deltaDays: 14,
        endAt: '2026-03-05T08:00:00.000Z',
        intervalIndex: 0,
        realizedConsumptionMean: 3,
        receiptsMean: 0,
        retailDemandMean: 1,
        serviceDemandMean: 2,
        startAt: '2026-02-20T08:00:00.000Z',
        unconstrainedDemandMean: 3,
      },
      {
        adjustmentsMean: 1,
        deltaDays: 28,
        endAt: '2026-04-03T08:00:00.000Z',
        intervalIndex: 1,
        realizedConsumptionMean: 4,
        receiptsMean: 8,
        retailDemandMean: 1,
        serviceDemandMean: 3,
        startAt: '2026-03-06T08:00:00.000Z',
        unconstrainedDemandMean: 4,
      },
    ],
    inventoryPosterior: [
      { at: '2026-03-05T08:00:00.000Z', high: 14, low: 10, mean: 12 },
      { at: '2026-04-03T08:00:00.000Z', high: 13, low: 9, mean: 11 },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 0,
        logMeanDays: 1.5,
        logStdDays: 0.2,
        meanDays: 5,
        observedRelativeWidth: 0.2,
        observedVariabilityClass: 'tight',
        stdDays: 1,
      },
      {
        intervalIndex: 1,
        logMeanDays: 1.6,
        logStdDays: 0.28,
        meanDays: 6,
        observedRelativeWidth: 0.3,
        observedVariabilityClass: 'wide',
        stdDays: 2,
      },
    ],
    pipelinePosterior: [
      {
        ageDaysMean: 3,
        inTransitMean: 6,
        intervalIndex: 0,
        orderProbability: 0.74,
        orderQuantityMean: 10,
        receiptQuantityMean: 0,
      },
      {
        ageDaysMean: 5,
        inTransitMean: 9,
        intervalIndex: 1,
        orderProbability: 0.86,
        orderQuantityMean: 9,
        receiptQuantityMean: 8,
      },
    ],
    summary: workspaceSummary.skuSummaries[0],
  },
};

describe('deriveAnalysisViewModel', () => {
  test('preserves all hydrated intervals instead of truncating to the latest ten', () => {
    const longDiagnostics: SenaDiagnostics = {
      ...diagnostics,
      regimeHistory: Array.from({ length: 12 }, (_, index) => ({
        dominantRegime: index % 2 === 0 ? 'normal' : 'promo',
        endAt: `2026-04-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
        intervalIndex: index,
        regimeProbabilities: index % 2 === 0 ? { normal: 0.7, promo: 0.3 } : { normal: 0.25, promo: 0.75 },
        startAt: `2026-03-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
      })),
    };
    const longSkuDetailsById: Record<string, SenaSkuDetail | null> = {
      'sku-razor': {
        ...skuDetailsById['sku-razor']!,
        demandPosterior: Array.from({ length: 12 }, (_, index) => ({
          adjustmentsMean: index % 2,
          deltaDays: 7,
          endAt: `2026-04-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
          intervalIndex: index,
          realizedConsumptionMean: 3 + index / 10,
          receiptsMean: index % 3 === 0 ? 2 : 0,
          retailDemandMean: 1,
          serviceDemandMean: 2,
          startAt: `2026-03-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
          unconstrainedDemandMean: 3 + index / 10,
        })),
        inventoryPosterior: Array.from({ length: 12 }, (_, index) => ({
          at: `2026-04-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
          high: 14 + index,
          low: 10 + index,
          mean: 12 + index,
        })),
        leadTimePosterior: Array.from({ length: 12 }, (_, index) => ({
          intervalIndex: index,
          logMeanDays: 1.5,
          logStdDays: 0.2,
          meanDays: 5 + index / 10,
          observedRelativeWidth: 0.2,
          observedVariabilityClass: 'tight',
          stdDays: 1,
        })),
        pipelinePosterior: Array.from({ length: 12 }, (_, index) => ({
          ageDaysMean: 3,
          inTransitMean: 6 + index,
          intervalIndex: index,
          orderProbability: 0.74,
          orderQuantityMean: 10,
          receiptQuantityMean: index % 3 === 0 ? 8 : 0,
        })),
      },
    };

    const model = deriveAnalysisViewModel({
      catalog,
      currency: 'USD',
      diagnostics: longDiagnostics,
      language: 'en',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: longSkuDetailsById,
      workspaceSummary: { ...workspaceSummary, intervalCount: 12 },
    });

    expect(model.intervals).toHaveLength(12);
    expect(model.workbench.regimePriceLane.intervals).toHaveLength(12);
    expect(model.workbench.inventoryDemandLane.points).toHaveLength(12);
  });

  test('bounds workbench intervals to the currently hydrated detail window even when diagnostics are longer', () => {
    const longDiagnostics: SenaDiagnostics = {
      ...diagnostics,
      regimeHistory: Array.from({ length: 40 }, (_, index) => ({
        dominantRegime: index % 2 === 0 ? 'normal' : 'promo',
        endAt: `2026-04-${String((index % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
        intervalIndex: index,
        regimeProbabilities: index % 2 === 0 ? { normal: 0.7, promo: 0.3 } : { normal: 0.25, promo: 0.75 },
        startAt: `2026-03-${String((index % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
      })),
    };
    const pagedSkuDetailsById: Record<string, SenaSkuDetail | null> = {
      'sku-razor': {
        ...skuDetailsById['sku-razor']!,
        demandPosterior: Array.from({ length: 20 }, (_, offset) => {
          const intervalIndex = 20 + offset;
          return {
            adjustmentsMean: offset % 2,
            deltaDays: 7,
            endAt: `2026-04-${String((offset % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
            intervalIndex,
            realizedConsumptionMean: 3 + offset / 10,
            receiptsMean: offset % 3 === 0 ? 2 : 0,
            retailDemandMean: 1,
            serviceDemandMean: 2,
            startAt: `2026-03-${String((offset % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
            unconstrainedDemandMean: 3 + offset / 10,
          };
        }),
        inventoryPosterior: Array.from({ length: 20 }, (_, offset) => ({
          at: `2026-04-${String((offset % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
          high: 34 + offset,
          low: 30 + offset,
          mean: 32 + offset,
        })),
        leadTimePosterior: Array.from({ length: 20 }, (_, offset) => ({
          intervalIndex: 20 + offset,
          logMeanDays: 1.5,
          logStdDays: 0.2,
          meanDays: 5 + offset / 10,
          observedRelativeWidth: 0.2,
          observedVariabilityClass: 'tight',
          stdDays: 1,
        })),
        pipelinePosterior: Array.from({ length: 20 }, (_, offset) => ({
          ageDaysMean: 3,
          inTransitMean: 16 + offset,
          intervalIndex: 20 + offset,
          orderProbability: 0.74,
          orderQuantityMean: 10,
          receiptQuantityMean: offset % 3 === 0 ? 8 : 0,
        })),
      },
    };
    const pagedServiceDetailsById: Record<string, SenaServiceDetail | null> = {
      'service-haircut': {
        ...serviceDetailsById['service-haircut']!,
        regimeTimeline: Array.from({ length: 20 }, (_, offset) => ({
          dominantRegime: offset % 2 === 0 ? 'normal' : 'promo',
          endAt: `2026-04-${String((offset % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
          intervalIndex: 20 + offset,
          regimeProbabilities: offset % 2 === 0 ? { normal: 0.7, promo: 0.3 } : { normal: 0.25, promo: 0.75 },
          startAt: `2026-03-${String((offset % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
        })),
      },
    };

    const model = deriveAnalysisViewModel({
      catalog,
      currency: 'USD',
      diagnostics: longDiagnostics,
      language: 'en',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: pagedServiceDetailsById,
      skuDetailsById: pagedSkuDetailsById,
      workspaceSummary: { ...workspaceSummary, intervalCount: 40 },
    });

    expect(model.intervals).toHaveLength(20);
    expect(model.intervals[0]?.intervalIndex).toBe(20);
    expect(model.intervals.at(-1)?.intervalIndex).toBe(39);
    expect(model.workbench.regimePriceLane.intervals).toHaveLength(20);
    expect(model.workbench.inventoryDemandLane.points).toHaveLength(20);
    expect(model.workbench.leadTimeLane.points).toHaveLength(20);
  });

  test('derives lane-oriented workbench data from the interval aggregates', () => {
    const model = deriveAnalysisViewModel({
      catalog,
      currency: 'USD',
      diagnostics,
      language: 'en',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary },
    });

    expect(model.workbench.regimePriceLane.intervals).toHaveLength(2);
    expect(model.workbench.regimePriceLane.intervals[0]).toMatchObject({
      dominantRegime: 'Normal pattern',
      priceCueCount: 1,
      stockoutCueCount: 0,
    });
    expect(model.workbench.regimePriceLane.intervals[1]).toMatchObject({
      dominantRegime: 'Promotion pattern',
      priceCueCount: 0,
      stockoutCueCount: 1,
    });

    expect(model.workbench.inventoryDemandLane.points[0]).toMatchObject({
      inventoryMean: 12,
      inventoryLow: 10,
      inventoryHigh: 14,
      serviceDemandMean: 2,
      retailDemandMean: 1,
      receiptsMean: 0,
      adjustmentsMean: -1,
    });
    expect(model.workbench.inventoryDemandLane.points[1]?.receiptsMean).toBe(8);

    expect(model.workbench.pipelineLane.spans).toHaveLength(2);
    expect(model.workbench.pipelineLane.markers.map((marker) => marker.kind)).toEqual(['supplier_order', 'supplier_order', 'supplier_receipt']);

    expect(model.workbench.leadTimeLane.points[1]).toMatchObject({
      meanDays: 6,
      lowDays: 4,
      highDays: 8,
      variabilityClass: 'wide',
    });
  });

  test('keeps inspector interval rows aligned with the lane data', () => {
    const model = deriveAnalysisViewModel({
      catalog,
      currency: 'USD',
      diagnostics,
      language: 'en',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary },
    });

    expect(model.intervals[1]).toMatchObject({
      dominantRegime: 'Promotion pattern',
      priceSignalLabel: 'No price cue',
      leadTimeMeanLabel: '6D',
      leadTimeSpreadLabel: '2D',
    });
    expect(model.intervals[1]?.intervalIndex).toBe(model.workbench.leadTimeLane.points[1]?.intervalIndex);
    expect(model.intervals[1]?.dateLabel).toBe('Apr 3');
  });

  test('separates visually overlapping pipeline spans into different rows', () => {
    const model = deriveAnalysisViewModel({
      catalog,
      currency: 'USD',
      diagnostics,
      language: 'en',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary },
    });

    const [firstSpan, secondSpan] = model.workbench.pipelineLane.spans;
    expect(firstSpan).toBeDefined();
    expect(secondSpan).toBeDefined();
    if (!firstSpan || !secondSpan) {
      return;
    }

    const firstVisualEnd = firstSpan.endPosition + PIPELINE_PILL_END_OFFSET;
    const secondVisualStart = secondSpan.startPosition + PIPELINE_PILL_START_OFFSET;
    expect(secondVisualStart).toBeLessThan(firstVisualEnd);
    expect(firstSpan.row).not.toBe(secondSpan.row);
  });

  test('deduplicates overview entity names when multiple entities share the same label', () => {
    const model = deriveAnalysisViewModel({
      catalog: {
        ...catalog,
        skus: [
          ...catalog.skus,
          {
            ...catalog.skus[0],
            skuId: 'sku-razor-2',
          },
        ],
      },
      currency: 'USD',
      diagnostics,
      language: 'en',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: {
        ...skuDetailsById,
        'sku-razor-2': {
          ...skuDetailsById['sku-razor']!,
          summary: {
            ...workspaceSummary.skuSummaries[0],
            skuId: 'sku-razor-2',
          },
        },
      },
      workspaceSummary: {
        ...workspaceSummary,
        skuCount: 2,
        skuSummaries: [
          ...workspaceSummary.skuSummaries,
          {
            ...workspaceSummary.skuSummaries[0],
            skuId: 'sku-razor-2',
          },
        ],
      },
    });

    expect(model.inspectorOverview.affectedEntities.filter((entry) => entry === 'Razor Refill')).toHaveLength(1);
  });

  test('keeps fragility rows for bundle-backed services when they have linked SKUs', () => {
    const model = deriveAnalysisViewModel({
      catalog: {
        ...catalog,
        services: catalog.services.map((service) => ({
          ...service,
          bundle: true,
        })),
      },
      currency: 'USD',
      diagnostics,
      language: 'en',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary },
    });

    expect(model.fragilityRows).toHaveLength(1);
    expect(model.fragilityRows[0]).toMatchObject({
      entityId: 'service-haircut',
      name: 'Haircut',
    });
  });

  test('adds reorder policy labels to SKU entity pressure rows', () => {
    const model = deriveAnalysisViewModel({
      catalog,
      currency: 'USD',
      diagnostics,
      language: 'en',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary },
    });

    expect(model.entityRows.find((row) => row.id === 'sku-razor')?.reorderPolicyLabels).toMatchObject({
      needProbability: '78%',
      recommendedOrder: '15 units',
      likelyRange: '10-18 units',
      policyBasis: 'on hand + in transit',
    });
  });

  test('keeps risk semantics stable when labels are translated to Khmer', () => {
    const model = deriveAnalysisViewModel({
      catalog,
      currency: 'USD',
      diagnostics,
      language: 'km',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary },
    });

    const skuRow = model.entityRows.find((row) => row.id === 'sku-razor');
    expect(skuRow).toMatchObject({
      pipelineRiskLevel: 'high',
      leadTimeRiskLevel: 'low',
      priceSensitivityLevel: 'medium',
      pipelineRiskLabel: 'ខ្ពស់',
      leadTimeRiskLabel: 'ទាប',
      priceSensitivityLabel: 'មធ្យម',
    });
    expect(skuRow?.reorderPolicyLabels?.likelyRange).toBe('10-18 ឯកតា');
  });

  test('deduplicates observation entity labels when the same name appears through multiple ranking channels', () => {
    const model = deriveAnalysisViewModel({
      catalog: {
        ...catalog,
        skus: [
          {
            ...catalog.skus[0],
            name: 'Haircut',
            skuId: 'sku-haircut',
          },
        ],
      },
      currency: 'USD',
      diagnostics,
      language: 'en',
      observations: [
        {
          ...observations[0],
          input: {
            ...observations[0].input,
            retailRankings: ['sku-haircut'],
            serviceRankings: ['service-haircut'],
          },
          observationId: 'obs-duplicate-label',
        },
      ],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: {
        'sku-haircut': {
          ...skuDetailsById['sku-razor']!,
          summary: {
            ...workspaceSummary.skuSummaries[0],
            skuId: 'sku-haircut',
          },
        },
      },
      workspaceSummary: {
        ...workspaceSummary,
        skuSummaries: [
          {
            ...workspaceSummary.skuSummaries[0],
            skuId: 'sku-haircut',
          },
        ],
      },
    });

    expect(model.evidenceRows[0]?.affectedEntityLabels).toEqual(['Haircut']);
  });
});
