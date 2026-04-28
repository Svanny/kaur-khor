import type { SenaCatalog } from '@shared/sena';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { ArchiveRoute } from './archive';

const inventoryHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    language: 'en',
    t: (key: string, variables?: Record<string, string | number | null | undefined>) =>
      getTranslation('en', key as never, variables),
  }),
}));

const catalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [
    {
      archived: true,
      costPerUnit: 4,
      description: 'Archived stock item',
      leadTimeMeanDaysHint: null,
      leadTimeStdDaysHint: null,
      name: 'Archived SKU',
      productPrice: 9,
      skuId: 'sku-1',
      soldAsProduct: true,
      supplierName: null,
    },
  ],
  services: [],
  bundles: [],
  sharingMask: [],
};

describe('ArchiveRoute', () => {
  beforeEach(() => {
    inventoryHook.mockReturnValue({
      catalog,
      isLoading: false,
      isSaving: false,
      unarchiveCatalogEntity: vi.fn(),
    });
  });

  test('renders archive as a settings surface', () => {
    render(
      <MemoryRouter initialEntries={['/operations/archive']}>
        <ArchiveRoute />
      </MemoryRouter>,
    );

    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  test('renders icons inside archive toggle pills', () => {
    render(
      <MemoryRouter initialEntries={['/operations/archive']}>
        <ArchiveRoute />
      </MemoryRouter>,
    );

    expect(screen.getByRole('radio', { name: 'All' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('radio', { name: /SKUs/i }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('radio', { name: /Services/i }).querySelector('svg')).not.toBeNull();
  });
});
