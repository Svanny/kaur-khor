import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { InventorySnapshot } from '@shared/inventory';
import { buildDefaultReportRanking, MerchandisingEditor } from './merchandising-editor';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
    showRightRailCards: true,
    t: (key: string) => {
      if (key === 'serviceLabel') {
        return 'Service';
      }
      if (key === 'skuLabel') {
        return 'SKU';
      }
      if (key === 'productRankingTitle') {
        return 'Product ranking';
      }
      if (key === 'rankHeaderRank') {
        return 'Rank';
      }
      if (key === 'rankHeaderPrice') {
        return 'Price';
      }
      return key;
    },
  }),
}));

describe('buildDefaultReportRanking', () => {
  test('excludes unpriced sellable SKUs from the fallback ranking', () => {
    const snapshot: InventorySnapshot = {
      services: [
        {
          serviceId: 'service-1',
          name: 'Market Day Outfit Set',
          description: 'Front-rack outfit bundle',
          price: 1200,
          skuIds: ['sku-1'],
        },
      ],
      skus: [
        {
          skuId: 'sku-1',
          name: 'Bangkok Market Tee',
          description: 'Priced retail tee',
          unitsInStock: 12,
          costPerUnit: 5,
          soldAsProduct: true,
          productPrice: 9,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1.5,
        },
        {
          skuId: 'sku-2',
          name: 'Osaka Pleat Midi',
          description: 'Missing selling price',
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

  test('excludes dirty non-finite product prices from the fallback ranking', () => {
    const snapshot: InventorySnapshot = {
      services: [],
      skus: [
        {
          skuId: 'sku-dirty',
          name: 'Dirty price',
          description: '',
          unitsInStock: 3,
          costPerUnit: 1,
          soldAsProduct: true,
          productPrice: Number.NaN,
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

    expect(buildDefaultReportRanking(snapshot)).toEqual([]);
  });
});

describe('MerchandisingEditor', () => {
  test('uses shared record-update row dividers for ranking tables', () => {
    const snapshot: InventorySnapshot = {
      services: [],
      skus: [
        {
          skuId: 'sku-1',
          name: 'Bangkok Market Tee',
          description: 'Priced retail tee',
          unitsInStock: 12,
          costPerUnit: 5,
          soldAsProduct: true,
          productPrice: 9,
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1.5,
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
    const entries = buildDefaultReportRanking(snapshot);

    render(createElement(MerchandisingEditor, {
      entries,
      snapshot,
      titleLabel: 'Retail SKU ranking',
      onChange: () => {},
    }));

    expect(screen.getAllByText('Item')[0]?.closest('tr')?.className).toContain('border-border/70');
    expect(screen.getByText('Bangkok Market Tee').closest('tr')?.className).toContain('border-border/70');
  });
});
