// @vitest-environment node

import { describe, expect, test } from 'vitest';
import {
  adjustedLandscapeWindowResizeBounds,
  changeManualWindowZoomLevel,
  clampWindowZoomLevel,
  createManagedWindowZoomState,
  initialWindowZoomFactor,
  managedWindowZoomLevel,
  resetManualWindowZoomLevel,
  updateAutomaticWindowZoomLevel,
} from './window-zoom';
import {
  deriveResponsiveZoomConstraintLevels,
  deriveResponsiveViewportPolicy,
  isPhonePortraitViewport,
  selectResponsiveZoomLevel,
  zoomLevelToScale,
} from '@shared/responsive-zoom';

describe('responsive zoom policy', () => {
  test('selects shared threshold levels from viewport width when height is roomy', () => {
    expect(selectResponsiveZoomLevel({ width: 1600, height: 900 })).toBe(0);
    expect(selectResponsiveZoomLevel({ width: 1599, height: 900 })).toBe(-0.5);
    expect(selectResponsiveZoomLevel({ width: 1439, height: 900 })).toBe(-1);
    expect(selectResponsiveZoomLevel({ width: 1279, height: 900 })).toBe(-1.5);
    expect(selectResponsiveZoomLevel({ width: 1119, height: 900 })).toBe(-2);
  });

  test('tightens wide windows when height is constrained', () => {
    expect(selectResponsiveZoomLevel({ width: 1600, height: 900 })).toBe(0);
    expect(selectResponsiveZoomLevel({ width: 1600, height: 899 })).toBe(-0.5);
    expect(selectResponsiveZoomLevel({ width: 1600, height: 799 })).toBe(-1);
    expect(selectResponsiveZoomLevel({ width: 1600, height: 639 })).toBe(-2);
  });

  test('tightens tall windows when width is constrained', () => {
    expect(selectResponsiveZoomLevel({ width: 1280, height: 1000 })).toBe(-1);
    expect(selectResponsiveZoomLevel({ width: 1120, height: 1000 })).toBe(-1.5);
    expect(selectResponsiveZoomLevel({ width: 1119, height: 1000 })).toBe(-2);
  });

  test('tracks area pressure for medium-width and medium-height windows', () => {
    const levels = deriveResponsiveZoomConstraintLevels({ width: 1440, height: 799 });

    expect(levels.widthLevel).toBe(-0.5);
    expect(levels.heightLevel).toBe(-1);
    expect(levels.areaLevel).toBe(-1);
    expect(selectResponsiveZoomLevel({ width: 1440, height: 799 })).toBe(-1);
  });

  test('combines width, height, and area constraints at paired thresholds', () => {
    const levels = deriveResponsiveZoomConstraintLevels({ width: 1440, height: 800 });

    expect(levels.widthLevel).toBe(-0.5);
    expect(levels.heightLevel).toBe(-0.5);
    expect(levels.areaLevel).toBe(-0.5);
    expect(selectResponsiveZoomLevel({ width: 1440, height: 800 })).toBe(-0.5);
    expect(selectResponsiveZoomLevel({ width: 1439, height: 799 })).toBe(-1);
  });

  test('keeps the previous width level inside the hysteresis margin', () => {
    expect(selectResponsiveZoomLevel({ width: 1602, height: 900, previousLevel: -0.5 })).toBe(-0.5);
    expect(deriveResponsiveZoomConstraintLevels({ width: 1626, height: 900, previousLevel: -0.5 }).widthLevel).toBe(0);
    expect(selectResponsiveZoomLevel({ width: 1416, height: 900, previousLevel: -0.5 })).toBe(-0.5);
    expect(selectResponsiveZoomLevel({ width: 1415, height: 900, previousLevel: -0.5 })).toBe(-1);
  });

  test('keeps the previous height level inside the hysteresis margin', () => {
    expect(selectResponsiveZoomLevel({ width: 1600, height: 902, previousLevel: -0.5 })).toBe(-0.5);
    expect(deriveResponsiveZoomConstraintLevels({ width: 1600, height: 921, previousLevel: -0.5 }).heightLevel).toBe(0);
    expect(selectResponsiveZoomLevel({ width: 1600, height: 785, previousLevel: -0.5 })).toBe(-0.5);
    expect(selectResponsiveZoomLevel({ width: 1600, height: 783, previousLevel: -0.5 })).toBe(-1);
  });

  test('keeps the previous area level inside the hysteresis margin', () => {
    expect(deriveResponsiveZoomConstraintLevels({ width: 1600, height: 910, previousLevel: -0.5 }).areaLevel).toBe(-0.5);
    expect(deriveResponsiveZoomConstraintLevels({ width: 1600, height: 921, previousLevel: -0.5 }).areaLevel).toBe(0);
  });

  test('derives landscape-first phone dimensions before scale', () => {
    const policy = deriveResponsiveViewportPolicy({ width: 390, height: 844 });

    expect(isPhonePortraitViewport(390, 844)).toBe(true);
    expect(policy.phoneLandscape).toBe(true);
    expect(policy.measuredWidth).toBe(844);
    expect(policy.measuredHeight).toBe(390);
    expect(policy.zoomLevel).toBe(-2);
    expect(policy.effectiveWidth).toBeCloseTo(844 / zoomLevelToScale(-2));
    expect(policy.effectiveHeight).toBeCloseTo(390 / zoomLevelToScale(-2));
  });
});

describe('managed desktop window zoom', () => {
  test('clamps horizontal resize width to the proposed height', () => {
    expect(
      adjustedLandscapeWindowResizeBounds(
        { height: 900, width: 700, x: 100, y: 50 },
        { edge: 'right' },
      ),
    ).toEqual({ height: 900, width: 900, x: 100, y: 50 });
  });

  test('keeps the right edge fixed when clamping a left-edge resize', () => {
    expect(
      adjustedLandscapeWindowResizeBounds(
        { height: 900, width: 700, x: 300, y: 50 },
        { edge: 'left' },
      ),
    ).toEqual({ height: 900, width: 900, x: 100, y: 50 });
  });

  test('clamps vertical resize height to the proposed width', () => {
    expect(
      adjustedLandscapeWindowResizeBounds(
        { height: 900, width: 700, x: 100, y: 50 },
        { edge: 'bottom' },
      ),
    ).toEqual({ height: 700, width: 700, x: 100, y: 50 });
  });

  test('keeps the bottom edge fixed when clamping a top-corner resize', () => {
    expect(
      adjustedLandscapeWindowResizeBounds(
        { height: 900, width: 700, x: 100, y: 50 },
        { edge: 'top-right' },
      ),
    ).toEqual({ height: 700, width: 700, x: 100, y: 250 });
  });

  test('leaves landscape resize bounds unchanged', () => {
    expect(
      adjustedLandscapeWindowResizeBounds(
        { height: 700, width: 900, x: 100, y: 50 },
        { edge: 'right' },
      ),
    ).toBeNull();
  });

  test('preserves width when the resize edge is ambiguous', () => {
    expect(
      adjustedLandscapeWindowResizeBounds(
        { height: 900, width: 700, x: 100, y: 50 },
        { edge: undefined },
      ),
    ).toEqual({ height: 700, width: 700, x: 100, y: 50 });
  });

  test('uses area-aware automatic zoom for common desktop bounds', () => {
    expect(createManagedWindowZoomState({ width: 1600, height: 900 }).automaticLevel).toBe(0);
    expect(createManagedWindowZoomState({ width: 1440, height: 800 }).automaticLevel).toBe(-0.5);
    expect(createManagedWindowZoomState({ width: 1280, height: 720 }).automaticLevel).toBe(-1);
    expect(createManagedWindowZoomState({ width: 1120, height: 640 }).automaticLevel).toBe(-1.5);
    expect(createManagedWindowZoomState({ width: 1119, height: 639 }).automaticLevel).toBe(-2);
  });

  test('composes automatic viewport zoom with manual menu offset', () => {
    const state = createManagedWindowZoomState({ width: 1280, height: 900 });

    expect(state.automaticLevel).toBe(-1);
    expect(managedWindowZoomLevel(state)).toBe(-1);

    changeManualWindowZoomLevel(state, 1);
    expect(managedWindowZoomLevel(state)).toBe(-0.5);

    updateAutomaticWindowZoomLevel(state, { width: 1119, height: 900 });
    expect(state.automaticLevel).toBe(-2);
    expect(managedWindowZoomLevel(state)).toBe(-1.5);

    resetManualWindowZoomLevel(state);
    expect(managedWindowZoomLevel(state)).toBe(-2);
  });

  test('clamps final zoom and seeds the initial zoom factor', () => {
    expect(clampWindowZoomLevel(-10)).toBe(-3);
    expect(clampWindowZoomLevel(10)).toBe(3);
    expect(initialWindowZoomFactor({ width: 1280, height: 900 })).toBeCloseTo(1.2 ** -1);
    expect(initialWindowZoomFactor({ width: 1600, height: 900 })).toBeCloseTo(1);
  });
});
