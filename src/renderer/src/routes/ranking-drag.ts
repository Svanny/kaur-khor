import type { ClientRect } from '@dnd-kit/core';
import type { Transform } from '@dnd-kit/utilities';

type ClampOverlayTransformArgs = {
  activeNodeRect: ClientRect | null;
  boundaryRect: ClientRect | null;
  overlayNodeRect: ClientRect | null;
  transform: Transform;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function clampOverlayTransformToBoundary({
  activeNodeRect,
  boundaryRect,
  overlayNodeRect,
  transform,
}: ClampOverlayTransformArgs): Transform {
  if (!activeNodeRect || !boundaryRect || !overlayNodeRect) {
    return transform;
  }

  const currentLeft = activeNodeRect.left + transform.x;
  const currentTop = activeNodeRect.top + transform.y;

  const maxLeft = Math.max(boundaryRect.left, boundaryRect.right - overlayNodeRect.width);
  const maxTop = Math.max(boundaryRect.top, boundaryRect.bottom - overlayNodeRect.height);

  const clampedLeft = clamp(currentLeft, boundaryRect.left, maxLeft);
  const clampedTop = clamp(currentTop, boundaryRect.top, maxTop);

  return {
    ...transform,
    x: clampedLeft - activeNodeRect.left,
    y: clampedTop - activeNodeRect.top,
  };
}
