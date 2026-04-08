import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { InventorySnapshot, RankingEntry } from '@shared/inventory';
import { MerchandisingEditor } from './merchandising-editor';

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
      if (key === 'rankHeaderName') {
        return 'Item';
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

    expect(container.querySelector('.lucide-store')).not.toBeNull();
    expect(container.querySelector('.lucide-package')).not.toBeNull();
  });

  test('renders smaller rank movement triangles and keeps price movement triangles unchanged', () => {
    const { container } = render(
      <MerchandisingEditor
        entries={entries}
        onChange={vi.fn()}
        priceChangeByEntryKey={{
          'service:service-1': 'up',
          'sku:sku-1': 'down',
        }}
        rankChangeByEntryKey={{
          'service:service-1': 'up',
          'sku:sku-1': 'down',
        }}
        snapshot={snapshot}
      />,
    );

    const serviceRow = screen.getByText('Market Styling').closest('[role="row"]');
    const skuRow = screen.getByText('Cotton Scarf').closest('[role="row"]');

    expect(serviceRow).not.toBeNull();
    expect(skuRow).not.toBeNull();

    const serviceRankTriangle = serviceRow?.querySelector('.rank-change-triangle');
    const servicePriceTriangle = serviceRow?.querySelector('.price-change-triangle');
    const skuRankTriangle = skuRow?.querySelector('.rank-change-triangle');
    const skuPriceTriangle = skuRow?.querySelector('.price-change-triangle');

    expect(serviceRankTriangle).not.toBeNull();
    expect(serviceRankTriangle).toHaveClass('!size-2', 'text-emerald-600');
    expect(servicePriceTriangle).not.toBeNull();
    expect(servicePriceTriangle).toHaveClass('!size-3', 'text-emerald-600');

    expect(skuRankTriangle).not.toBeNull();
    expect(skuRankTriangle).toHaveClass('!size-2', 'rotate-180', 'text-red-600');
    expect(skuPriceTriangle).not.toBeNull();
    expect(skuPriceTriangle).toHaveClass('!size-3', 'rotate-180', 'text-red-600');

    expect(container.querySelectorAll('.rank-change-triangle')).toHaveLength(2);
    expect(container.querySelectorAll('.price-change-triangle')).toHaveLength(2);
  });

  test('does not render rank movement triangles for unchanged rows', () => {
    const { container } = render(
      <MerchandisingEditor
        entries={entries}
        onChange={vi.fn()}
        rankChangeByEntryKey={{
          'service:service-1': null,
          'sku:sku-1': null,
        }}
        snapshot={snapshot}
      />,
    );

    expect(container.querySelector('.rank-change-triangle')).toBeNull();
  });
});
