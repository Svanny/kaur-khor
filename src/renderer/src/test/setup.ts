import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
}
