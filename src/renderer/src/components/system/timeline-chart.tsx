import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { deriveSlotCenterX, deriveSlotLeftX } from './interval-strip';

export interface ProportionalChartGeometry {
  expandedHeightRatio: number;
  plotHeight: number;
  auxHeight: number;
  strokeWidth: number;
  markerSize: number;
  bandMinThickness: number;
}

export interface ExpandedChartVisualStyle {
  strokeWidth: number;
  markerSize: number;
  dashedStrokeWidth: number;
  primaryDotDiameter: number;
  primaryDotGap: number;
  primaryDashArray: string;
  secondaryDashArray: string;
  dataLabelFontSize: number;
  dataLabelPaddingX: number;
  dataLabelPaddingY: number;
  dataLabelGap: number;
}

export interface TouchingSlotGlyphLayout {
  width: number;
  inset: number;
}

export interface HorizontalDotGuideLayout {
  centers: number[];
  radius: number;
}

export interface ClampedChartDataLabelPosition {
  left: number;
  top: number;
}

function clampValue(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function deriveDashUnit(dashArray: string) {
  const firstToken = dashArray.trim().split(/\s+/)[0];
  const parsed = Number(firstToken);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deriveTouchingSlotGlyphLayout({
  slotWidth,
  preferredInset,
}: {
  slotWidth: number;
  preferredInset: number;
}): TouchingSlotGlyphLayout {
  const normalizedSlotWidth = Math.max(0, slotWidth);
  const normalizedInset = Math.max(0, preferredInset);
  const gapWidth = normalizedInset * 2;
  const glyphWidth = Math.max(0, normalizedSlotWidth - gapWidth);

  if (glyphWidth < gapWidth) {
    return {
      width: normalizedSlotWidth,
      inset: 0,
    };
  }

  return {
    width: glyphWidth,
    inset: normalizedInset,
  };
}

export function deriveTouchingRangeBounds({
  start,
  end,
  leadingGap,
  trailingGap,
  minWidth = 0,
}: {
  start: number;
  end: number;
  leadingGap: number;
  trailingGap: number;
  minWidth?: number;
}) {
  const rangeStart = Math.min(start, end);
  const rangeEnd = Math.max(start, end);
  const preferredWidth = Math.max(minWidth, rangeEnd - rangeStart - leadingGap - trailingGap);
  const preferredGap = Math.max(0, leadingGap) + Math.max(0, trailingGap);

  if (preferredWidth < preferredGap) {
    return {
      left: rangeStart,
      width: Math.max(minWidth, rangeEnd - rangeStart),
    };
  }

  return {
    left: rangeStart + Math.max(0, leadingGap),
    width: preferredWidth,
  };
}

export function deriveScaledVisualValue(
  baseValue: number,
  ratio: number,
  options?: {
    min?: number;
    max?: number;
    power?: number;
  },
) {
  const power = options?.power ?? 1;
  const scaled = baseValue * Math.max(1, ratio) ** power;
  const min = options?.min ?? baseValue;
  const max = options?.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, scaled));
}

export function deriveHorizontalDotGuideLayout({
  startX,
  endX,
  dotDiameter,
  gap,
}: {
  startX: number;
  endX: number;
  dotDiameter: number;
  gap: number;
}): HorizontalDotGuideLayout {
  const guideStart = Math.min(startX, endX);
  const guideEnd = Math.max(startX, endX);
  const radius = Math.max(0.5, dotDiameter / 2);
  const firstCenter = guideStart + radius;
  const lastCenter = Math.max(firstCenter, guideEnd - radius);
  const step = Math.max(radius * 2 + Math.max(0, gap), radius * 2);
  const centers: number[] = [];

  for (let center = firstCenter; center <= lastCenter + 0.001; center += step) {
    centers.push(Number(center.toFixed(3)));
  }

  if (centers.length === 0) {
    centers.push(Number(((guideStart + guideEnd) / 2).toFixed(3)));
  }

  return {
    centers,
    radius,
  };
}

export function deriveClampedChartDataLabelPosition({
  anchorX,
  anchorY,
  labelWidth,
  labelHeight,
  containerWidth,
  containerHeight,
  sidePadding = 8,
  topPadding = 4,
  bottomPadding = 4,
  gap = 8,
  placement = 'above',
}: {
  anchorX: number;
  anchorY: number;
  labelWidth: number;
  labelHeight: number;
  containerWidth: number;
  containerHeight: number;
  sidePadding?: number;
  topPadding?: number;
  bottomPadding?: number;
  gap?: number;
  placement?: 'above' | 'below';
}): ClampedChartDataLabelPosition {
  const width = Math.max(0, labelWidth);
  const height = Math.max(0, labelHeight);
  const preferredLeft = anchorX - width / 2;
  const maxLeft = Math.max(sidePadding, containerWidth - width - sidePadding);
  const left = clampValue(preferredLeft, sidePadding, maxLeft);
  const preferredTop = placement === 'above' ? anchorY - height - gap : anchorY + gap;
  const maxTop = Math.max(topPadding, containerHeight - height - bottomPadding);
  const top = clampValue(preferredTop, topPadding, maxTop);

  return { left, top };
}

export function ClampedChartDataLabel({
  anchorX,
  anchorY,
  containerWidth,
  containerHeight,
  sidePadding = 8,
  topPadding = 4,
  bottomPadding = 4,
  gap = 8,
  placement = 'above',
  className,
  style,
  children,
}: {
  anchorX: number;
  anchorY: number;
  containerWidth: number;
  containerHeight: number;
  sidePadding?: number;
  topPadding?: number;
  bottomPadding?: number;
  gap?: number;
  placement?: 'above' | 'below';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const labelRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = labelRef.current;
    if (!node) {
      return;
    }

    const updateSize = () => {
      const nextWidth = node.offsetWidth;
      const nextHeight = node.offsetHeight;
      setSize((current) => (
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      ));
    };

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    updateSize();
    return () => observer.disconnect();
  }, [children]);

  const position = deriveClampedChartDataLabelPosition({
    anchorX,
    anchorY,
    labelWidth: size.width,
    labelHeight: size.height,
    containerWidth,
    containerHeight,
    sidePadding,
    topPadding,
    bottomPadding,
    gap,
    placement,
  });

  return (
    <div
      ref={labelRef}
      className={cn('pointer-events-none absolute z-[3]', className)}
      style={{ left: position.left, top: position.top, ...style }}
    >
      {children}
    </div>
  );
}

export function deriveExpandedChartVisualStyle({
  expandedHeightRatio,
  baseStrokeWidth = 1,
  maxStrokeWidth = 1,
  baseMarkerSize = 12,
  maxMarkerSize = 14,
  baseDashedStrokeWidth = 0.6,
  maxDashedStrokeWidth = 0.8,
  baseDataLabelFontSize = 10,
  maxDataLabelFontSize = 12,
  baseDataLabelPaddingX = 8,
  maxDataLabelPaddingX = 10,
  baseDataLabelPaddingY = 2,
  maxDataLabelPaddingY = 4,
  baseDataLabelGap = 8,
  maxDataLabelGap = 12,
}: {
  expandedHeightRatio: number;
  baseStrokeWidth?: number;
  maxStrokeWidth?: number;
  baseMarkerSize?: number;
  maxMarkerSize?: number;
  baseDashedStrokeWidth?: number;
  maxDashedStrokeWidth?: number;
  baseDataLabelFontSize?: number;
  maxDataLabelFontSize?: number;
  baseDataLabelPaddingX?: number;
  maxDataLabelPaddingX?: number;
  baseDataLabelPaddingY?: number;
  maxDataLabelPaddingY?: number;
  baseDataLabelGap?: number;
  maxDataLabelGap?: number;
}): ExpandedChartVisualStyle {
  const primaryDotDiameter = deriveScaledVisualValue(baseDashedStrokeWidth * 2.6, expandedHeightRatio, {
    min: baseDashedStrokeWidth * 2.6,
    max: maxDashedStrokeWidth * 3.4,
    power: 0.35,
  });
  const dotGap = deriveScaledVisualValue(4.8, expandedHeightRatio, { min: 4.8, max: 8.4, power: 0.5 });
  const secondaryDashUnit = deriveScaledVisualValue(4, expandedHeightRatio, { min: 4, max: 7, power: 0.5 });
  return {
    strokeWidth: deriveScaledVisualValue(baseStrokeWidth, expandedHeightRatio, {
      min: baseStrokeWidth,
      max: maxStrokeWidth,
      power: 0.4,
    }),
    markerSize: deriveScaledVisualValue(baseMarkerSize, expandedHeightRatio, {
      min: baseMarkerSize,
      max: maxMarkerSize,
      power: 0.45,
    }),
    dashedStrokeWidth: deriveScaledVisualValue(baseDashedStrokeWidth, expandedHeightRatio, {
      min: baseDashedStrokeWidth,
      max: maxDashedStrokeWidth,
      power: 0.35,
    }),
    primaryDotDiameter,
    primaryDotGap: dotGap,
    primaryDashArray: `0 ${dotGap.toFixed(1)}`,
    secondaryDashArray: `${secondaryDashUnit.toFixed(1)} ${(secondaryDashUnit * 0.75).toFixed(1)}`,
    dataLabelFontSize: deriveScaledVisualValue(baseDataLabelFontSize, expandedHeightRatio, {
      min: baseDataLabelFontSize,
      max: maxDataLabelFontSize,
      power: 0.35,
    }),
    dataLabelPaddingX: deriveScaledVisualValue(baseDataLabelPaddingX, expandedHeightRatio, {
      min: baseDataLabelPaddingX,
      max: maxDataLabelPaddingX,
      power: 0.3,
    }),
    dataLabelPaddingY: deriveScaledVisualValue(baseDataLabelPaddingY, expandedHeightRatio, {
      min: baseDataLabelPaddingY,
      max: maxDataLabelPaddingY,
      power: 0.3,
    }),
    dataLabelGap: deriveScaledVisualValue(baseDataLabelGap, expandedHeightRatio, {
      min: baseDataLabelGap,
      max: maxDataLabelGap,
      power: 0.35,
    }),
  };
}

export function deriveProportionalChartGeometry({
  collapsedPlotHeight,
  collapsedAuxHeight = 0,
  availableHeight,
  baseStrokeWidth = 1.8,
  maxStrokeWidth = 2.8,
  baseMarkerSize = 12,
  maxMarkerSize = 14,
  baseBandMinThickness = 2,
  maxBandMinThickness = 6,
}: {
  collapsedPlotHeight: number;
  collapsedAuxHeight?: number;
  availableHeight: number;
  baseStrokeWidth?: number;
  maxStrokeWidth?: number;
  baseMarkerSize?: number;
  maxMarkerSize?: number;
  baseBandMinThickness?: number;
  maxBandMinThickness?: number;
}): ProportionalChartGeometry {
  const collapsedTotal = Math.max(1, collapsedPlotHeight + collapsedAuxHeight);
  const targetHeight = Math.max(collapsedTotal, Math.round(availableHeight));
  const expandedHeightRatio = targetHeight / collapsedTotal;

  if (collapsedAuxHeight <= 0) {
    return {
      expandedHeightRatio,
      plotHeight: targetHeight,
      auxHeight: 0,
      strokeWidth: deriveScaledVisualValue(baseStrokeWidth, expandedHeightRatio, { min: baseStrokeWidth, max: maxStrokeWidth, power: 0.5 }),
      markerSize: deriveScaledVisualValue(baseMarkerSize, expandedHeightRatio, { min: baseMarkerSize, max: maxMarkerSize, power: 0.45 }),
      bandMinThickness: deriveScaledVisualValue(baseBandMinThickness, expandedHeightRatio, {
        min: baseBandMinThickness,
        max: maxBandMinThickness,
        power: 0.85,
      }),
    };
  }

  const plotShare = collapsedPlotHeight / collapsedTotal;
  const auxShare = collapsedAuxHeight / collapsedTotal;
  const plotHeight = Math.max(collapsedPlotHeight, Math.round(targetHeight * plotShare));
  const auxHeight = Math.max(collapsedAuxHeight, targetHeight - plotHeight);

  return {
    expandedHeightRatio,
    plotHeight,
    auxHeight,
    strokeWidth: deriveScaledVisualValue(baseStrokeWidth, expandedHeightRatio, { min: baseStrokeWidth, max: maxStrokeWidth, power: 0.5 }),
    markerSize: deriveScaledVisualValue(baseMarkerSize, expandedHeightRatio, { min: baseMarkerSize, max: maxMarkerSize, power: 0.45 }),
    bandMinThickness: deriveScaledVisualValue(baseBandMinThickness, expandedHeightRatio, {
      min: baseBandMinThickness,
      max: maxBandMinThickness,
      power: 0.85,
    }),
  };
}

export function deriveLabelGutterOffset({
  plotY,
  plotHeight = 120,
  gutterHeight = 32,
  viewBoxHeight = 42,
}: {
  plotY: number;
  plotHeight?: number;
  gutterHeight?: number;
  viewBoxHeight?: number;
}) {
  return gutterHeight + (plotY / viewBoxHeight) * plotHeight;
}

export function buildPolyline(
  values: number[],
  slotWidth: number,
  height: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (values.length === 0) {
    return '';
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const axisStartPadding = options?.axisStartPadding ?? 0;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);

  return values
    .map((value, index) => {
      const x = deriveSlotCenterX({ index, slotWidth, axisStartPadding });
      const y = topPadding + drawableHeight - ((value - min) / range) * drawableHeight;
      return `${x},${y}`;
    })
    .join(' ');
}

export function buildPointCoordinates(
  values: number[],
  slotWidth: number,
  height: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const axisStartPadding = options?.axisStartPadding ?? 0;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);

  return values.map((value, index) => ({
    x: deriveSlotCenterX({ index, slotWidth, axisStartPadding }),
    y: topPadding + drawableHeight - ((value - min) / range) * drawableHeight,
    value,
  }));
}

export function buildPointCoordinatesWithDomain(
  values: number[],
  slotWidth: number,
  height: number,
  domainMin: number,
  domainMax: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(domainMin, domainMax);
  const max = Math.max(domainMin, domainMax);
  const range = max - min || 1;
  const axisStartPadding = options?.axisStartPadding ?? 0;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);

  return values.map((value, index) => ({
    x: deriveSlotCenterX({ index, slotWidth, axisStartPadding }),
    y: topPadding + drawableHeight - ((value - min) / range) * drawableHeight,
    value,
  }));
}

export function buildPolylineWithDomain(
  values: number[],
  slotWidth: number,
  height: number,
  domainMin: number,
  domainMax: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  return buildPointCoordinatesWithDomain(values, slotWidth, height, domainMin, domainMax, options)
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
}

export function buildTrajectoryBandPath(
  lows: number[],
  highs: number[],
  slotWidth: number,
  height: number,
  domainMin: number,
  domainMax: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
    minVisibleThickness?: number;
  },
) {
  if (lows.length === 0 || highs.length === 0 || lows.length !== highs.length) {
    return '';
  }

  const lowCoordinates = buildPointCoordinatesWithDomain(lows, slotWidth, height, domainMin, domainMax, options);
  const highCoordinates = buildPointCoordinatesWithDomain(highs, slotWidth, height, domainMin, domainMax, options);
  if (lowCoordinates.length === 0 || highCoordinates.length === 0) {
    return '';
  }

  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const minVisibleThickness = options?.minVisibleThickness ?? 2;
  const minY = topPadding;
  const maxY = Math.max(topPadding, height - bottomPadding);

  const visibleBandCoordinates = highCoordinates.map((highPoint, index) => {
    const lowPoint = lowCoordinates[index];
    if (!lowPoint) {
      return { highPoint, lowPoint: highPoint };
    }
    const currentThickness = Math.abs(lowPoint.y - highPoint.y);
    if (currentThickness >= minVisibleThickness) {
      return { highPoint, lowPoint };
    }
    const midpoint = (highPoint.y + lowPoint.y) / 2;
    const adjustedHighY = Math.max(minY, midpoint - minVisibleThickness / 2);
    const adjustedLowY = Math.min(maxY, midpoint + minVisibleThickness / 2);
    return {
      highPoint: { ...highPoint, y: adjustedHighY },
      lowPoint: { ...lowPoint, y: adjustedLowY },
    };
  });

  const upperPath = visibleBandCoordinates.map(({ highPoint }) => `${highPoint.x},${highPoint.y}`).join(' L ');
  const lowerPath = [...visibleBandCoordinates].reverse().map(({ lowPoint }) => `${lowPoint.x},${lowPoint.y}`).join(' L ');
  return `M ${upperPath} L ${lowerPath} Z`;
}

function deriveFlowBarHeight(value: number, maxMagnitude: number, maxHeight: number, minHeight: number) {
  const magnitude = Math.abs(value);
  if (magnitude <= 0 || maxMagnitude <= 0 || maxHeight <= 0) {
    return 0;
  }
  return Math.max(minHeight, (magnitude / maxMagnitude) * maxHeight);
}

export function deriveFlowStackHeights(
  values: {
    serviceDemandMean: number;
    retailDemandMean: number;
    receiptsMean: number;
    adjustmentsMean: number;
  },
  maxMagnitude: number,
  options?: {
    demandMaxHeight?: number;
    supplyMaxHeight?: number;
    minHeight?: number;
  },
) {
  const demandMaxHeight = options?.demandMaxHeight ?? 24;
  const supplyMaxHeight = options?.supplyMaxHeight ?? demandMaxHeight;
  const minHeight = options?.minHeight ?? 2;

  const serviceHeight = deriveFlowBarHeight(values.serviceDemandMean, maxMagnitude, demandMaxHeight, minHeight);
  const retailHeight = deriveFlowBarHeight(values.retailDemandMean, maxMagnitude, demandMaxHeight, minHeight);
  const receiptsHeight = deriveFlowBarHeight(values.receiptsMean, maxMagnitude, supplyMaxHeight, minHeight);
  const adjustmentHeight = deriveFlowBarHeight(values.adjustmentsMean, maxMagnitude, supplyMaxHeight, minHeight);

  return {
    demand: {
      serviceHeight,
      retailHeight,
      retailOffset: serviceHeight,
    },
    supply: {
      receiptsHeight,
      adjustmentHeight,
      adjustmentOffset: receiptsHeight,
    },
  };
}

function buildSparsePointCoordinates(
  markers: Array<{ intervalIndex: number; price: number }>,
  intervalIndices: number[],
  slotWidth: number,
  height: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (markers.length === 0) {
    return [];
  }

  const intervalPosition = new Map(intervalIndices.map((value, index) => [value, index]));
  const values = markers.map((marker) => marker.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const axisStartPadding = options?.axisStartPadding ?? 0;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);

  return markers
    .map((marker) => {
      const position = intervalPosition.get(marker.intervalIndex);
      if (position == null) {
        return null;
      }
      return {
        intervalIndex: marker.intervalIndex,
        price: marker.price,
        x: deriveSlotCenterX({ index: position, slotWidth, axisStartPadding }),
        y: topPadding + drawableHeight - ((marker.price - min) / range) * drawableHeight,
      };
    })
    .filter((point): point is { intervalIndex: number; price: number; x: number; y: number } => point != null);
}

export function buildSparsePolylineSegments(
  markers: Array<{ intervalIndex: number; price: number }>,
  intervalIndices: number[],
  slotWidth: number,
  height: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  const points = buildSparsePointCoordinates(markers, intervalIndices, slotWidth, height, options);
  if (points.length === 0) {
    return { points: [], segments: [] as string[] };
  }

  const intervalPosition = new Map(intervalIndices.map((value, index) => [value, index]));
  const segments: string[] = [];
  let currentSegment: string[] = [];
  let previousPosition: number | null = null;

  for (const point of points) {
    const position = intervalPosition.get(point.intervalIndex) ?? null;
    if (position == null) {
      continue;
    }
    if (previousPosition != null && position !== previousPosition + 1) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment.join(' '));
      }
      currentSegment = [];
    }
    currentSegment.push(`${point.x},${point.y}`);
    previousPosition = position;
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment.join(' '));
  }

  return { points, segments };
}

export function SelectedIntervalColumnOverlay({
  activeIndex,
  axisContentWidth,
  axisStartPadding,
  axisEndPadding,
  itemCount,
  slotWidth,
  className,
}: {
  activeIndex: number | null;
  axisContentWidth: number;
  axisStartPadding: number;
  axisEndPadding: number;
  itemCount: number;
  slotWidth: number;
  className?: string;
}) {
  if (activeIndex == null || itemCount <= 0) {
    return null;
  }

  const left = deriveSlotLeftX({ index: activeIndex, slotWidth, axisStartPadding });

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-y-0 rounded-[1rem] border border-foreground/10 bg-foreground/[0.05]', className)}
      data-selected-interval-column="true"
      style={{
        left,
        width: slotWidth,
        maxWidth: Math.max(0, axisContentWidth - axisStartPadding - axisEndPadding),
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/15" />
    </div>
  );
}
