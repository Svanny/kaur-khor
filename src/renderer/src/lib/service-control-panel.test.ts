import type { InventorySnapshot, ServiceRecord, StockReport } from '@shared/inventory';
import { describe, expect, test } from 'vitest';
import { mapServiceTimelineEvents } from './service-control-panel';

const service: ServiceRecord = {
  serviceId: 'service-1',
  name: 'Alteration',
  description: '',
  price: 14,
  skuIds: ['sku-internal-a', 'sku-internal-b'],
};

const snapshot: InventorySnapshot = {
  skus: [
    {
      skuId: 'sku-internal-a',
      name: 'Cotton thread',
      description: '',
      unitsInStock: 10,
      costPerUnit: 1,
      soldAsProduct: true,
      productPrice: 3,
      leadTimeMeanDays: null,
      leadTimeStdDays: null,
    },
    {
      skuId: 'sku-internal-b',
      name: 'Needle pack',
      description: '',
      unitsInStock: 10,
      costPerUnit: 2,
      soldAsProduct: true,
      productPrice: 4,
      leadTimeMeanDays: null,
      leadTimeStdDays: null,
    },
  ],
  services: [service],
  ranking: [],
  sist: {
    status: 'ready',
    settings: {
      targetServiceLevel: 0.95,
      forecastHorizonDays: 30,
      particleCount: 100,
      smoothingWindowReports: 4,
    },
    asOf: null,
    topRegime: null,
    pendingReorderCount: 0,
    highRiskSkuIds: [],
    skuInsights: [],
  },
};

function report(overrides: Partial<StockReport>): StockReport {
  return {
    reportId: 'report',
    reportSource: 'manual',
    reportedAt: '2026-05-07T00:00:00.000Z',
    skuObservations: [],
    serviceSignals: [],
    servicePriceAdjustments: [],
    topServiceRanking: [],
    topRetailRanking: [],
    regimeHint: null,
    notes: null,
    ...overrides,
  };
}

describe('mapServiceTimelineEvents', () => {
  test('uses SKU display names in service recent update summaries instead of internal ids', () => {
    const events = mapServiceTimelineEvents({
      service,
      snapshot,
      currency: 'USD',
      language: 'en',
      reports: [
        report({
          reportId: 'latest',
          reportedAt: '2026-05-07T00:00:00.000Z',
          skuObservations: [
            { skuId: 'sku-internal-a', unitsInStock: 1, costPerUnit: 1 },
            { skuId: 'sku-internal-b', unitsInStock: 8, costPerUnit: 2 },
          ],
        }),
        report({
          reportId: 'previous',
          reportedAt: '2026-05-06T00:00:00.000Z',
          skuObservations: [
            { skuId: 'sku-internal-a', unitsInStock: 8, costPerUnit: 1 },
            { skuId: 'sku-internal-b', unitsInStock: 1, costPerUnit: 2 },
          ],
        }),
      ],
    });

    expect(events[0]?.summary).toBe(
      'Availability changed through Cotton thread · Main blocker changed to Cotton thread',
    );
    expect(events[0]?.summary).not.toContain('sku-internal');
  });
});
