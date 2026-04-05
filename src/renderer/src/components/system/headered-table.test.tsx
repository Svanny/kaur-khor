import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
  createHeaderedTableLayout,
  HeaderedTableCellStack,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
} from './headered-table';

describe('HeaderedTable', () => {
  test('renders the shared shell, header row, and body structure', () => {
    const { container } = render(
      <HeaderedTable>
        <HeaderedTableHeader className="lg:grid lg:grid-cols-2">
          <HeaderedTableHeaderCell>Alpha</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">Beta</HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody>
          <HeaderedTableRow className="grid lg:grid-cols-2">
            <div>Row value</div>
            <div>Second value</div>
          </HeaderedTableRow>
        </HeaderedTableBody>
      </HeaderedTable>,
    );

    expect(container.querySelector('[data-slot="headered-table"]')).not.toBeNull();
    const header = container.querySelector('[data-slot="headered-table-header"]');
    const row = container.querySelector('[data-slot="headered-table-row"]');
    const table = container.querySelector('[data-slot="headered-table"]');
    expect(header).not.toBeNull();
    expect(table).not.toBeNull();
    expect(container.querySelector('[data-slot="headered-table-body"]')).not.toBeNull();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta').className).toContain('text-center');
    expect(table?.getAttribute('data-variant')).toBe('overview');
    expect(table?.className).toContain('rounded-none');
    expect(header?.className).toContain('sm:px-6');
    expect(row?.className).toContain('px-5');
    expect(row?.className).toContain('sm:px-6');
  });

  test('can render a framed table surface when a route opts in', () => {
    const { container } = render(
      <HeaderedTable variant="framed">
        <div>Framed content</div>
      </HeaderedTable>,
    );

    const table = container.querySelector('[data-slot="headered-table"]');
    expect(table?.getAttribute('data-variant')).toBe('framed');
    expect(table?.className).toContain('rounded-[1.4rem]');
    expect(table?.className).toContain('border');
  });

  test('creates one shared layout contract for header, rows, and mobile labels', () => {
    const layout = createHeaderedTableLayout({
      breakpoint: 'lg',
      columns: 'minmax(18rem,1fr) fit-content(9rem)',
      gap: 5,
    });

    expect(layout.containerClassName).toContain('lg:[grid-template-columns:var(--headered-table-columns)]');
    expect(layout.headerClassName).toContain('lg:grid-cols-subgrid');
    expect(layout.bodyClassName).toContain('lg:grid-cols-subgrid');
    expect(layout.rowClassName).toContain('lg:grid-cols-subgrid');
    expect(layout.mobileLabelClassName).toBe('lg:hidden');
    expect(layout.style).toEqual({ '--headered-table-columns': 'minmax(18rem,1fr) fit-content(9rem)' });
  });

  test('renders mobile labels with the shared heading treatment', () => {
    render(
      <HeaderedTable>
        <HeaderedTableBody>
          <HeaderedTableRow>
            <div>
              <HeaderedTableMobileLabel className="xl:hidden">Demand trend</HeaderedTableMobileLabel>
              <span>Stable</span>
            </div>
          </HeaderedTableRow>
        </HeaderedTableBody>
      </HeaderedTable>,
    );

    const mobileLabel = screen.getByText('Demand trend');
    expect(mobileLabel.className).toContain('uppercase');
    expect(mobileLabel.className).toContain('xl:hidden');
  });

  test('passes through a custom data-slot on shared rows', () => {
    const { container } = render(
      <HeaderedTable>
        <HeaderedTableBody>
          <HeaderedTableRow data-slot="custom-row-slot">
            <div>Row value</div>
          </HeaderedTableRow>
        </HeaderedTableBody>
      </HeaderedTable>,
    );

    expect(container.querySelector('[data-slot="custom-row-slot"]')).not.toBeNull();
  });

  test('renders the shared primary and secondary cell rhythm', () => {
    const { container } = render(
      <HeaderedTableCellStack primary="Primary value" secondary="Secondary detail" />,
    );

    expect(screen.getByText('Primary value')).toBeInTheDocument();
    expect(screen.getByText('Secondary detail')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="headered-table-cell-stack"]')).not.toBeNull();
  });

  test('allows routes to provide empty-state content', () => {
    render(
      <HeaderedTable>
        <div>No rows available</div>
      </HeaderedTable>,
    );

    expect(screen.getByText('No rows available')).toBeInTheDocument();
  });
});
