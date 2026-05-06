import { describe, expect, test } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { derivePerformanceViewModel } from './view-model';

const catalog = {
  schemaVersion: 1,
  bundles: [],
  services: [
    {
      bundle: false,
      description: 'High-demand color package',
      name: 'Hair Coloring',
      price: 42,
      serviceId: 'service-color',
    },
    {
      bundle: false,
      description: 'Core haircut service',
      name: 'Haircut',
      price: 18,
      serviceId: 'service-haircut',
    },
  ],
  sharingMask: [
    { enabled: true, serviceId: 'service-color', skuId: 'sku-shampoo', usageProbability: 1 },
    { enabled: true, serviceId: 'service-haircut', skuId: 'sku-razor', usageProbability: 1 },
  ],
  skus: [
    {
      costPerUnit: 6,
      description: 'Refill cartridge for haircut service',
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'Razor Refill',
      productPrice: 18,
      skuId: 'sku-razor',
      soldAsProduct: true,
    },
    {
      costPerUnit: 5,
      description: 'Retail and color support shampoo',
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
      name: 'Shampoo Classic',
      productPrice: 20,
      skuId: 'sku-shampoo',
      soldAsProduct: true,
    },
  ],
} as const;

const workspaceSummary = {
  highRiskSkuIds: ['sku-razor'],
  intervalCount: 4,
  latestObservedAt: '2026-04-03T08:00:00.000Z',
  ownerSub: 'desktop-owner',
  pendingReorderCount: 1,
  runId: 'run-1',
  serviceCount: 2,
  skuCount: 2,
  skuSummaries: [
    {
      credibleIntervalHigh: 10,
      credibleIntervalLow: 3,
      daysOfCover: 2,
      demandPerDayMean: 4,
      expectedLeadTimeDemand: 12,
      latestPosteriorUnits: 5,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1,
      reorderPoint: 14,
      reorderTriggerProbability: 0.88,
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
      regimeProbabilities: { normal: 0.4, promo: 0.6 },
      safetyStock: 4,
      skuId: 'sku-razor',
      stockoutRisk: 0.82,
    },
    {
      credibleIntervalHigh: 28,
      credibleIntervalLow: 18,
      daysOfCover: 9,
      demandPerDayMean: 1,
      expectedLeadTimeDemand: 6,
      latestPosteriorUnits: 24,
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      reorderPoint: 8,
      reorderTriggerProbability: 0.18,
      regimeProbabilities: { correction: 0.3, normal: 0.7 },
      safetyStock: 2,
      skuId: 'sku-shampoo',
      stockoutRisk: 0.24,
    },
  ],
  topRegime: 'normal',
} as const;

const observations = [
  {
    input: {
      leadTimeHints: [],
      notes: 'Demand softened after a recent shampoo price move.',
      observedAt: '2026-04-02T08:00:00.000Z',
      orderSignals: [],
      retailPrices: [{ price: 18, skuId: 'sku-shampoo' }],
      retailRankings: ['sku-shampoo'],
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
      leadTimeHints: [],
      notes: 'Older demand pulse before the current window tightened.',
      observedAt: '2026-02-15T08:00:00.000Z',
      orderSignals: [{ approximateOrderQuantity: 12, approximateReceiptQuantity: null, orderPlaced: true, receiptArrived: false, skuId: 'sku-razor' }],
      retailPrices: [],
      retailRankings: ['sku-razor'],
      servicePrices: [{ price: 44, serviceId: 'service-color' }],
      serviceRankings: ['service-color'],
      serviceStockouts: [],
      stockSnapshot: [],
      retailStockouts: [],
    },
    observationId: 'obs-2',
    ownerSub: 'desktop-owner',
  },
] as const;

const serviceDetailsById = {
  'service-color': {
    activityIntervalHigh: 8,
    activityIntervalLow: 5,
    activityMean: 6,
    bottleneckProbability: 0.12,
    contributors: [{ bottleneckProbability: 0.12, skuId: 'sku-shampoo', usageProbability: 1 }],
    regimeTimeline: [],
    serviceId: 'service-color',
  },
  'service-haircut': {
    activityIntervalHigh: 8,
    activityIntervalLow: 6,
    activityMean: 7,
    bottleneckProbability: 0.65,
    contributors: [{ bottleneckProbability: 0.65, skuId: 'sku-razor', usageProbability: 1 }],
    regimeTimeline: [],
    serviceId: 'service-haircut',
  },
} as const;

const skuDetailsById = {
  'sku-razor': {
    demandPosterior: [],
    inventoryPosterior: [],
    leadTimePosterior: [],
    pipelinePosterior: [
      {
        ageDaysMean: 6,
        inTransitMean: 16,
        intervalIndex: 2,
        orderProbability: 0.92,
        orderQuantityMean: 16,
        receiptQuantityMean: 16,
      },
    ],
    summary: workspaceSummary.skuSummaries[0],
  },
  'sku-shampoo': {
    demandPosterior: [],
    inventoryPosterior: [],
    leadTimePosterior: [],
    pipelinePosterior: [],
    summary: workspaceSummary.skuSummaries[1],
  },
} as const;

describe('derivePerformanceViewModel', () => {
  test('keeps comparison data quiet when compare mode is off', () => {
    const model = derivePerformanceViewModel({
      catalog,
      compareMode: false,
      currency: 'USD',
      diagnostics: null,
      language: 'en',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      timeRange: '30d',
      workspaceSummary: { ...workspaceSummary },
    });

    expect(model.boardRows.every((row) => row.compareEnabled === false)).toBe(true);
    expect(model.ribbon.find((metric) => metric.key === 'demand')?.trendSignal?.points.length).toBeGreaterThan(0);
    expect(model.boardRows.every((row) => row.demandTrendSignal?.points.length)).toBe(true);
    expect(model.moves.find((row) => row.id === 'sku-razor')?.expectedEffect).toContain('Order 15u');
    expect(model.boardRows.find((row) => row.id === 'sku-razor')?.restockGuidance).toBe('Order 15u');
  });

  test('produces compare text and sorts changed rows to the top when compare mode is on', () => {
    const model = derivePerformanceViewModel({
      catalog,
      compareMode: true,
      currency: 'USD',
      diagnostics: null,
      language: 'en',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      timeRange: '30d',
      workspaceSummary: { ...workspaceSummary },
    });

    expect(model.boardRows.some((row) => row.demandCompareText?.includes('vs prior'))).toBe(true);
    expect(model.boardRows.some((row) => row.statusCompareText != null)).toBe(true);
    expect(model.boardRows.some((row) => row.previousStatusLabel != null && row.previousStatusTone != null)).toBe(true);
    expect(model.ribbon.find((metric) => metric.key === 'demand')?.trendSignal?.splitIndex).toBeGreaterThan(0);
    expect(model.boardRows.some((row) => (row.demandTrendSignal?.splitIndex ?? 0) > 0)).toBe(true);
    expect(model.boardRows[0]?.hasMaterialChange).toBe(true);
    expect(model.boardRows[0]?.changeScore).toBeGreaterThanOrEqual(model.boardRows.at(-1)?.changeScore ?? 0);
  });

  test('uses manually selected previous custom bounds for compare windows', () => {
    const customObservations = [
      {
        input: {
          leadTimeHints: [],
          notes: null,
          observedAt: '2026-01-10T08:00:00.000Z',
          orderSignals: [],
          retailPrices: [],
          retailRankings: ['sku-shampoo'],
          servicePrices: [],
          serviceRankings: ['service-color'],
          serviceStockouts: [],
          stockSnapshot: [],
          retailStockouts: [],
        },
        observationId: 'custom-current',
        ownerSub: 'desktop-owner',
      },
      {
        input: {
          leadTimeHints: [],
          notes: null,
          observedAt: '2025-11-02T08:00:00.000Z',
          orderSignals: [],
          retailPrices: [],
          retailRankings: ['sku-razor'],
          servicePrices: [],
          serviceRankings: ['service-haircut'],
          serviceStockouts: [],
          stockSnapshot: [],
          retailStockouts: [],
        },
        observationId: 'manual-previous',
        ownerSub: 'desktop-owner',
      },
    ];

    const model = derivePerformanceViewModel({
      catalog,
      compareMode: true,
      currency: 'USD',
      diagnostics: null,
      language: 'en',
      observations: customObservations,
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      timeRange: 'custom',
      workspaceSummary: { ...workspaceSummary, latestObservedAt: '2026-01-10T08:00:00.000Z' },
      customRange: {
        startAt: '2026-01-10T00:00:00.000Z',
        endAt: '2026-01-10T23:59:59.999Z',
      },
      previousCustomRange: {
        startAt: '2025-11-01T00:00:00.000Z',
        endAt: '2025-11-03T23:59:59.999Z',
      },
    });

    expect(model.previousWindowLabel).toBe('prior custom period');
    expect(model.ribbon.find((metric) => metric.key === 'demand')?.trendSignal?.splitIndex).toBeGreaterThan(0);
    expect(model.boardRows.some((row) => (row.demandTrendSignal?.splitIndex ?? 0) > 0)).toBe(true);
  });

  test('anchors windows to the latest observation when workspace summary is missing or stale', () => {
    const model = derivePerformanceViewModel({
      catalog,
      compareMode: false,
      currency: 'USD',
      diagnostics: null,
      language: 'en',
      observations: [
        {
          ...observations[1],
          input: { ...observations[1].input, observedAt: '2026-04-01T08:00:00.000Z' },
          observationId: 'older-first',
        },
        {
          ...observations[0],
          input: { ...observations[0].input, observedAt: '2026-04-10T08:00:00.000Z' },
          observationId: 'latest-second',
        },
      ],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      timeRange: '7d',
      workspaceSummary: { ...workspaceSummary, latestObservedAt: '2026-04-02T08:00:00.000Z' },
    });

    expect(model.lastUpdatedLabel).toContain('Apr 10');
    expect(model.confidence.evidenceLabel).toContain('Apr 10');
  });

  test('keeps overdue pipeline summaries working with localized labels', () => {
    const model = derivePerformanceViewModel({
      catalog,
      compareMode: false,
      currency: 'USD',
      diagnostics: null,
      language: 'km',
      observations: [...observations],
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: {
        ...skuDetailsById,
        'sku-razor': {
          ...skuDetailsById['sku-razor'],
          pipelinePosterior: [
            {
              ageDaysMean: 7,
              inTransitMean: 16,
              intervalIndex: 2,
              orderProbability: 0.92,
              orderQuantityMean: 16,
              receiptQuantityMean: 16,
            },
          ],
        },
      },
      timeRange: '30d',
      workspaceSummary: { ...workspaceSummary },
    });

    expect(model.ribbon.find((metric) => metric.key === 'inbound')?.detail).toContain('1');
    expect(model.recoveryPipeline[0]?.detail).toBe(getTranslation('km', 'performanceVmOverdue' as never));
  });
});
