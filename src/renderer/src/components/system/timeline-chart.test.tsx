import { describe, expect, test } from 'vitest';
import {
  deriveProportionalChartGeometry,
  deriveTouchingRangeBounds,
  deriveTouchingSlotGlyphLayout,
} from './timeline-chart';

describe('deriveProportionalChartGeometry', () => {
  test('preserves collapsed plot-to-aux proportions as height grows', () => {
    const geometry = deriveProportionalChartGeometry({
      collapsedPlotHeight: 72,
      collapsedAuxHeight: 60,
      availableHeight: 264,
    });

    expect(geometry.expandedHeightRatio).toBe(2);
    expect(geometry.plotHeight).toBe(144);
    expect(geometry.auxHeight).toBe(120);
  });

  test('clamps line stroke and marker size at configured maxima', () => {
    const geometry = deriveProportionalChartGeometry({
      collapsedPlotHeight: 72,
      availableHeight: 720,
      baseStrokeWidth: 1.8,
      maxStrokeWidth: 2.6,
      baseMarkerSize: 12,
      maxMarkerSize: 14,
    });

    expect(geometry.strokeWidth).toBe(2.6);
    expect(geometry.markerSize).toBe(14);
  });

  test('increases auxiliary area as expanded height grows', () => {
    const collapsed = deriveProportionalChartGeometry({
      collapsedPlotHeight: 72,
      collapsedAuxHeight: 60,
      availableHeight: 132,
    });
    const expanded = deriveProportionalChartGeometry({
      collapsedPlotHeight: 72,
      collapsedAuxHeight: 60,
      availableHeight: 264,
    });

    expect(expanded.auxHeight).toBeGreaterThan(collapsed.auxHeight);
    expect(expanded.bandMinThickness).toBeGreaterThan(collapsed.bandMinThickness);
  });

  test('never returns negative dimensions and respects collapsed minima', () => {
    const geometry = deriveProportionalChartGeometry({
      collapsedPlotHeight: 72,
      collapsedAuxHeight: 60,
      availableHeight: 20,
    });

    expect(geometry.plotHeight).toBeGreaterThanOrEqual(72);
    expect(geometry.auxHeight).toBeGreaterThanOrEqual(60);
    expect(geometry.strokeWidth).toBeGreaterThan(0);
    expect(geometry.markerSize).toBeGreaterThan(0);
    expect(geometry.bandMinThickness).toBeGreaterThan(0);
  });

  test('collapses slot glyph gaps when the gap would exceed glyph width', () => {
    expect(deriveTouchingSlotGlyphLayout({ slotWidth: 40, preferredInset: 4 })).toEqual({
      width: 32,
      inset: 4,
    });
    expect(deriveTouchingSlotGlyphLayout({ slotWidth: 12, preferredInset: 4 })).toEqual({
      width: 12,
      inset: 0,
    });
  });

  test('collapses range bounds gaps when the gap would exceed pill width', () => {
    expect(deriveTouchingRangeBounds({
      start: 10,
      end: 50,
      leadingGap: 4,
      trailingGap: 4,
    })).toEqual({
      left: 14,
      width: 32,
    });
    expect(deriveTouchingRangeBounds({
      start: 10,
      end: 18,
      leadingGap: 4,
      trailingGap: 4,
      minWidth: 0,
    })).toEqual({
      left: 10,
      width: 8,
    });
  });
});
