import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EntityLayersIcon, EntityServiceIcon, EntitySkuIcon } from '@icons/entities';
import { ResponsiveToggleFilter } from './responsive-toggle-filter';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    language: 'en',
  }),
}));

const options = [
  { icon: EntityLayersIcon, label: 'All', value: 'all' },
  { icon: EntitySkuIcon, label: 'SKUs', value: 'skus' },
  { icon: EntityServiceIcon, label: 'Services', value: 'services' },
] as const;

function mockElementWidths({ availableWidth, contentWidth }: { availableWidth: number; contentWidth: number }) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.dataset.slot === 'responsive-toggle-filter-measure') {
        return contentWidth;
      }
      return availableWidth;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.dataset.slot === 'responsive-toggle-filter-measure') {
        return contentWidth;
      }
      return availableWidth;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      const isClippingParent = this instanceof HTMLElement && this.dataset.testid === 'clipping-parent';
      return {
        bottom: 0,
        height: 0,
        left: isClippingParent ? 0 : 180,
        right: isClippingParent ? availableWidth : 180 + contentWidth,
        top: 0,
        width: isClippingParent ? availableWidth : contentWidth,
        x: isClippingParent ? 0 : 180,
        y: 0,
        toJSON: () => {},
      };
    },
  });
}

describe('ResponsiveToggleFilter', () => {
  beforeEach(() => {
    mockElementWidths({ availableWidth: 400, contentWidth: 240 });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders toggle pills when the options fit', () => {
    render(
      <ResponsiveToggleFilter
        ariaLabel="Catalog filter"
        options={[...options]}
        value="all"
        onValueChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'SKUs' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Catalog filter' })).not.toBeInTheDocument();
  });

  test('switches to a dropdown when the pills would overflow', () => {
    mockElementWidths({ availableWidth: 160, contentWidth: 320 });

    render(
      <ResponsiveToggleFilter
        ariaLabel="Catalog filter"
        options={[...options]}
        value="skus"
        onValueChange={vi.fn()}
      />,
    );

    const dropdown = screen.getByRole('combobox', { name: 'Catalog filter' });
    expect(dropdown.closest('[data-slot="responsive-toggle-filter"]')).toHaveClass('self-center');
    expect(dropdown).toHaveTextContent('Filter:');
    expect(dropdown).toHaveTextContent('SKUs');
    expect(dropdown.querySelector('svg')).toHaveClass('text-current');
    expect(screen.queryByRole('radio', { name: 'SKUs' })).not.toBeInTheDocument();
  });

  test('switches to a dropdown when a clipping parent is narrower than the pill row', () => {
    mockElementWidths({ availableWidth: 420, contentWidth: 320 });
    const originalGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = originalGetComputedStyle(element);
      const clipped = element instanceof HTMLElement && element.dataset.testid === 'clipping-parent';
      return new Proxy(style, {
        get(target, property, receiver) {
          if (property === 'overflow' || property === 'overflowX') {
            return clipped ? 'hidden' : 'visible';
          }
          return Reflect.get(target, property, receiver);
        },
      });
    });

    render(
      <div data-testid="clipping-parent">
        <div style={{ marginLeft: 180 }}>
          <ResponsiveToggleFilter
            ariaLabel="Catalog filter"
            options={[...options]}
            value="all"
            onValueChange={vi.fn()}
          />
        </div>
      </div>,
    );

    expect(screen.getByRole('combobox', { name: 'Catalog filter' })).toHaveTextContent('Filter:');
  });

  test('selects an option from the dropdown', async () => {
    mockElementWidths({ availableWidth: 160, contentWidth: 320 });
    const onValueChange = vi.fn();

    render(
      <ResponsiveToggleFilter
        ariaLabel="Catalog filter"
        options={[...options]}
        value="all"
        onValueChange={onValueChange}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Catalog filter' }));
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('Services'));

    expect(onValueChange).toHaveBeenCalledWith('services');
  });
});
