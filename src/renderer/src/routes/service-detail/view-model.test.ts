import { describe, expect, test } from 'vitest';
import type { InventorySnapshot, ServiceRecord } from '@shared/inventory';
import type { SenaServiceDetail, SenaWorkspaceSummary } from '@shared/sena';
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
    status: 'ready',
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

describe('deriveServiceDetailViewModel', () => {
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

  test('orders the bottleneck stack with the next likely limiter above safe contributors', () => {
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

    expect(model.rail.bottleneckStack.map((entry) => `${entry.label}:${entry.role}`)).toEqual([
      'Lotus Rib Tank:Next likely blocker',
      'Boardwalk Camp Shirt:Safe support',
      'Tailor Pleat Trouser:Safe support',
    ]);
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
      'Boardwalk Camp Shirt',
      'Tailor Pleat Trouser',
    ]);
  });
});
