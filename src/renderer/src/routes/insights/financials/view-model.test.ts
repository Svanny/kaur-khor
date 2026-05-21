import { describe, expect, test } from 'vitest';
import type {
  SenaCatalog,
  SenaObservationRecord,
  SenaOrderBatchRecord,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { deriveFinancialsViewModel } from './view-model';

const catalog: SenaCatalog = {
  bundles: [],
  schemaVersion: 1,
  services: [
    {
      archived: false,
      bundle: false,
      description: 'Color service',
      imagePath: null,
      name: 'Hair Coloring',
      price: 42,
      serviceId: 'service-color',
    },
  ],
  sharingMask: [
    { enabled: true, serviceId: 'service-color', skuId: 'sku-shampoo', usageProbability: 1 },
  ],
  skus: [
    {
      archived: false,
      costPerUnit: 5,
      description: 'Retail and service support shampoo',
      imagePath: null,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
      name: 'Shampoo Classic',
      productPrice: 20,
      skuId: 'sku-shampoo',
      soldAsProduct: true,
      supplierName: null,
    },
  ],
};

const workspaceSummary: SenaWorkspaceSummary = {
  highRiskSkuIds: [],
  intervalCount: 2,
  latestObservedAt: '2026-01-10T08:00:00.000Z',
  ownerSub: 'desktop-owner',
  pendingReorderCount: 0,
  runId: 'run-1',
  serviceCount: 1,
  skuCount: 1,
  skuSummaries: [
    {
      credibleIntervalHigh: 18,
      credibleIntervalLow: 12,
      daysOfCover: 8,
      demandPerDayMean: 2,
      expectedLeadTimeDemand: 8,
      latestPosteriorUnits: 16,
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      reorderPoint: 6,
      reorderTriggerProbability: 0.2,
      regimeProbabilities: { normal: 1 },
      safetyStock: 3,
      skuId: 'sku-shampoo',
      stockoutRisk: 0.12,
    },
  ],
  topRegime: 'normal',
};

const serviceDetailsById: Record<string, SenaServiceDetail | null> = {
  'service-color': {
    activityIntervalHigh: 6,
    activityIntervalLow: 4,
    activityMean: 5,
    bottleneckProbability: 0.2,
    contributors: [{ bottleneckProbability: 0.2, skuId: 'sku-shampoo', usageProbability: 1 }],
    regimeTimeline: [],
    serviceId: 'service-color',
  },
};

const skuDetailsById: Record<string, SenaSkuDetail | null> = {
  'sku-shampoo': {
    demandPosterior: [],
    inventoryPosterior: [],
    leadTimePosterior: [],
    pipelinePosterior: [],
    summary: workspaceSummary.skuSummaries[0],
  },
};

function observation(
  observationId: string,
  observedAt: string,
  unitsSold: number,
  unitsInStock = 16,
): SenaObservationRecord {
  return {
    input: {
      adjustmentSignals: [],
      leadTimeHints: [],
      notes: null,
      observedAt,
      orderSignals: [],
      recipeUsageHints: [],
      retailPrices: [],
      retailRankings: ['sku-shampoo'],
      retailSalesSnapshot: [{ skuId: 'sku-shampoo', unitsSold }],
      retailStockouts: [],
      servicePrices: [],
      serviceRankings: ['service-color'],
      serviceSalesSnapshot: [],
      serviceStockouts: [],
      stockSnapshot: [{ costPerUnit: 5, productPrice: 20, skuId: 'sku-shampoo', unitsInStock }],
    },
    observationId,
    ownerSub: 'desktop-owner',
  };
}

function orderBatch(overrides: Partial<SenaOrderBatchRecord['children'][number]['effective']>): SenaOrderBatchRecord {
  return {
    batchOrderId: 'batch-1',
    children: [{
      childOrderId: 'child-1',
      createdAt: '2026-04-09T08:00:00.000Z',
      effective: {
        costPerUnit: 5,
        expectedArrivalAt: '2026-04-12T08:00:00.000Z',
        leadTimeDaysHint: null,
        leadTimeVariability: null,
        orderedQuantity: 10,
        placementTimestamp: '2026-04-09T08:00:00.000Z',
        receivedQuantity: 0,
        receiptTimestamp: null,
        supplierName: null,
        supplierNote: null,
        ...overrides,
      },
      inheritedFromBatch: true,
      overrides: {},
      skuId: 'sku-shampoo',
      status: 'awaiting_receipt',
      updatedAt: '2026-04-09T08:00:00.000Z',
    }],
    createdAt: '2026-04-09T08:00:00.000Z',
    ownerSub: 'desktop-owner',
    shared: {
      costPerUnit: 5,
      expectedArrivalAt: '2026-04-12T08:00:00.000Z',
      leadTimeDaysHint: null,
      leadTimeVariability: null,
      orderedQuantity: 10,
      placementTimestamp: '2026-04-09T08:00:00.000Z',
      receivedQuantity: 0,
      receiptTimestamp: null,
      supplierName: null,
      supplierNote: null,
    },
    status: 'awaiting_receipt',
    supplierName: null,
    updatedAt: '2026-04-09T08:00:00.000Z',
  };
}

describe('deriveFinancialsViewModel', () => {
  test('uses manually selected previous custom bounds for compare windows', () => {
    const model = deriveFinancialsViewModel({
      catalog,
      compareMode: true,
      currency: 'USD',
      diagnostics: null,
      language: 'en',
      observations: [
        observation('custom-current', '2026-01-10T08:00:00.000Z', 1),
        observation('manual-previous', '2025-11-02T08:00:00.000Z', 5),
      ],
      orderBatches: [],
      range: 'custom',
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary },
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
    expect(model.ribbon.find((metric) => metric.key === 'netSales')?.compareLabel).toContain('-$');
    expect(model.ribbon.find((metric) => metric.key === 'netSales')?.compareTone).toBe('warning');
  });

  test('anchors windows to the latest observation when workspace summary is missing or stale', () => {
    const model = deriveFinancialsViewModel({
      catalog,
      compareMode: false,
      currency: 'USD',
      diagnostics: null,
      language: 'en',
      observations: [
        observation('older-first', '2026-04-01T08:00:00.000Z', 1),
        observation('latest-second', '2026-04-10T08:00:00.000Z', 1),
      ],
      orderBatches: [],
      range: '7d',
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary, latestObservedAt: '2026-04-02T08:00:00.000Z' },
      customRange: null,
      previousCustomRange: null,
    });

    expect(model.coverage.freshnessLabel).toContain('Apr 10');
    expect(model.titleMeta.join(' ')).toContain('Apr 10');
  });

  test('ignores invalid workspace summary dates when anchoring windows', () => {
    const model = deriveFinancialsViewModel({
      catalog,
      compareMode: false,
      currency: 'USD',
      diagnostics: null,
      language: 'en',
      observations: [
        observation('older-first', '2026-04-01T08:00:00.000Z', 1),
        observation('latest-second', '2026-04-10T08:00:00.000Z', 1),
      ],
      orderBatches: [],
      range: '7d',
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary, latestObservedAt: 'not-a-date' },
      customRange: null,
      previousCustomRange: null,
    });

    expect(model.coverage.freshnessLabel).toContain('Apr 10');
    expect(model.titleMeta.join(' ')).toContain('Apr 10');
    expect(model.ribbon.find((metric) => metric.key === 'netSales')?.value).toBe('$20.00');
  });

  test('falls back to latest valid observation when custom range end is malformed', () => {
    const model = deriveFinancialsViewModel({
      catalog,
      compareMode: false,
      currency: 'USD',
      diagnostics: null,
      language: 'en',
      observations: [
        observation('dirty', 'not-a-date', 99),
        observation('older-first', '2026-04-01T08:00:00.000Z', 1),
        observation('latest-second', '2026-04-10T08:00:00.000Z', 1),
      ],
      orderBatches: [],
      range: 'custom',
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary, latestObservedAt: 'not-a-date' },
      customRange: {
        startAt: 'bad-start',
        endAt: 'bad-end',
      },
      previousCustomRange: null,
    });

    expect(model.ribbon.find((metric) => metric.key === 'netSales')?.value).toBe('$40.00');
  });

  test('ignores non-finite sales quantities and prices when deriving money totals', () => {
    const dirtyObservation = observation('dirty-money', '2026-04-10T08:00:00.000Z', Number.POSITIVE_INFINITY);
    dirtyObservation.input.retailPrices = [{ skuId: 'sku-shampoo', price: Number.POSITIVE_INFINITY }];
    dirtyObservation.input.serviceSalesSnapshot = [{ serviceId: 'service-color', unitsSold: Number.NaN }];
    dirtyObservation.input.servicePrices = [{ serviceId: 'service-color', price: Number.NaN }];
    dirtyObservation.input.adjustmentSignals = [{ skuId: 'sku-shampoo', quantityDelta: Number.NaN, reason: 'dirty' }];

    const model = deriveFinancialsViewModel({
      catalog,
      compareMode: false,
      currency: 'USD',
      diagnostics: null,
      language: 'en',
      observations: [
        dirtyObservation,
        observation('clean-money', '2026-04-10T09:00:00.000Z', 1),
      ],
      orderBatches: [],
      range: '7d',
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary, latestObservedAt: '2026-04-10T09:00:00.000Z' },
      customRange: null,
      previousCustomRange: null,
    });

    expect(model.ribbon.find((metric) => metric.key === 'netSales')?.value).toBe('$20.00');
    expect(model.ribbon.find((metric) => metric.key === 'grossProfit')?.value).toBe('$15.00');
    expect(model.contributors.find((row) => row.id === 'sku-shampoo')?.netSalesLabel).toBe('$20.00');
    expect(
      model.statement
        .find((section) => section.id === 'money-leaking')
        ?.rows.find((row) => row.key === 'negative-corrections')?.value,
    ).toBe('$0.00');
  });

  test('ignores non-finite and negative supplier commitment quantities', () => {
    const model = deriveFinancialsViewModel({
      catalog,
      compareMode: false,
      currency: 'USD',
      diagnostics: null,
      language: 'en',
      observations: [
        observation('clean-money', '2026-04-10T09:00:00.000Z', 1),
      ],
      orderBatches: [
        orderBatch({
          costPerUnit: Number.NaN,
          orderedQuantity: Number.NaN,
          receivedQuantity: -4,
        }),
        orderBatch({
          costPerUnit: -12,
          orderedQuantity: 6,
          receivedQuantity: 2,
        }),
      ],
      range: '7d',
      scope: 'all',
      serviceDetailsById: { ...serviceDetailsById },
      skuDetailsById: { ...skuDetailsById },
      workspaceSummary: { ...workspaceSummary, latestObservedAt: '2026-04-10T09:00:00.000Z' },
      customRange: null,
      previousCustomRange: null,
    });

    expect(model.ribbon.find((metric) => metric.key === 'openCommitments')?.value).toBe('$20.00');
    expect(
      model.statement
        .find((section) => section.id === 'money-tied-up')
        ?.rows.find((row) => row.key === 'open-orders')
        ?.value,
    ).toBe('$20.00');
  });
});
