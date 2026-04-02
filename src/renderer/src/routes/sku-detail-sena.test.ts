import { describe, expect, test } from 'vitest';
import type { InventorySnapshot } from '@shared/inventory';
import type {
  SenaDiagnostics,
  SenaObservationRecord,
  SenaPipelinePosteriorPoint,
  SenaSkuSummary,
  SenaWorkspaceSummary,
} from '@shared/sena';
import {
  buildFlowDecompositionRows,
  buildHeartbeatModel,
  buildRecommendationModel,
  buildRegimePriceLane,
  deriveSenaCatalog,
  estimateReceiptEtaIso,
  extractSenaEvidence,
  summarizePipelineState,
} from './sku-detail-sena';

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

const summary: SenaSkuSummary = {
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
  regimeProbabilities: {
    spike: 0.55,
    normal: 0.3,
    lull: 0.15,
  },
};

const workspace: SenaWorkspaceSummary = {
  ownerSub: 'desktop-owner',
  runId: 'run-1',
  latestObservedAt: '2026-03-27T09:00:00Z',
  skuCount: 1,
  serviceCount: 1,
  intervalCount: 1,
  pendingReorderCount: 1,
  topRegime: 'spike',
  highRiskSkuIds: ['sku-1'],
  skuSummaries: [summary],
};

const pipeline: SenaPipelinePosteriorPoint = {
  intervalIndex: 0,
  inTransitMean: 3,
  orderProbability: 0.6,
  orderQuantityMean: 5,
  receiptQuantityMean: 4,
  ageDaysMean: 2,
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
      startAt: '2026-03-26T09:00:00Z',
      endAt: '2026-03-27T09:00:00Z',
      dominantRegime: 'spike',
      regimeProbabilities: { spike: 0.55, normal: 0.3, lull: 0.15 },
    },
  ],
};

const observations: SenaObservationRecord[] = [
  {
    observationId: 'obs-1',
    ownerSub: 'desktop-owner',
    input: {
      observedAt: '2026-03-27T09:00:00Z',
      stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 12, costPerUnit: 5, productPrice: 9 }],
      serviceRankings: [],
      retailRankings: ['sku-1'],
      serviceStockouts: [],
      retailStockouts: ['sku-1'],
      orderSignals: [
        {
          skuId: 'sku-1',
          orderPlaced: true,
          receiptArrived: true,
          approximateOrderQuantity: 6,
          approximateReceiptQuantity: 4,
        },
      ],
      servicePrices: [],
      retailPrices: [{ skuId: 'sku-1', price: 10 }],
      leadTimeHints: [{ skuId: 'sku-1', typicalDays: 5, lowDays: 4, highDays: 7, variabilityClass: 'medium' }],
      notes: 'Front shelf was restocked.',
    },
  },
];

describe('sku detail sena helpers', () => {
  test('derives the SENA catalog from the Banji snapshot', () => {
    const catalog = deriveSenaCatalog(snapshot);

    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.skus[0]?.skuId).toBe('sku-1');
    expect(catalog.services[0]?.serviceId).toBe('service-1');
    expect(catalog.sharingMask[0]).toEqual({
      serviceId: 'service-1',
      skuId: 'sku-1',
      enabled: true,
      usageProbability: null,
    });
  });

  test('builds the heartbeat copy from the current summary', () => {
    const heartbeat = buildHeartbeatModel({
      summary,
      latestPriceNow: 10,
      receiptEtaIso: '2026-03-30T09:00:00.000Z',
      language: 'en',
      currency: 'USD',
    });

    expect(heartbeat.headline).toContain('11 posterior units on hand');
    expect(heartbeat.subheadline).toContain('61% reorder trigger');
    expect(heartbeat.subheadline).toContain('ETA 2026-03-30');
    expect(heartbeat.statusLabel).toBe('At risk');
  });

  test('estimates receipt ETA from workspace timestamp, lead time, and pipeline age', () => {
    const eta = estimateReceiptEtaIso({
      workspace,
      pipeline,
      leadTime: {
        intervalIndex: 0,
        logMeanDays: 1,
        logStdDays: 0.2,
        meanDays: 5,
        stdDays: 1.5,
      },
    });

    expect(eta).toBe('2026-03-30T09:00:00.000Z');
  });

  test('derives the recommendation from reorder pressure and risk', () => {
    const recommendation = buildRecommendationModel(summary, pipeline);

    expect(recommendation.title).toBe('Act now');
    expect(recommendation.urgency).toBe('urgent');
  });

  test('shapes the regime and price lane from diagnostics and observations', () => {
    const lane = buildRegimePriceLane(diagnostics, observations, 'sku-1');

    expect(lane.regimes).toHaveLength(1);
    expect(lane.prices).toEqual([{ observedAt: '2026-03-27T09:00:00Z', price: 10 }]);
  });

  test('shapes flow decomposition rows from interval posterior payloads', () => {
    const rows = buildFlowDecompositionRows([
      {
        intervalIndex: 0,
        startAt: '2026-03-26T09:00:00Z',
        endAt: '2026-03-27T09:00:00Z',
        deltaDays: 1,
        serviceDemandMean: 1.2,
        retailDemandMean: 1.1,
        unconstrainedDemandMean: 2.6,
        realizedConsumptionMean: 2.4,
        adjustmentsMean: 0.1,
        receiptsMean: 0.3,
      },
    ]);

    expect(rows[0]).toMatchObject({
      intervalIndex: 0,
      serviceDemandMean: 1.2,
      retailDemandMean: 1.1,
      receiptsMean: 0.3,
      adjustmentsMean: 0.1,
    });
  });

  test('summarizes pipeline state from the aggregate posterior point', () => {
    expect(summarizePipelineState(pipeline)).toEqual({
      inTransitMean: 3,
      orderProbability: 0.6,
      orderQuantityMean: 5,
      receiptQuantityMean: 4,
      ageDaysMean: 2,
    });
  });

  test('extracts evidence entries from SENA observations', () => {
    const evidence = extractSenaEvidence(observations, 'sku-1');

    expect(evidence.map((entry) => entry.type)).toEqual([
      'stock_snapshot',
      'order_placed',
      'receipt_arrived',
      'price_change',
      'stockout_flag',
      'lead_time_hint',
      'note',
    ]);
  });
});
