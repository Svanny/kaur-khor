import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CenteredTileGrid } from './centered-tile-grid';

const originalResizeObserver = globalThis.ResizeObserver;

class MockResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [
        {
          contentRect: {
            bottom: 900,
            height: 900,
            left: 0,
            right: 900,
            top: 0,
            width: 900,
            x: 0,
            y: 0,
          },
          target,
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }

  disconnect() {}
}

describe('CenteredTileGrid', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  test('sizes a two-by-two command grid from the available area', async () => {
    render(
      <CenteredTileGrid className="test-host" gapRem={1.5}>
        <div>One</div>
        <div>Two</div>
        <div>Three</div>
        <div>Four</div>
      </CenteredTileGrid>,
    );

    const grid = screen.getByText('One').parentElement?.parentElement;
    expect(grid).toHaveStyle({ '--centered-tile-gap': '1.5rem' });
    expect(grid).toHaveStyle({ '--centered-tile-padding': '1rem' });

    await waitFor(() => {
      expect(grid).toHaveStyle({ '--hub-tile-size': '352px' });
    });
  });
});
