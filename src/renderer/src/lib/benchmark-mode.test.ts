import { describe, expect, it } from 'vitest';
import { isBenchmarkRendererMode } from './benchmark-mode';

describe('benchmark renderer mode', () => {
  it('detects benchmark mode from the preload bridge', () => {
    expect(isBenchmarkRendererMode({
      kaurKhorDesktop: {
        benchmark: {
          enabled: true,
        },
      },
    } as Window)).toBe(true);
  });

  it('keeps StrictMode enabled when the bridge is missing or benchmark mode is off', () => {
    expect(isBenchmarkRendererMode({} as Window)).toBe(false);
    expect(isBenchmarkRendererMode({
      kaurKhorDesktop: {
        benchmark: {
          enabled: false,
        },
      },
    } as Window)).toBe(false);
  });
});
