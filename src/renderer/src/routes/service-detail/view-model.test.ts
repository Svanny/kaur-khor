import { describe, expect, test } from 'vitest';
import type { InventorySnapshot, ServiceRecord } from '@shared/inventory';
import type { SenaObservationRecord, SenaServiceDetail, SenaWorkspaceSummary } from '@shared/sena';
import { translateRegimeLabel } from '@/lib/localized-display';
import { deriveServiceDetailViewModel } from './view-model';

const service: ServiceRecord = {
  serviceId: 'service-haircut',
  name: 'Haircut',
  description: 'Core haircut service',
  price: 18,
  skuIds: ['sku-razor'],
};

const snapshot: InventorySnapshot = {
  skus: [
    {
      skuId: 'sku-razor',
      name: 'Razor refill',
      description: 'Refill cartridge',
      unitsInStock: 2,
      costPerUnit: 6,
      soldAsProduct: true,
      productPrice: 18,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1,
    },
  ],
  services: [service],
  ranking: [],
  sist: {
    status: {
      confidence: 'high',
      reason: null,
      reportCount: 1,
      state: 'ready',
      updatedAt: '2026-04-03T08:00:00.000Z',
    },
    settings: {} as never,
    asOf: '2026-04-03T08:00:00.000Z',
    topRegime: 'normal',
    pendingReorderCount: 1,
    highRiskSkuIds: ['sku-razor'],
    skuInsights: [],
  },
};

const workspaceSummary: SenaWorkspaceSummary = {
  ownerSub: 'desktop-owner',
  runId: 'run-1',
  latestObservedAt: '2026-04-03T08:00:00.000Z',
  skuCount: 1,
  serviceCount: 1,
  intervalCount: 1,
  pendingReorderCount: 1,
  topRegime: 'normal',
  highRiskSkuIds: ['sku-razor'],
  skuSummaries: [],
};

const detail: SenaServiceDetail = {
  serviceId: 'service-haircut',
  activityMean: 2,
  activityIntervalLow: 1.5,
  activityIntervalHigh: 2.5,
  bottleneckProbability: 0.72,
  contributors: [
    {
      skuId: 'sku-razor',
      usageProbability: 1,
      bottleneckProbability: 0.72,
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
    },
  ],
  regimeTimeline: [],
};

function makeObservation(
  observationId: string,
  observedAt: string,
  orderSignal: SenaObservationRecord['input']['orderSignals'][number],
): SenaObservationRecord {
  return {
    observationId,
    ownerSub: 'desktop-owner',
    input: {
      observedAt,
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [orderSignal],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      adjustmentSignals: [],
      recipeUsageHints: [],
      notes: null,
    },
  };
}

describe('deriveServiceDetailViewModel', () => {
  test('keeps semantic regime keys separate from translated display labels', () => {
    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail: {
        ...detail,
        regimeTimeline: [
          {
            intervalIndex: 0,
            startAt: '2026-04-01T00:00:00Z',
            endAt: '2026-04-01T23:59:00Z',
            dominantRegime: 'promo',
            regimeProbabilities: { promo: 0.8, normal: 0.2 },
          },
        ],
      },
      language: 'en',
      observations: [],
      reports: [],
      service,
      snapshot,
      workspaceSummary,
    });

    expect(model.intervals[0]?.regimeKey).toBe('promo');
    expect(model.intervals[0]?.dominantRegime).toBe(translateRegimeLabel('en', 'promo'));
    expect(model.intervals[0]?.caption).toBe(translateRegimeLabel('en', 'promo'));
  });

  test('ignores malformed observation dates when selecting interval price and sellable snapshots', () => {
    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail: {
        ...detail,
        regimeTimeline: [
          {
            intervalIndex: 0,
            startAt: '2026-04-01T00:00:00Z',
            endAt: '2026-04-05T23:59:00Z',
            dominantRegime: 'normal',
            regimeProbabilities: { normal: 1 },
          },
        ],
      },
      language: 'en',
      observations: [
        {
          observationId: 'dirty-observation',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: 'not-a-date',
            stockSnapshot: [{ skuId: 'sku-razor', unitsInStock: 99, costPerUnit: 6, productPrice: 18 }],
            serviceRankings: [],
            retailRankings: [],
            serviceStockouts: [],
            retailStockouts: [],
            orderSignals: [],
            servicePrices: [{ serviceId: 'service-haircut', price: 99 }],
            retailPrices: [],
            leadTimeHints: [],
            adjustmentSignals: [],
            recipeUsageHints: [],
            notes: null,
          },
        },
        {
          observationId: 'valid-observation',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-03T08:00:00.000Z',
            stockSnapshot: [{ skuId: 'sku-razor', unitsInStock: 7, costPerUnit: 6, productPrice: 18 }],
            serviceRankings: [],
            retailRankings: [],
            serviceStockouts: [],
            retailStockouts: [],
            orderSignals: [],
            servicePrices: [{ serviceId: 'service-haircut', price: 30 }],
            retailPrices: [],
            leadTimeHints: [],
            adjustmentSignals: [],
            recipeUsageHints: [],
            notes: null,
          },
        },
      ],
      reports: [],
      service,
      snapshot,
      workspaceSummary,
    });

    expect(model.intervals[0]?.priceLabel).toBe('$30.00');
    expect(model.intervals[0]?.sellableValue).toBe(7);
  });

  test('ignores dirty numeric interval stock and service prices', () => {
    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail: {
        ...detail,
        activityMean: Number.NaN,
        bottleneckProbability: Number.NaN,
        contributors: [{
          skuId: 'sku-razor',
          usageProbability: Number.NaN,
          bottleneckProbability: Number.NaN,
          reorderQuantity: null,
        }],
        regimeTimeline: [
          {
            intervalIndex: 0,
            startAt: '2026-04-01T00:00:00Z',
            endAt: '2026-04-05T23:59:00Z',
            dominantRegime: 'normal',
            regimeProbabilities: { normal: 1 },
          },
        ],
      },
      language: 'en',
      observations: [
        {
          observationId: 'dirty-observation',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-04T08:00:00.000Z',
            stockSnapshot: [{ skuId: 'sku-razor', unitsInStock: Number.NaN, costPerUnit: 6, productPrice: 18 }],
            serviceRankings: [],
            retailRankings: [],
            serviceStockouts: [],
            retailStockouts: [],
            orderSignals: [],
            servicePrices: [{ serviceId: 'service-haircut', price: Number.NaN }],
            retailPrices: [],
            leadTimeHints: [],
            adjustmentSignals: [],
            recipeUsageHints: [],
            notes: null,
          },
        },
      ],
      reports: [
        {
          reportId: 'dirty-report',
          reportSource: 'manual',
          reportedAt: '2026-04-04T09:00:00.000Z',
          skuObservations: [],
          serviceSignals: [],
          servicePriceAdjustments: [{ serviceId: 'service-haircut', price: Number.POSITIVE_INFINITY }],
          topServiceRanking: [],
          topRetailRanking: [],
          regimeHint: null,
          notes: null,
        },
      ],
      service,
      snapshot,
      workspaceSummary,
    });

    expect(model.intervals[0]).toMatchObject({
      priceLabel: '$18.00',
      priceValue: 18,
      sellableValue: 0,
      sellableLabel: '0',
      tone: 'blocked',
    });
    expect(model.ribbon.find((entry) => entry.key === 'demand-per-day')?.value).toBe('1');
    expect(model.contributors[0]).toMatchObject({
      limitingProbability: 0,
      usageLabel: '0%',
    });
  });

  test('ignores malformed report dates when selecting interval service prices', () => {
    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail: {
        ...detail,
        regimeTimeline: [
          {
            intervalIndex: 0,
            startAt: '2026-04-01T00:00:00Z',
            endAt: '2026-04-05T23:59:00Z',
            dominantRegime: 'normal',
            regimeProbabilities: { normal: 1 },
          },
        ],
      },
      language: 'en',
      observations: [],
      reports: [
        {
          reportId: 'dirty-report',
          reportSource: 'manual',
          reportedAt: 'not-a-date',
          skuObservations: [],
          serviceSignals: [],
          servicePriceAdjustments: [{ serviceId: 'service-haircut', price: 99 }],
          topServiceRanking: [],
          topRetailRanking: [],
          notes: null,
        },
        {
          reportId: 'valid-report',
          reportSource: 'manual',
          reportedAt: '2026-04-03T08:00:00.000Z',
          skuObservations: [],
          serviceSignals: [],
          servicePriceAdjustments: [{ serviceId: 'service-haircut', price: 30 }],
          topServiceRanking: [],
          topRetailRanking: [],
          notes: null,
        },
      ],
      service,
      snapshot,
      workspaceSummary,
    });

    expect(model.intervals[0]?.priceLabel).toBe('$30.00');
  });

  test('ignores malformed workspace summary dates when anchoring service actions', () => {
    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail,
      language: 'en',
      observations: [
        {
          observationId: 'valid-observation',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-03T08:00:00.000Z',
            stockSnapshot: [],
            serviceRankings: [],
            retailRankings: [],
            serviceStockouts: [],
            retailStockouts: [],
            orderSignals: [],
            servicePrices: [],
            retailPrices: [],
            leadTimeHints: [],
            adjustmentSignals: [],
            commercialEvents: [{
              entityId: 'service-haircut',
              entityType: 'service',
              flow: 'scheduled',
              party: 'customer',
              quantityDelta: 2,
              stage: 'pending',
            }],
            recipeUsageHints: [],
            notes: null,
          },
        },
      ],
      reports: [],
      service,
      snapshot,
      workspaceSummary: { ...workspaceSummary, latestObservedAt: 'not-a-date' },
    });

    expect(model.actions.latestObservedAt).toBe('2026-04-03T08:00:00.000Z');
    expect(model.ribbon.find((metric) => metric.key === 'open-orders')?.value).toBe('2');
  });

  test('maps contributor reorder quantity as SKU-scoped restock guidance', () => {
    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail,
      language: 'en',
      observations: [],
      reports: [],
      service,
      snapshot,
      workspaceSummary,
    });

    expect(model.contributors[0]?.restockGuidance).toBe('Razor refill · order 15u');
    expect(model.dependencyImpact[0]?.restockGuidance).toBe('Razor refill · order 15u');
    expect(model.rail.recoveryPath).toContain('Razor refill · order 15u');
  });

  test('localizes compact service recovery labels in Khmer mode', () => {
    const khmerSnapshot: InventorySnapshot = {
      ...snapshot,
      skus: [
        {
          ...snapshot.skus[0],
          name: 'ដាវកោរ',
        },
      ],
    };
    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail,
      language: 'km',
      observations: [
        {
          observationId: 'obs-order',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-03T08:00:00.000Z',
            stockSnapshot: [],
            serviceRankings: [],
            retailRankings: [],
            serviceStockouts: [],
            retailStockouts: [],
            orderSignals: [{
              approximateOrderQuantity: 15,
              approximateReceiptQuantity: null,
              orderPlaced: true,
              receiptArrived: false,
              skuId: 'sku-razor',
            }],
            servicePrices: [],
            retailPrices: [],
            leadTimeHints: [],
            adjustmentSignals: [],
            recipeUsageHints: [],
            notes: null,
          },
        },
      ],
      reports: [],
      service,
      snapshot: khmerSnapshot,
      workspaceSummary,
    });

    const restockGuidance = model.contributors[0]?.restockGuidance ?? '';
    const recoveryPath = model.rail.recoveryPath.join(' ');
    expect(restockGuidance).toContain('បញ្ជាទិញ 15 ឯកតា');
    expect(recoveryPath).toContain('1 ថ្ងៃ');
    expect(/[A-Za-z]/.test(`${restockGuidance} ${recoveryPath}`)).toBe(false);
  });

  test('orders contributor roles from the strongest limiting probability signal', () => {
    const serviceWithThreeLinks: ServiceRecord = {
      ...service,
      skuIds: ['sku-safe-1', 'sku-risk', 'sku-safe-2'],
    };
    const snapshotWithoutActiveBottleneck: InventorySnapshot = {
      ...snapshot,
      skus: [
        {
          skuId: 'sku-safe-1',
          name: 'Boardwalk Camp Shirt',
          description: 'Linked SKU',
          unitsInStock: 70,
          costPerUnit: 10,
          soldAsProduct: true,
          productPrice: 22,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
        },
        {
          skuId: 'sku-risk',
          name: 'Lotus Rib Tank',
          description: 'Linked SKU',
          unitsInStock: 279,
          costPerUnit: 11,
          soldAsProduct: true,
          productPrice: 24,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
        },
        {
          skuId: 'sku-safe-2',
          name: 'Tailor Pleat Trouser',
          description: 'Linked SKU',
          unitsInStock: 518,
          costPerUnit: 12,
          soldAsProduct: true,
          productPrice: 26,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
        },
      ],
      services: [serviceWithThreeLinks],
      sist: {
        ...snapshot.sist,
        highRiskSkuIds: [],
      },
    };

    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail: {
        ...detail,
        serviceId: serviceWithThreeLinks.serviceId,
        bottleneckProbability: 0.2,
        contributors: [
          {
            skuId: 'sku-safe-1',
            usageProbability: 0.65,
            bottleneckProbability: 0,
            reorderQuantity: null,
          },
          {
            skuId: 'sku-risk',
            usageProbability: 0.95,
            bottleneckProbability: 0.2,
            reorderQuantity: null,
          },
          {
            skuId: 'sku-safe-2',
            usageProbability: 0.8,
            bottleneckProbability: 0,
            reorderQuantity: null,
          },
        ],
      },
      language: 'en',
      observations: [],
      reports: [],
      service: serviceWithThreeLinks,
      snapshot: snapshotWithoutActiveBottleneck,
      workspaceSummary: {
        ...workspaceSummary,
        serviceCount: 1,
        skuCount: 3,
        highRiskSkuIds: [],
      },
    });

    expect(model.contributors.map((entry) => `${entry.name}:${entry.roleLabel}:${entry.probabilityLabel}`)).toEqual([
      'Lotus Rib Tank:Main blocker now:20%',
      'Tailor Pleat Trouser:Next likely blocker:0%',
      'Boardwalk Camp Shirt:Safe support:0%',
    ]);

    expect(model.rail.bottleneckStack.map((entry) => `${entry.label}:${entry.role}`)).toEqual([
      'Lotus Rib Tank:Main blocker now',
      'Tailor Pleat Trouser:Next likely blocker',
      'Boardwalk Camp Shirt:Safe support',
    ]);
  });

  test('does not leave a high-pressure contributor labeled as safe support', () => {
    const serviceWithFourLinks: ServiceRecord = {
      ...service,
      skuIds: ['sku-1', 'sku-2', 'sku-3', 'sku-4'],
    };

    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail: {
        ...detail,
        serviceId: serviceWithFourLinks.serviceId,
        contributors: [
          { skuId: 'sku-1', usageProbability: 0.8, bottleneckProbability: 0, reorderQuantity: null },
          { skuId: 'sku-2', usageProbability: 0.5, bottleneckProbability: 0, reorderQuantity: null },
          { skuId: 'sku-3', usageProbability: 0.95, bottleneckProbability: 0, reorderQuantity: null },
          { skuId: 'sku-4', usageProbability: 0.65, bottleneckProbability: 1, reorderQuantity: null },
        ],
      },
      language: 'en',
      observations: [],
      reports: [],
      service: serviceWithFourLinks,
      snapshot: {
        ...snapshot,
        skus: [
          {
            skuId: 'sku-1',
            name: 'Boardwalk Camp Shirt',
            description: 'Linked SKU',
            unitsInStock: 0,
            costPerUnit: 10,
            soldAsProduct: true,
            productPrice: 22,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
          {
            skuId: 'sku-2',
            name: 'Cropped Twill Vest',
            description: 'Linked SKU',
            unitsInStock: 0,
            costPerUnit: 11,
            soldAsProduct: true,
            productPrice: 24,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
          {
            skuId: 'sku-3',
            name: 'Lotus Rib Tank',
            description: 'Linked SKU',
            unitsInStock: 0,
            costPerUnit: 12,
            soldAsProduct: true,
            productPrice: 26,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
          {
            skuId: 'sku-4',
            name: 'Satin Slip Dress',
            description: 'Linked SKU',
            unitsInStock: 0,
            costPerUnit: 13,
            soldAsProduct: true,
            productPrice: 28,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
        ],
        services: [serviceWithFourLinks],
        sist: {
          ...snapshot.sist,
          highRiskSkuIds: [],
        },
      },
      workspaceSummary: {
        ...workspaceSummary,
        serviceCount: 1,
        skuCount: 4,
        highRiskSkuIds: [],
      },
    });

    expect(model.contributors[0]?.name).toBe('Satin Slip Dress');
    expect(model.contributors[0]?.roleLabel).toBe('Main blocker now');
    expect(model.contributors[0]?.probabilityLabel).toBe('100%');
  });

  test('keeps bottleneck ordering stable when contributor labels are translated', () => {
    const serviceWithThreeLinks: ServiceRecord = {
      ...service,
      skuIds: ['sku-safe-1', 'sku-risk', 'sku-safe-2'],
    };

    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail: {
        ...detail,
        serviceId: serviceWithThreeLinks.serviceId,
        bottleneckProbability: 0.2,
        contributors: [
          {
            skuId: 'sku-safe-1',
            usageProbability: 0.65,
            bottleneckProbability: 0,
            reorderQuantity: null,
          },
          {
            skuId: 'sku-risk',
            usageProbability: 0.95,
            bottleneckProbability: 0.2,
            reorderQuantity: null,
          },
          {
            skuId: 'sku-safe-2',
            usageProbability: 0.8,
            bottleneckProbability: 0,
            reorderQuantity: null,
          },
        ],
      },
      language: 'km',
      observations: [],
      reports: [],
      service: serviceWithThreeLinks,
      snapshot: {
        ...snapshot,
        skus: [
          {
            skuId: 'sku-safe-1',
            name: 'Boardwalk Camp Shirt',
            description: 'Linked SKU',
            unitsInStock: 70,
            costPerUnit: 10,
            soldAsProduct: true,
            productPrice: 22,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
          {
            skuId: 'sku-risk',
            name: 'Lotus Rib Tank',
            description: 'Linked SKU',
            unitsInStock: 279,
            costPerUnit: 11,
            soldAsProduct: true,
            productPrice: 24,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
          {
            skuId: 'sku-safe-2',
            name: 'Tailor Pleat Trouser',
            description: 'Linked SKU',
            unitsInStock: 518,
            costPerUnit: 12,
            soldAsProduct: true,
            productPrice: 26,
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
          },
        ],
        services: [serviceWithThreeLinks],
        sist: {
          ...snapshot.sist,
          highRiskSkuIds: [],
        },
      },
      workspaceSummary: {
        ...workspaceSummary,
        serviceCount: 1,
        skuCount: 3,
        highRiskSkuIds: [],
      },
    });

    expect(model.rail.bottleneckStack.map((entry) => entry.label)).toEqual([
      'Lotus Rib Tank',
      'Tailor Pleat Trouser',
      'Boardwalk Camp Shirt',
    ]);
  });

  test('ignores dirty restoration timestamps when deriving open inbound orders', () => {
    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail,
      language: 'en',
      observations: [
        makeObservation('obs-receipt', '2026-04-04T08:00:00.000Z', {
          skuId: 'sku-razor',
          orderPlaced: false,
          receiptArrived: true,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: 4,
        }),
        makeObservation('obs-dirty-order', 'zzzz', {
          skuId: 'sku-razor',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 10,
          approximateReceiptQuantity: null,
        }),
      ],
      reports: [],
      service,
      snapshot,
      workspaceSummary,
    });

    expect(model.restoration.map((event) => event.state)).toEqual(['logged']);
    expect(model.contributors[0]?.inboundLabel).not.toBe('ETA pending');
  });

  test('ignores non-finite contributor lead times when deriving open inbound orders', () => {
    const model = deriveServiceDetailViewModel({
      currency: 'USD',
      detail,
      language: 'en',
      observations: [
        makeObservation('obs-order', '2026-04-04T08:00:00.000Z', {
          skuId: 'sku-razor',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 10,
          approximateReceiptQuantity: null,
        }),
      ],
      reports: [],
      service,
      snapshot: {
        ...snapshot,
        skus: snapshot.skus.map((sku) =>
          sku.skuId === 'sku-razor'
            ? { ...sku, leadTimeMeanDays: Number.POSITIVE_INFINITY }
            : sku,
        ),
      },
      workspaceSummary,
    });

    expect(model.restoration[0]?.state).toBe('open');
    expect(model.restoration[0]?.timingLabel).toBe('Delivery timing pending');
    expect(model.contributors[0]?.inboundLabel).toBe('Delivery timing pending');
  });
});
