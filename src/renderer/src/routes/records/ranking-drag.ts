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

function finiteRectNumbers(rect: ClientRect) {
  return Number.isFinite(rect.left) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.bottom) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height);
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
  if (
    !finiteRectNumbers(activeNodeRect) ||
    !finiteRectNumbers(boundaryRect) ||
    !finiteRectNumbers(overlayNodeRect) ||
    !Number.isFinite(transform.x) ||
    !Number.isFinite(transform.y)
  ) {
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
