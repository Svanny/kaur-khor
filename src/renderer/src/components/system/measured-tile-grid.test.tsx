import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MeasuredTileGrid } from './measured-tile-grid';

const originalResizeObserver = globalThis.ResizeObserver;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

class MockResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  unobserve() {}

  disconnect() {}
}

describe('MeasuredTileGrid', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;

    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const ownWidth = this.getAttribute('data-width');
      const nestedWidth = this.querySelector<HTMLElement>('[data-width]')?.getAttribute('data-width');
      const width = Number(ownWidth ?? nestedWidth ?? '0');
      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: width,
        top: 0,
        width,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return Number(this.getAttribute('data-container-width') ?? '0');
      },
    });
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;

    if (clientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    }
  });

  test('measures hidden items and computes the grid column count', async () => {
    render(
      <MeasuredTileGrid
        items={[
          { id: 'a', width: 180 },
          { id: 'b', width: 220 },
          { id: 'c', width: 240 },
        ]}
        renderGrid={({ columnCount, gridRef }) => (
          <div ref={gridRef} data-container-width="760" data-testid="measured-grid">
            cols:{columnCount}
          </div>
        )}
        renderMeasureItem={(item) => <div data-width={item.width}>{item.id}</div>}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('measured-grid')).toHaveTextContent('cols:3');
    });

    expect(document.querySelectorAll('[data-measured-grid-item="true"]')).toHaveLength(3);
  });

  test('respects min and max column clamps', async () => {
    render(
      <MeasuredTileGrid
        items={[
          { id: 'a', width: 210 },
          { id: 'b', width: 210 },
          { id: 'c', width: 210 },
        ]}
        maxColumns={2}
        minColumns={2}
        renderGrid={({ columnCount, gridRef }) => (
          <div ref={gridRef} data-container-width="240" data-testid="clamped-grid">
            cols:{columnCount}
          </div>
        )}
        renderMeasureItem={(item) => <div data-width={item.width}>{item.id}</div>}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('clamped-grid')).toHaveTextContent('cols:2');
    });
  });
});
