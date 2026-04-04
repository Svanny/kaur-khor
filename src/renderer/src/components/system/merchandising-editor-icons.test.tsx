import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { InventorySnapshot, RankingEntry } from '@shared/inventory';
import { MerchandisingEditor } from './merchandising-editor';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    currency: 'USD',
    language: 'en',
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
      if (key === 'rankHeaderName') {
        return 'Name';
      }
      if (key === 'rankHeaderType') {
        return 'Type';
      }
      if (key === 'rankHeaderPrice') {
        return 'Price';
      }
      return key;
    },
  }),
}));

const snapshot: InventorySnapshot = {
  services: [
    {
      serviceId: 'service-1',
      name: 'Market Styling',
      description: 'Service description',
      price: 18,
      skuIds: ['sku-1'],
    },
  ],
  skus: [
    {
      skuId: 'sku-1',
      name: 'Cotton Scarf',
      description: 'SKU description',
      unitsInStock: 8,
      costPerUnit: 4,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1,
    },
  ],
  ranking: [],
  sist: {
    status: { state: 'ready', updatedAt: '2026-04-01T00:00:00Z', reportCount: 1, confidence: 'medium', reason: null },
    settings: { targetServiceLevel: 0.95, forecastHorizonDays: 14, particleCount: 512, smoothingWindowReports: 90 },
    asOf: '2026-04-01T00:00:00Z',
    topRegime: 'normal',
    pendingReorderCount: 0,
    highRiskSkuIds: [],
    skuInsights: [],
  },
};

const entries: RankingEntry[] = [
  { entryType: 'service', entryId: 'service-1', position: 0 },
  { entryType: 'sku', entryId: 'sku-1', position: 1 },
];

describe('MerchandisingEditor icons', () => {
  test('renders the mapped service and sku kind icons', () => {
    const { container } = render(
      <MerchandisingEditor entries={entries} onChange={vi.fn()} snapshot={snapshot} />,
    );

    expect(container.querySelector('.lucide-hand-coins')).not.toBeNull();
    expect(container.querySelector('.lucide-package')).not.toBeNull();
  });
});
