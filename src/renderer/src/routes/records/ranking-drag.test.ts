import { describe, expect, test } from 'vitest';
import { clampOverlayTransformToBoundary } from './ranking-drag';

describe('ranking-drag', () => {
  test('clamps overlay transform when it would exceed the left and top edges', () => {
    expect(
      clampOverlayTransformToBoundary({
        activeNodeRect: {
          bottom: 150,
          height: 50,
          left: 100,
          right: 400,
          top: 100,
          width: 300,
        },
        boundaryRect: {
          bottom: 320,
          height: 220,
          left: 80,
          right: 680,
          top: 80,
          width: 600,
        },
        overlayNodeRect: {
          bottom: 150,
          height: 50,
          left: 100,
          right: 400,
          top: 100,
          width: 300,
        },
        transform: {
          scaleX: 1,
          scaleY: 1,
          x: -60,
          y: -40,
        },
      }),
    ).toEqual({
      scaleX: 1,
      scaleY: 1,
      x: -20,
      y: -20,
    });
  });

  test('clamps overlay transform when it would exceed the right and bottom edges', () => {
    expect(
      clampOverlayTransformToBoundary({
        activeNodeRect: {
          bottom: 150,
          height: 50,
          left: 100,
          right: 400,
          top: 100,
          width: 300,
        },
        boundaryRect: {
          bottom: 320,
          height: 220,
          left: 80,
          right: 680,
          top: 80,
          width: 600,
        },
        overlayNodeRect: {
          bottom: 150,
          height: 50,
          left: 100,
          right: 400,
          top: 100,
          width: 300,
        },
        transform: {
          scaleX: 1,
          scaleY: 1,
          x: 400,
          y: 220,
        },
      }),
    ).toEqual({
      scaleX: 1,
      scaleY: 1,
      x: 280,
      y: 170,
    });
  });

  test('preserves transform when the overlay already fits inside the boundary', () => {
    expect(
      clampOverlayTransformToBoundary({
        activeNodeRect: {
          bottom: 150,
          height: 50,
          left: 100,
          right: 400,
          top: 100,
          width: 300,
        },
        boundaryRect: {
          bottom: 320,
          height: 220,
          left: 80,
          right: 680,
          top: 80,
          width: 600,
        },
        overlayNodeRect: {
          bottom: 150,
          height: 50,
          left: 100,
          right: 400,
          top: 100,
          width: 300,
        },
        transform: {
          scaleX: 1,
          scaleY: 1,
          x: 80,
          y: 40,
        },
      }),
    ).toEqual({
      scaleX: 1,
      scaleY: 1,
      x: 80,
      y: 40,
    });
  });

  test('preserves transform when drag measurements are not finite', () => {
    const transform = {
      scaleX: 1,
      scaleY: 1,
      x: Number.NaN,
      y: 40,
    };

    expect(
      clampOverlayTransformToBoundary({
        activeNodeRect: {
          bottom: 150,
          height: 50,
          left: 100,
          right: 400,
          top: 100,
          width: 300,
        },
        boundaryRect: {
          bottom: 320,
          height: 220,
          left: 80,
          right: 680,
          top: 80,
          width: 600,
        },
        overlayNodeRect: {
          bottom: 150,
          height: 50,
          left: 100,
          right: 400,
          top: 100,
          width: Number.NaN,
        },
        transform,
      }),
    ).toBe(transform);
  });
});
