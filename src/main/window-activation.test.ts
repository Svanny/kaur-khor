// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  prepareInactiveMacDevWindowLaunch,
  shouldPrepareInactiveMacDevWindowLaunch,
  showWindowWithoutStealingFocus,
} from './window-activation';

describe('window activation policy', () => {
  it('prepares inactive launch only for macOS dev renderer launches', () => {
    expect(
      shouldPrepareInactiveMacDevWindowLaunch({
        benchmarkWindowBackgroundMode: false,
        isPackaged: false,
        platform: 'darwin',
        rendererUrl: 'http://127.0.0.1:5173',
      }),
    ).toBe(true);

    expect(
      shouldPrepareInactiveMacDevWindowLaunch({
        benchmarkWindowBackgroundMode: false,
        isPackaged: true,
        platform: 'darwin',
        rendererUrl: 'http://127.0.0.1:5173',
      }),
    ).toBe(false);

    expect(
      shouldPrepareInactiveMacDevWindowLaunch({
        benchmarkWindowBackgroundMode: true,
        isPackaged: false,
        platform: 'darwin',
        rendererUrl: 'http://127.0.0.1:5173',
      }),
    ).toBe(false);

    expect(
      shouldPrepareInactiveMacDevWindowLaunch({
        benchmarkWindowBackgroundMode: false,
        isPackaged: false,
        platform: 'linux',
        rendererUrl: 'http://127.0.0.1:5173',
      }),
    ).toBe(false);
  });

  it('uses accessory activation before app readiness so dev launch does not steal focus', () => {
    const setActivationPolicy = vi.fn();

    prepareInactiveMacDevWindowLaunch({
      app: { setActivationPolicy },
      shouldPrepare: true,
    });

    expect(setActivationPolicy).toHaveBeenCalledOnce();
    expect(setActivationPolicy).toHaveBeenCalledWith('accessory');
  });

  it('reveals the window inactive and immediately restores regular app visibility', () => {
    const calls: string[] = [];
    const app = {
      setActivationPolicy: vi.fn((policy: 'regular' | 'accessory' | 'prohibited') => {
        calls.push(`policy:${policy}`);
      }),
    };
    const targetWindow = {
      showInactive: vi.fn(() => {
        calls.push('showInactive');
      }),
    };

    showWindowWithoutStealingFocus({
      app,
      targetWindow,
      restoreRegularActivationPolicy: true,
    });

    expect(calls).toEqual(['showInactive', 'policy:regular']);
    expect(targetWindow.showInactive).toHaveBeenCalledOnce();
    expect(app.setActivationPolicy).toHaveBeenCalledOnce();
    expect(app.setActivationPolicy).toHaveBeenCalledWith('regular');
  });

  it('keeps non-mac or packaged reveals on the simple inactive show path', () => {
    const setActivationPolicy = vi.fn();
    const targetWindow = {
      showInactive: vi.fn(),
    };

    showWindowWithoutStealingFocus({
      app: { setActivationPolicy },
      targetWindow,
      restoreRegularActivationPolicy: false,
    });

    expect(setActivationPolicy).not.toHaveBeenCalled();
    expect(targetWindow.showInactive).toHaveBeenCalledTimes(1);
  });

  it('does not mutate activation policy when inactive launch preparation is disabled', () => {
    const setActivationPolicy = vi.fn();

    prepareInactiveMacDevWindowLaunch({
      app: { setActivationPolicy },
      shouldPrepare: false,
    });

    expect(setActivationPolicy).not.toHaveBeenCalled();
  });
});
