import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
  createHeaderedTableLayout,
  hasRenderableRows,
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
    expect(table).toHaveAttribute('data-height-mode', 'content');
    expect(table?.className).toContain('rounded-none');
    expect(table?.className).not.toContain('min-h-full');
    expect(table?.className).not.toContain('flex-1');
    expect(header?.className).toContain('sm:px-6');
    expect(container.querySelector('[data-slot="headered-table-body"]')?.className).toContain('bg-white');
    expect(container.querySelector('[data-slot="headered-table-body"]')?.className).not.toContain('flex-1');
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
    expect(table?.className).not.toContain('min-h-full');
    expect(table?.className).not.toContain('flex-1');
  });

  test('can opt into filling the available pane height', () => {
    const { container } = render(
      <HeaderedTable heightMode="fill">
        <div>Full-height content</div>
      </HeaderedTable>,
    );

    const table = container.querySelector('[data-slot="headered-table"]');
    expect(table).toHaveAttribute('data-height-mode', 'fill');
    expect(table?.className).toContain('min-h-full');
    expect(table?.className).toContain('flex-1');
  });

  test('creates one shared layout contract for header, rows, and mobile labels', () => {
    const layout = createHeaderedTableLayout({
      breakpoint: 'lg',
      columns: 'minmax(18rem,1fr) fit-content(9rem)',
      gap: 5,
    });

    expect(layout.containerClassName).toContain('lg:[grid-template-columns:var(--headered-table-columns)]');
    expect(layout.containerClassName).toContain('bg-white');
    expect(layout.containerClassName).not.toContain('min-h-full');
    expect(layout.containerClassName).not.toContain('flex-1');
    expect(layout.containerClassName).toContain('lg:auto-rows-max');
    expect(layout.containerClassName).toContain('lg:content-start');
    expect(layout.headerClassName).toContain('lg:grid-cols-subgrid');
    expect(layout.headerClassName).toContain('lg:gap-0');
    expect(layout.headerClassName).toContain('lg:[&>*]:px-3.5');
    expect(layout.bodyClassName).toContain('lg:grid-cols-subgrid');
    expect(layout.rowClassName).toContain('lg:grid-cols-subgrid');
    expect(layout.rowClassName).toContain('lg:gap-0');
    expect(layout.rowClassName).toContain('lg:[&>*]:px-3.5');
    expect(layout.mobileLabelClassName).toBe('lg:hidden');
    expect(layout.style).toEqual({ '--headered-table-columns': 'minmax(18rem,1fr) fit-content(9rem)' });
    expect(layout.overflowX).toBe('hidden');
  });

  test('can opt a table layout into horizontal scrolling', () => {
    const layout = createHeaderedTableLayout({
      breakpoint: 'xl',
      columns: '18rem 10rem 18rem',
      gap: 4,
      overflowX: 'auto',
    });
    const { container } = render(
      <HeaderedTable className={layout.containerClassName} overflowX={layout.overflowX}>
        <HeaderedTableBody>
          <HeaderedTableRow className={layout.rowClassName}>
            <div>Scrollable row</div>
          </HeaderedTableRow>
        </HeaderedTableBody>
      </HeaderedTable>,
    );

    const table = container.querySelector('[data-slot="headered-table"]');
    expect(layout.overflowX).toBe('auto');
    expect(table).toHaveAttribute('data-overflow-x', 'auto');
    expect(table?.className).toContain('overflow-x-auto');
    expect(table?.className).not.toContain('overflow-hidden');
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

  test('hides table chrome when empty hiding is enabled', () => {
    const { container } = render(
      <HeaderedTable empty hideWhenEmpty>
        <div>No rows available</div>
      </HeaderedTable>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('detects renderable row collections explicitly', () => {
    expect(hasRenderableRows([{ id: 'row-1' }])).toBe(true);
    expect(hasRenderableRows([])).toBe(false);
    expect(hasRenderableRows(null)).toBe(false);
  });
});
