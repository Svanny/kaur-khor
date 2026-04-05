import { describe, expect, test } from 'vitest';
import type { SenaCatalog, SenaDiagnostics, SenaObservationRecord, SenaServiceDetail, SenaSkuDetail, SenaWorkspaceSummary } from '@shared/sena';
import { deriveAnalysisViewModel } from './analysis-view-model';

const catalog: SenaCatalog = {
  schemaVersion: 1,
  bundles: [],
  services: [
    {
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
      dominantRegime: 'Normal',
      priceCueCount: 1,
      stockoutCueCount: 0,
    });
    expect(model.workbench.regimePriceLane.intervals[1]).toMatchObject({
      dominantRegime: 'Promo',
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
    expect(model.workbench.pipelineLane.markers.map((marker) => marker.kind)).toEqual(['order', 'order', 'receipt']);

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
      dominantRegime: 'Promo',
      priceSignalLabel: 'No price cue',
      leadTimeMeanLabel: '6D',
      leadTimeSpreadLabel: '2D',
    });
    expect(model.intervals[1]?.intervalIndex).toBe(model.workbench.leadTimeLane.points[1]?.intervalIndex);
    expect(model.intervals[1]?.dateLabel).toBe('Apr 3');
  });
});
