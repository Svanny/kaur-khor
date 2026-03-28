import { describe, expect, test } from 'vitest';
import type { InventorySnapshot } from '@shared/inventory';
import { buildDefaultReportRanking } from './merchandising-editor';

describe('buildDefaultReportRanking', () => {
  test('excludes unpriced sellable SKUs from the fallback ranking', () => {
    const snapshot: InventorySnapshot = {
      services: [
        {
          serviceId: 'service-1',
          name: 'Service #001',
          description: 'Main service',
          price: 1200,
          skuIds: ['sku-1'],
        },
      ],
      skus: [
        {
          skuId: 'sku-1',
          name: 'SKU #001',
          description: 'Priced retail SKU',
          unitsInStock: 12,
          costPerUnit: 5,
          soldAsProduct: true,
          productPrice: 9,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1.5,
        },
        {
          skuId: 'sku-2',
          name: 'SKU #002',
          description: 'Missing product price',
          unitsInStock: 8,
          costPerUnit: 4,
          soldAsProduct: true,
          productPrice: null,
          leadTimeMeanDays: null,
          leadTimeStdDays: null,
        },
      ],
      ranking: [],
      sist: {
        status: {
          state: 'empty',
          updatedAt: null,
          reportCount: 0,
          confidence: 'low',
          reason: null,
        },
        settings: {
          targetServiceLevel: 0.95,
          forecastHorizonDays: 14,
          particleCount: 512,
          smoothingWindowReports: 90,
        },
        asOf: null,
        topRegime: null,
        pendingReorderCount: 0,
        highRiskSkuIds: [],
        skuInsights: [],
      },
    };

    expect(buildDefaultReportRanking(snapshot)).toEqual([
      { entryType: 'service', entryId: 'service-1', position: 0 },
      { entryType: 'sku', entryId: 'sku-1', position: 1 },
    ]);
  });
});
