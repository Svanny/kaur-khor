import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AnchoredMenu } from './anchored-menu';

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

function rect(overrides: Partial<DOMRect>): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: overrides.left ?? 0,
    y: overrides.top ?? 0,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

describe('AnchoredMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
  });

  test('keeps the menu inside the viewport near the bottom-right edge', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 620 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect() {
      if (this instanceof HTMLButtonElement && this.getAttribute('aria-haspopup') === 'menu') {
        return rect({ left: 700, right: 760, top: 560, bottom: 600, width: 60, height: 40 });
      }
      if (this.getAttribute('role') === 'menu') {
        return rect({ left: 0, right: 260, top: 0, bottom: 220, width: 260, height: 220 });
      }
      return rect({});
    });

    render(
      <AnchoredMenu
        align="left"
        className="w-[260px]"
        label="Open menu"
        triggerIcon="Open"
      >
        {() => (
          <button role="menuitem" type="button">
            Menu item
          </button>
        )}
      </AnchoredMenu>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.style.opacity).not.toBe('0'));
    expect(Number(menu.style.left.replace('px', ''))).toBeLessThanOrEqual(532);
    expect(Number(menu.style.top.replace('px', ''))).toBeLessThan(560);
    expect(Number(menu.style.top.replace('px', '')) + 220).toBeLessThanOrEqual(612);
  });
});
