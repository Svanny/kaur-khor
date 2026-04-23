import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AutoFitContainer, AutoFitText } from './auto-fit-text';

const originalResizeObserver = globalThis.ResizeObserver;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {
    void this.callback;
  }

  observe() {}

  disconnect() {}
}

function fontSizeFor(element: HTMLElement) {
  return Number.parseFloat(element.style.fontSize || '16');
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-text') {
        return Number(this.parentElement?.getAttribute('data-width') ?? '0');
      }
      if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-container') {
        return Number(this.parentElement?.getAttribute('data-width') ?? '0');
      }
      return 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-text') {
        return 24;
      }
      if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-container') {
        return 36;
      }
      return 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-text') {
        return Math.ceil((this.textContent?.length ?? 0) * fontSizeFor(this) * 0.72);
      }
      if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-container') {
        const baseWidth = Number(this.getAttribute('data-base-width') ?? '0');
        return Math.ceil((baseWidth * fontSizeFor(this)) / 16);
      }
      return 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-text') {
        return 24;
      }
      if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-container') {
        return 36;
      }
      return 0;
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

  if (clientHeightDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }

  if (scrollWidthDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidthDescriptor);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
  }

  if (scrollHeightDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  }
});

describe('AutoFitText', () => {
  it('reduces font size one pixel at a time until width overflow stops', async () => {
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const width = this instanceof HTMLElement && this.dataset.slot === 'auto-fit-text' ? this.clientWidth : 112;
      return { left: 0, top: 0, right: width, bottom: 24, width, height: 24, x: 0, y: 0, toJSON() {} };
    };

    render(
      <div data-width="112">
        <AutoFitText maxFontSizePx={16} minFontSizePx={10}>
          $210,516,910.15
        </AutoFitText>
      </div>,
    );

    const text = screen.getByText('$210,516,910.15');
    await waitFor(() => expect(text).toHaveStyle({ fontSize: '10px' }));
  });

  it('shrinks when the text box still extends past the parent edge', async () => {
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-text') {
        const width = Math.ceil((this.textContent?.length ?? 0) * fontSizeFor(this) * 0.72);
        return { left: 0, top: 0, right: width, bottom: 24, width, height: 24, x: 0, y: 0, toJSON() {} };
      }

      if (this instanceof HTMLElement && this.getAttribute('data-width') != null) {
        const width = Number(this.getAttribute('data-width'));
        return { left: 0, top: 0, right: width, bottom: 24, width, height: 24, x: 0, y: 0, toJSON() {} };
      }

      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} };
    };

    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-text') {
          return this.clientWidth;
        }
        return 0;
      },
    });

    render(
      <div data-width="100">
        <AutoFitText maxFontSizePx={16} minFontSizePx={10}>
          $247,895,606.20
        </AutoFitText>
      </div>,
    );

    const text = screen.getByText('$247,895,606.20');
    await waitFor(() => expect(text).toHaveStyle({ fontSize: '10px' }));
  });

  it('shrinks a composite container when the whole row is wider than its parent', async () => {
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this instanceof HTMLElement && this.dataset.slot === 'auto-fit-container') {
        const width = Math.ceil((Number(this.getAttribute('data-base-width') ?? '0') * fontSizeFor(this)) / 16);
        return { left: 0, top: 0, right: width, bottom: 36, width, height: 36, x: 0, y: 0, toJSON() {} };
      }

      if (this instanceof HTMLElement && this.getAttribute('data-width') != null) {
        const width = Number(this.getAttribute('data-width'));
        return { left: 0, top: 0, right: width, bottom: 36, width, height: 36, x: 0, y: 0, toJSON() {} };
      }

      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} };
    };

    render(
      <div data-width="120">
        <AutoFitContainer data-base-width="220" maxFontSizePx={16} minFontSizePx={8}>
          <div>Title</div>
          <button type="button">-</button>
          <input readOnly value="1" />
          <button type="button">+</button>
        </AutoFitContainer>
      </div>,
    );

    const container = screen.getByText('Title').parentElement as HTMLElement;
    await waitFor(() => expect(container).toHaveStyle({ fontSize: '8px' }));
  });
});
