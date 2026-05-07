import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { FilterControlRow } from './filter-control-row';

describe('FilterControlRow', () => {
  test('renders search and filter slots with the shared responsive contract', () => {
    const { container } = render(
      <FilterControlRow
        search={<input aria-label="Search catalog" />}
        primaryFilter={<button type="button">All</button>}
        secondaryFilter={<button type="button">All suppliers</button>}
        trailing={<button type="button">More</button>}
      />,
    );

    const row = container.querySelector('[data-slot="filter-control-row"]');
    expect(row).not.toBeNull();
    expect(row?.className).toContain('flex-wrap');
    expect(row?.className).toContain('[&_[data-slot=filter-control-row-search]]:min-w-[14rem]');
    expect(row?.className).toContain('[&_[data-slot=filter-control-row-search]]:max-w-xl');
    expect(row?.className).toContain('max-[760px]');
    expect(container.querySelector('[data-slot="filter-control-row-search"]')).toContainElement(screen.getByLabelText('Search catalog'));
    expect(container.querySelector('[data-slot="filter-control-row-primary"]')).toHaveTextContent('All');
    expect(container.querySelector('[data-slot="filter-control-row-secondary"]')).toHaveTextContent('All suppliers');
    expect(container.querySelector('[data-slot="filter-control-row-trailing"]')).toHaveTextContent('More');
  });

  test('omits optional filter slots cleanly', () => {
    const { container } = render(<FilterControlRow search={<input aria-label="Search only" />} />);

    expect(container.querySelector('[data-slot="filter-control-row-search"]')).toContainElement(screen.getByLabelText('Search only'));
    expect(container.querySelector('[data-slot="filter-control-row-primary"]')).toBeNull();
    expect(container.querySelector('[data-slot="filter-control-row-secondary"]')).toBeNull();
  });
});
