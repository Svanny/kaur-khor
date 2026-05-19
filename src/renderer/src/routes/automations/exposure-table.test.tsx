import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import type { AutomationExposureRow } from '@shared/automation';
import { AutomationExposureTable } from './exposure-table';

vi.mock('@/routes/sku-detail/section-heading', () => ({
  SectionLabel: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/system/item-identity', () => ({
  ItemIdentityBlock: ({ name }: { name: ReactNode }) => <div>{name}</div>,
}));

function renderTable(rows: AutomationExposureRow[]) {
  render(
    <MemoryRouter>
      <AutomationExposureTable
        rows={rows}
        onAliasCommit={vi.fn()}
        onToggle={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('AutomationExposureTable', () => {
  test('labels row controls with the sellable name', () => {
    renderTable([
      {
        entityType: 'service',
        entityId: 'service-1',
        label: 'Silk consultation',
        imagePath: null,
        supplierName: null,
        archived: false,
        exposed: true,
        price: 15,
        availabilityStatus: 'available',
        availabilityLabel: 'Available',
        alias: null,
        sortOrder: 0,
      },
    ]);

    expect(screen.getByRole('switch', { name: 'Hide Silk consultation from automation' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Customer-facing alias for Silk consultation' })).toBeInTheDocument();
  });

  test('renders non-finite dirty prices as missing prices', () => {
    renderTable([
      {
        entityType: 'sku',
        entityId: 'sku-dirty',
        label: 'Dirty SKU',
        imagePath: null,
        supplierName: null,
        archived: false,
        exposed: true,
        price: Number.POSITIVE_INFINITY,
        availabilityStatus: 'available',
        availabilityLabel: 'Available',
        alias: null,
        sortOrder: 0,
      },
    ]);

    expect(screen.getByText('No price')).toBeInTheDocument();
    expect(screen.queryByText(/\$Infinity|NaN/)).not.toBeInTheDocument();
  });
});
