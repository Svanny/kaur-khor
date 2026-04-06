import { describe, expect, test } from 'vitest';
import {
  deriveClampedChartDataLabelPosition,
  deriveDashUnit,
  deriveHorizontalDotGuideLayout,
  deriveExpandedChartVisualStyle,
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

  test('derives capped expanded visual styles for labels, markers, and dashed lines', () => {
    const style = deriveExpandedChartVisualStyle({
      expandedHeightRatio: 3,
      maxStrokeWidth: 1,
      maxMarkerSize: 14,
      maxDashedStrokeWidth: 0.8,
      maxDataLabelFontSize: 12,
    });

    expect(style.strokeWidth).toBe(1);
    expect(style.markerSize).toBeLessThanOrEqual(14);
    expect(style.dashedStrokeWidth).toBeLessThanOrEqual(0.8);
    expect(style.primaryDotDiameter).toBeGreaterThan(0);
    expect(style.primaryDotGap).toBeGreaterThan(0);
    expect(style.dataLabelFontSize).toBeLessThanOrEqual(12);
    expect(style.primaryDashArray).toContain(' ');
    expect(style.secondaryDashArray).toContain(' ');
  });

  test('builds circular dot guide layout from explicit circles', () => {
    const layout = deriveHorizontalDotGuideLayout({
      startX: 10,
      endX: 30,
      dotDiameter: 4,
      gap: 2,
    });

    expect(layout.radius).toBe(2);
    expect(layout.centers).toEqual([12, 18, 24]);
  });

  test('derives dash unit from dash array strings', () => {
    expect(deriveDashUnit('4.0 3.0')).toBe(4);
    expect(deriveDashUnit('0 8.4')).toBe(0);
    expect(deriveDashUnit('invalid')).toBe(0);
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

  test('clamps chart data labels back into the visible container bounds', () => {
    expect(deriveClampedChartDataLabelPosition({
      anchorX: 190,
      anchorY: 20,
      labelWidth: 80,
      labelHeight: 20,
      containerWidth: 200,
      containerHeight: 120,
      sidePadding: 8,
      gap: 8,
    })).toEqual({
      left: 112,
      top: 4,
    });

    expect(deriveClampedChartDataLabelPosition({
      anchorX: 10,
      anchorY: 100,
      labelWidth: 60,
      labelHeight: 20,
      containerWidth: 200,
      containerHeight: 120,
      sidePadding: 8,
      gap: 8,
    })).toEqual({
      left: 8,
      top: 72,
    });
  });
});
