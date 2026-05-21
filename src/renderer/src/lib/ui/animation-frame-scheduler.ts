export type AnimationFrameScheduler = {
  cancel: () => void;
  flush: () => void;
  schedule: () => void;
};

export function createAnimationFrameScheduler(callback: () => void): AnimationFrameScheduler {
  let frameId: number | null = null;

  const run = () => {
    frameId = null;
    callback();
  };

  return {
    cancel: () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
    flush: () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      callback();
    },
    schedule: () => {
      if (frameId != null) {
        return;
      }
      frameId = window.requestAnimationFrame(run);
    },
  };
}
