import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from './use-mobile';

const EMBEDDED_VIEWPORT_CHANGE_EVENT = 'kaur-khor:embedded-viewport-change';

function MobileStateProbe() {
  const isMobile = useIsMobile();
  return <div data-testid="is-mobile">{String(isMobile)}</div>;
}

describe('useIsMobile', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    document.documentElement.removeAttribute('data-kaur-khor-effective-viewport-width');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it('supports legacy MediaQueryList addListener APIs', () => {
    let listener: (() => void) | null = null;
    const addListener = vi.fn((nextListener: () => void) => {
      listener = nextListener;
    });
    const removeListener = vi.fn((nextListener: () => void) => {
      if (listener === nextListener) {
        listener = null;
      }
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        addListener,
        matches: false,
        media: '(max-width: 767px)',
        removeListener,
      })),
    });

    const { unmount } = render(<MobileStateProbe />);

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('is-mobile').textContent).toBe('false');

    document.documentElement.dataset.kaurKhorEffectiveViewportWidth = '500';
    act(() => {
      listener?.();
    });

    expect(screen.getByTestId('is-mobile').textContent).toBe('true');
    unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it('updates from embedded viewport change events when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: undefined,
    });

    render(<MobileStateProbe />);

    expect(screen.getByTestId('is-mobile').textContent).toBe('false');

    document.documentElement.dataset.kaurKhorEffectiveViewportWidth = '640';
    act(() => {
      document.documentElement.dispatchEvent(new Event(EMBEDDED_VIEWPORT_CHANGE_EVENT));
    });

    expect(screen.getByTestId('is-mobile').textContent).toBe('true');
  });
});
