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
});
