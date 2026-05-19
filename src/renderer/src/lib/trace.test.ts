import { afterEach, describe, expect, test, vi } from 'vitest';
import { rendererTraceEnabled, traceRenderer } from './trace';

describe('renderer trace helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('treats blocked localStorage as tracing disabled', () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });

    try {
      expect(rendererTraceEnabled()).toBe(false);
      expect(() => traceRenderer('test', 'message')).not.toThrow();
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(window, 'localStorage', localStorageDescriptor);
      }
    }
  });

  test('treats localStorage getItem failures as tracing disabled', () => {
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: () => {
        throw new Error('storage read blocked');
      },
    } as unknown as Storage);

    expect(rendererTraceEnabled()).toBe(false);
    expect(() => traceRenderer('test', 'message')).not.toThrow();
  });
});
