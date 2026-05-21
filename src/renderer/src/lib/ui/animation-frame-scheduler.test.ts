import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAnimationFrameScheduler } from './animation-frame-scheduler';

describe('createAnimationFrameScheduler', () => {
  let frameCallback: FrameRequestCallback | null;
  let frameId: number;

  beforeEach(() => {
    frameCallback = null;
    frameId = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallback = callback;
      frameId += 1;
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('coalesces repeated schedule calls into one frame', () => {
    const callback = vi.fn();
    const scheduler = createAnimationFrameScheduler(callback);

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();

    frameCallback?.(16);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('flush cancels pending frame and runs immediately', () => {
    const callback = vi.fn();
    const scheduler = createAnimationFrameScheduler(callback);

    scheduler.schedule();
    scheduler.flush();

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('cancel clears pending work', () => {
    const callback = vi.fn();
    const scheduler = createAnimationFrameScheduler(callback);

    scheduler.schedule();
    scheduler.cancel();

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(callback).not.toHaveBeenCalled();
  });
});
