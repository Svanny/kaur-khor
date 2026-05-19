import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class MutationObserverMock {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

class MemoryStorage implements Storage {
  #store = new Map<string, string>();

  get length() {
    return this.#store.size;
  }

  clear() {
    this.#store.clear();
  }

  getItem(key: string) {
    return this.#store.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.#store.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.#store.delete(key);
  }

  setItem(key: string, value: string) {
    this.#store.set(key, String(value));
  }
}

const localStorageMock = new MemoryStorage();
const sessionStorageMock = new MemoryStorage();

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(globalThis, 'MutationObserver', {
  configurable: true,
  writable: true,
  value: MutationObserverMock,
});

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: localStorageMock,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  writable: true,
  value: sessionStorageMock,
});

class DataTransferMock {
  #files: File[] = [];
  get files(): FileList {
    return this.#files as unknown as FileList;
  }
  items = {
    add: (file: File) => {
      this.#files.push(file);
      return null;
    },
    [Symbol.iterator]: () => this.#files[Symbol.iterator](),
  } as unknown as DataTransferItemList;
}

Object.defineProperty(globalThis, 'DataTransfer', {
  configurable: true,
  writable: true,
  value: DataTransferMock,
});

if (typeof File !== 'undefined' && !File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function arrayBuffer() {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
}

if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: (contextId: string) => {
      if (contextId !== '2d') {
        return null;
      }
      return {
        font: '',
        measureText: (text: string) => ({ width: text.length * 7.5 }),
      };
    },
  });
}

afterEach(() => {
  cleanup();
  localStorageMock.clear();
  sessionStorageMock.clear();
  vi.unstubAllGlobals();
});
